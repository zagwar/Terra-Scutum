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
import { type WorldMap, buildWorldMap } from '../world/world-map';

export interface GameStateOptions {
  /** The validated game data (see `parseGameData`). */
  readonly data: GameData;
  /** Seed for the run. The same seed, data and commands always give the same campaign. */
  readonly seed: number;
  /** Which systems to run; defaults to the game's systems. Tests pass their own. */
  readonly systems?: SystemRegistry;
  /** Used by the save system to continue a saved game. */
  readonly restore?: { readonly day: number; readonly rngState: RngState };
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
  readonly seed: number;
  /** The single source of randomness for the sim. */
  readonly rng: Rng;
  /** Whole days since the campaign's start date. Day 0 is the start date itself. */
  day: number;
  /** Sim events since the host last called `drainEvents()`. */
  readonly events: SimEvent[] = [];

  private readonly startEpochDay: number;
  private readonly pipeline: readonly PipelineStep[];
  private profileClock: (() => number) | null = null;
  private readonly profileMs = new Float64Array(TICK_ORDER.length);

  constructor(options: GameStateOptions) {
    this.data = options.data;
    this.world = buildWorldMap(options.data);
    this.seed = options.seed >>> 0;
    this.startEpochDay = dateToEpochDay(options.data.gameConfig.startDate);

    if (options.restore) {
      this.day = options.restore.day;
      this.rng = Rng.fromState(options.restore.rngState);
    } else {
      this.day = 0;
      this.rng = Rng.fromSeed(this.seed);
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
