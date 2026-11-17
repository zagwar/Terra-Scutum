import type { CalendarDate } from './calendar';
import type { GameState } from './game-state';
import { type BuildingsState, ensureBuildingsReport } from '../economy/buildings';
import { ensurePopulationReport } from '../economy/population';

/**
 * What the sim worker sends to the game after ticks and commands: a small,
 * plain-data view of the state for the UI and renderer. It must be cheap to
 * build and to send (structured clone); per-province numbers travel as typed
 * arrays, and only when they changed. Later features add their slices here.
 */
export interface SimSnapshot {
  /** Whole days since the campaign's start date. */
  readonly day: number;
  /** Today's calendar date. */
  readonly date: CalendarDate;
  /** The country (index) the player leads (F05). */
  readonly playerCountry: number;
  /** Goes up every time a province changes owner. */
  readonly ownershipVersion: number;
  /**
   * The country (index) that owns each province. Left out when the receiver
   * already has these owners (see `SnapshotKnown`): keep the last one received.
   */
  readonly provinceOwner?: Uint16Array;
  /** Goes up every time the population's numbers change (F06). */
  readonly populationVersion: number;
  /**
   * The population (F06). Left out when the receiver already has the numbers
   * of this `populationVersion`: keep the last one received.
   */
  readonly population?: PopulationSnapshot;
  /** Goes up every time the buildings' numbers change (F07). */
  readonly buildingsVersion: number;
  /**
   * The buildings (F07). Left out when the receiver already has the numbers
   * of this `buildingsVersion`: keep the last one received.
   */
  readonly buildings?: BuildingsSnapshot;
}

/**
 * The buildings as the game shows them (F07): copies of the sim's numbers,
 * as the buildings run today. The per-building arrays have one entry per
 * building, in the order of `cells`; the per-country ones hold the good g of
 * country c at `c * goodCount + g`.
 */
export interface BuildingsSnapshot {
  readonly typeCount: number;
  readonly goodCount: number;
  /** Where each building is: `province * typeCount + type`, in rising order. */
  readonly cells: Int32Array;
  readonly level: Uint16Array;
  /** Each building's production method (an index into its type's `methods`). */
  readonly method: Uint8Array;
  /** Output as a share of full output, and the share of the jobs filled as the scarcest pop group allows (0–1). */
  readonly output: Float32Array;
  readonly staffing: Float32Array;
  /** People at work, and the wages paid them (US$ a day). */
  readonly workers: Float32Array;
  readonly wages: Float32Array;
  /** What holds the building back most (`BUILDING_LIMIT`), and which pop group or good. */
  readonly limitKind: Uint8Array;
  readonly limitWhat: Uint8Array;
  /** Per province: the jobs its buildings offer and the people at work in them. */
  readonly provinceJobs: Float64Array;
  readonly provinceWorkers: Float64Array;
  /** Per country and good: in the national stockpile, made and used in a day, and the most the stockpile keeps. */
  readonly stock: Float64Array;
  readonly made: Float64Array;
  readonly used: Float64Array;
  readonly stockLimit: Float64Array;
  /** Per country and good: the standing imports that arrive every day (a stand-in until trade, F19). */
  readonly imports: Float64Array;
  /** Per country: the electricity the rest of the economy and homes asked for today, and what they got (MWh). */
  readonly otherPowerWanted: Float64Array;
  readonly otherPowerUsed: Float64Array;
}

/**
 * The population as the game shows it (F06): copies of the sim's numbers.
 * Per-pop arrays hold the pop of group g in province p at
 * `p * groupCount + g`; per-country ones the same way by country.
 */
export interface PopulationSnapshot {
  readonly groupCount: number;
  /** Per province: everyone, the dependents among them, the people with a job, the average standard of living (0–100). */
  readonly provincePopulation: Float64Array;
  readonly provinceDependents: Float64Array;
  readonly provinceEmployed: Float64Array;
  readonly provinceStandardOfLiving: Float32Array;
  /** Per province and need tier (basic, everyday, luxury): how much of it people can afford, 0–1. */
  readonly provinceNeeds: Float32Array;
  /** Per pop: people, people with a job, the wage (US$ per worker per day), the standard of living (0–100). */
  readonly popSize: Float32Array;
  readonly popEmployed: Float32Array;
  readonly popWage: Float32Array;
  readonly popStandardOfLiving: Float32Array;
  /** Per country (the provinces it owns now): everyone, and the dependents among them. */
  readonly countryPopulation: Float64Array;
  readonly countryDependents: Float64Array;
  /** Per country and pop group: people, people with a job, average wage (US$ per day), standard of living (0–100). */
  readonly countryGroupSize: Float64Array;
  readonly countryGroupEmployed: Float64Array;
  readonly countryGroupWage: Float64Array;
  readonly countryGroupStandardOfLiving: Float32Array;
  /** Per country, pop group and need tier: how much of the tier the group can afford, 0–1. */
  readonly countryGroupNeeds: Float32Array;
}

