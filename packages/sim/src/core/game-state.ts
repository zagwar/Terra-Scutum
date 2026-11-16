import type { GameData } from '../data/game-data';
import {
  type CalendarDate,
  MONDAY,
  dateToEpochDay,
  dayOfWeekOfEpochDay,
  epochDayToDate,
} from './calendar';
import { type CommandResult, type SimCommand, applyCommand } from './commands';
import type { SimEvent } from './events';
import { Rng, type RngState } from './rng';
import { SYSTEMS, type SimSystem, type SystemId, type SystemRegistry, TICK_ORDER } from './systems';
import { startingOwners } from '../world/ownership';
import { type CountryStartTable, buildCountryStartTable } from '../world/country-start';
import { type WorldMap, buildWorldMap } from '../world/world-map';
import {
  type PopulationRestore,
  type PopulationState,
  createPopulation,
  restorePopulation,
} from '../economy/population';

export interface GameStateOptions {
  /** The validated game data (see `parseGameData`). */
  readonly data: GameData;
  /** Seed for the run. The same seed, data and commands always give the same campaign. */
  readonly seed: number;
  /** Which systems to run; defaults to the game's systems. Tests pass their own. */
  readonly systems?: SystemRegistry;
  /** Used by the save system to continue a saved game. */
  readonly restore?: {
    readonly day: number;
    readonly rngState: RngState;
    /** Owner (country index) of every province. */
    readonly provinceOwner: Uint16Array;
    /** The country (index) the player leads. */
    readonly playerCountry: number;
    /** The population (F06): dependents per province, size and jobs per pop. */
    readonly population: PopulationRestore;
  };
}

interface PipelineStep {
  readonly id: SystemId;
  readonly index: number;
  readonly system: SimSystem;
}

/**
 * The whole state of one campaign. Owned by the sim worker in the game and by
 * the campaign runner in tests. Changed only by `advanceDay()` and `applyCommand()`.
 */
export class GameState {
  readonly data: GameData;
  /** Fast numeric lookups over the map (provinces, countries, regions, sea zones). */
  readonly world: WorldMap;
  /**
   * Each country's real-world starting data (population, GDP, government
   * type), by country index. Fixed for now: it becomes the starting point of
   * living values once population, the economy and politics are simulated.
   */
  readonly countryStart: CountryStartTable;
  readonly seed: number;
  /** The single source of randomness for the sim. */
  readonly rng: Rng;
  /** Whole days since the campaign's start date. Day 0 is the start date itself. */
  day: number;
  /**
   * The country (index, see `world.countryIds`) that owns each province right
   * now. Read it freely; change it only through `setProvinceOwner`.
   */
  readonly provinceOwner: Uint16Array;
  /**
   * The country (index) the player leads (F05). A new campaign starts with
   * `playerCountry` from `data/game_config.json`; the player chooses another
   * with the `choosePlayerCountry` command before the first day is simulated.
   * The sim treats every country alike; the hosts use this to know whose
   * country the UI shows as "mine" (and, later, which one the AI leaves alone).
   */
  playerCountry: number;
  /**
   * The people (F06, section 8.1): dependents and pops per province, their
   * jobs, wages and standard of living. Changed by the population system;
   * read its report through `ensurePopulationReport`.
   */
  readonly population: PopulationState;
  /** Goes up by one every time a province changes owner, so hosts know when to resend the owners. */
  ownershipVersion = 0;
  /** Sim events since the host last called `drainEvents()`. */
  readonly events: SimEvent[] = [];

  private readonly startEpochDay: number;
  private readonly pipeline: readonly PipelineStep[];
  private profileClock: (() => number) | null = null;
  private readonly profileMs = new Float64Array(TICK_ORDER.length);

  constructor(options: GameStateOptions) {
    this.data = options.data;
    this.world = buildWorldMap(options.data);
    this.countryStart = buildCountryStartTable(options.data.countryStart, this.world);
    this.seed = options.seed >>> 0;
    this.startEpochDay = dateToEpochDay(options.data.gameConfig.startDate);
    this.population = createPopulation(options.data, this.world, this.countryStart);

    if (options.restore) {
      this.day = options.restore.day;
      this.rng = Rng.fromState(options.restore.rngState);
      if (options.restore.provinceOwner.length !== this.world.provinceIds.length)
        throw new Error('GameState: the restored owners do not match the number of provinces');
      this.provinceOwner = options.restore.provinceOwner.slice();
      if (!this.world.countryIds[options.restore.playerCountry])
        throw new Error('GameState: the restored player country is not a country');
      this.playerCountry = options.restore.playerCountry;
      restorePopulation(this.population, options.restore.population);
    } else {
      this.day = 0;
      this.rng = Rng.fromSeed(this.seed);
      this.provinceOwner = startingOwners(this.world);
      // The data checks make sure `playerCountry` is a country (`checkPlayerCountry`).
      this.playerCountry = this.world.countryIndex.get(options.data.gameConfig.playerCountry) ?? 0;
    }

    const systems = options.systems ?? SYSTEMS;
    const pipeline: PipelineStep[] = [];
    TICK_ORDER.forEach((id, index) => {
      const system = systems[id];
      if (system) pipeline.push({ id, index, system });
    });
    this.pipeline = pipeline;
  }

  /** Today's calendar date. */
  get date(): CalendarDate {
    return epochDayToDate(this.startEpochDay + this.day);
  }

  /** True if today is a Monday, the day the weekly calculations run. */
  get isWeeklyTickDay(): boolean {
    return dayOfWeekOfEpochDay(this.startEpochDay + this.day) === MONDAY;
  }

  /**
   * Simulates the current day: runs every system in the fixed tick order
   * (weekly calculations too on Mondays), then moves to the next day.
   */
  advanceDay(): void {
    const weekly = this.isWeeklyTickDay;
    const pipeline = this.pipeline;
    const clock = this.profileClock;

    for (let i = 0; i < pipeline.length; i++) {
      const step = pipeline[i];
      const system = step.system;
      const startedAt = clock ? clock() : 0;
      if (weekly && system.weekly) system.weekly(this);
      if (system.daily) system.daily(this);
      if (clock) this.profileMs[step.index] += clock() - startedAt;
    }

    this.day += 1;
  }

  /** Applies a command from the player or an AI. See `SimCommand`. */
  applyCommand(command: SimCommand): CommandResult {
    return applyCommand(this, command);
  }

  /**
   * Gives a province (index) to a country (index) and reports it with a
   * `provinceOwnerChanged` event. Does nothing if that country already owns it.
   * Wars, the Swarm and collapsing countries all move provinces through here.
   */
  setProvinceOwner(province: number, country: number): void {
    const world = this.world;
    if (!Number.isInteger(province) || province < 0 || province >= world.provinceIds.length)
      throw new Error(`setProvinceOwner: no province with index ${province}`);
    if (!Number.isInteger(country) || country < 0 || country >= world.countryIds.length)
      throw new Error(`setProvinceOwner: no country with index ${country}`);
    const previous = this.provinceOwner[province];
    if (previous === country) return;
    this.provinceOwner[province] = country;
    this.ownershipVersion += 1;
    this.emit({
      type: 'provinceOwnerChanged',
      province: world.provinceIds[province],
      from: world.countryIds[previous],
      to: world.countryIds[country],
    });
  }

  /** Called by systems and command handlers to report something that happened. */
  emit(event: SimEvent): void {
    this.events.push(event);
  }

  /** Returns the events collected so far and clears the list. */
  drainEvents(): SimEvent[] {
    return this.events.splice(0, this.events.length);
  }

  /**
   * Turns on per-system timing. The host passes its clock (for example
   * `performance.now`) because the sim itself never reads the time.
   */
  enableProfiling(clock: () => number): void {
    this.profileClock = clock;
    this.profileMs.fill(0);
  }

  /** Total milliseconds spent in each system since profiling was turned on (systems that exist only). */
  getSystemTimings(): { id: SystemId; totalMs: number }[] {
    return this.pipeline.map((step) => ({
      id: step.id,
      totalMs: this.profileMs[step.index],
    }));
  }
}