/** What the receiver of a snapshot already has, so unchanged parts aren't sent again. */
export interface SnapshotKnown {
  /** The `ownershipVersion` of the owners the receiver holds. */
  readonly ownershipVersion: number;
  /** The `populationVersion` of the population the receiver holds. */
  readonly populationVersion: number;
  /** The `buildingsVersion` of the buildings the receiver holds. */
  readonly buildingsVersion: number;
}

/**
 * Builds a snapshot. Pass what the receiver already has (usually: the last
 * snapshot sent) to leave out the parts that haven't changed since; without
 * it, the snapshot is complete.
 */
export function createSnapshot(state: GameState, known?: SnapshotKnown): SimSnapshot {
  const ownersChanged = !known || known.ownershipVersion !== state.ownershipVersion;
  const population = ensurePopulationReport(state);
  const populationChanged = !known || known.populationVersion !== population.version;
  const buildings = ensureBuildingsReport(state);
  const buildingsChanged = !known || known.buildingsVersion !== buildings.version;
  return {
    day: state.day,
    date: state.date,
    playerCountry: state.playerCountry,
    ownershipVersion: state.ownershipVersion,
    // A copy: the sim keeps changing its own array.
    ...(ownersChanged ? { provinceOwner: state.provinceOwner.slice() } : {}),
    populationVersion: population.version,
    ...(populationChanged
      ? {
          population: {
            groupCount: population.groupCount,
            provincePopulation: population.provincePopulation.slice(),
            provinceDependents: population.dependents.slice(),
            provinceEmployed: population.provinceEmployed.slice(),
            provinceStandardOfLiving: population.provinceStandardOfLiving.slice(),
            provinceNeeds: population.provinceNeeds.slice(),
            popSize: Float32Array.from(population.size),
            popEmployed: Float32Array.from(population.employed),
            popWage: Float32Array.from(population.wage),
            popStandardOfLiving: population.standardOfLiving.slice(),
            countryPopulation: population.countryPopulation.slice(),
            countryDependents: population.countryDependents.slice(),
            countryGroupSize: population.countryGroupSize.slice(),
            countryGroupEmployed: population.countryGroupEmployed.slice(),
            countryGroupWage: population.countryGroupWage.slice(),
            countryGroupStandardOfLiving: population.countryGroupStandardOfLiving.slice(),
            countryGroupNeeds: population.countryGroupNeeds.slice(),
          },
        }
      : {}),
    buildingsVersion: buildings.version,
    ...(buildingsChanged ? { buildings: buildingsSnapshot(buildings) } : {}),
  };
}

function buildingsSnapshot(buildings: BuildingsState): BuildingsSnapshot {
  const count = buildings.cellCount;
  const cells = buildings.cells.slice(0, count);
  const level = new Uint16Array(count);
  const method = new Uint8Array(count);
  const output = new Float32Array(count);
  const staffing = new Float32Array(count);
  const workers = new Float32Array(count);
  const wages = new Float32Array(count);
  const limitKind = new Uint8Array(count);
  const limitWhat = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const cell = cells[i];
    level[i] = buildings.level[cell];
    method[i] = buildings.method[cell];
    output[i] = buildings.output[cell];
    staffing[i] = buildings.staffing[cell];
    workers[i] = buildings.workers[cell];
    wages[i] = buildings.wages[cell];
    limitKind[i] = buildings.limitKind[cell];
    limitWhat[i] = buildings.limitWhat[cell];
  }
  const { capacityUse, capacityMake, maxDays } = buildings;
  return {
    typeCount: buildings.typeCount,
    goodCount: buildings.goodCount,
    cells,
    level,
    method,
    output,
    staffing,
    workers,
    wages,
    limitKind,
    limitWhat,
    provinceJobs: buildings.provinceJobs.slice(),
    provinceWorkers: buildings.provinceWorkers.slice(),
    stock: buildings.stock.slice(),
    made: buildings.made.slice(),
    used: buildings.used.slice(),
    stockLimit: Float64Array.from(
      capacityUse,
      (use, m) => maxDays * Math.max(use, capacityMake[m]),
    ),
    imports: buildings.imports.slice(),
    otherPowerWanted: buildings.otherPowerWanted.slice(),
    otherPowerUsed: buildings.otherPowerUsed.slice(),
  };
}
