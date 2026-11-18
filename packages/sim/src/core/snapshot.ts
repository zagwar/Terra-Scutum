import type { CalendarDate } from './calendar';
import type { GameState } from './game-state';
import { type BuildingsState, recipeOf } from '../economy/buildings';
import { ensureBuildingsReport } from '../economy/economy';
import { HISTORY_WEEKS, type MarketState, reserveCap } from '../economy/market';
import { ensurePopulationReport } from '../economy/population';
import type { TradeState } from '../economy/trade';

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
  /**
   * The markets (F65), sent together with the buildings (they share the
   * day's report and `buildingsVersion`).
   */
  readonly market?: MarketSnapshot;
  /** Trade between the markets (F19), sent together with the buildings and the markets. */
  readonly trade?: TradeSnapshot;
}

/**
 * Trade as the game shows it (F19): the World Market, every country's
 * imports and exports (per country and good at `c * goodCount + g`), and the
 * player's country's partners.
 */
export interface TradeSnapshot {
  readonly goodCount: number;
  readonly countryCount: number;
  /** Per good: 1 if it can be traded. */
  readonly tradable: Uint8Array;
  /** Per good: the world price, what the rest of the world sells a day, the share of the planned imports that arrived today. */
  readonly worldPrice: Float64Array;
  readonly restOfWorld: Float64Array;
  readonly delivered: Float64Array;
  /** The world prices of the last weeks, oldest first: `historyWeeks` per good (`g * historyWeeks + week`). */
  readonly worldHistory: Float32Array;
  readonly historyWeeks: number;
  /** Per country and good: imports and exports a day (this week's plan), their values a day (US$), and what a unit of imports costs delivered. */
  readonly imports: Float64Array;
  readonly exports: Float64Array;
  readonly importValue: Float64Array;
  readonly exportValue: Float64Array;
  readonly landed: Float64Array;
  /** Per country: its tariff income a day (US$). */
  readonly tariffIncome: Float64Array;
  /** The country the partner numbers below are for (the player's). */
  readonly country: number;
  /** Per good and exporter (`g * (countryCount + 1) + e`; the rest of the world last): what the country buys from it a day. */
  readonly fromPartner: Float32Array;
  /** Per good and importer (`g * countryCount + i`): what the country sells to it a day. */
  readonly toPartner: Float32Array;
  /** Per partner: shipping from its capital to the country's (US$ per tonne), and the route's km on land and at sea. */
  readonly shipping: Float32Array;
  readonly landKm: Float32Array;
  readonly seaKm: Float32Array;
  /** Per partner: 1 if it has an embargo with the country, 1 if a trade agreement. */
  readonly embargo: Uint8Array;
  readonly agreement: Uint8Array;
  /** The country's tariffs, as a share of the base price. */
  readonly importTariff: number;
  readonly exportTariff: number;
  /** The rest of the world's shipping, as a share of the base price. */
  readonly restOfWorldShipping: number;
}

/**
 * The markets as the game shows them (F65). Per country and good at
 * `c * goodCount + g`.
 */
export interface MarketSnapshot {
  readonly goodCount: number;
  /** Each good's base price (US$ per unit). */
  readonly basePrice: Float64Array;
  /** This week's prices. */
  readonly price: Float64Array;
  /** Today: sell orders (made + imported; electricity: what the plants could make) and buy orders (everyone). */
  readonly sell: Float64Array;
  readonly buy: Float64Array;
  /** Today: what the pops, the rest of the economy and (F19) the exporters wanted, and what they got. */
  readonly popOrder: Float64Array;
  readonly popGot: Float64Array;
  readonly restOrder: Float64Array;
  readonly restGot: Float64Array;
  readonly exportOrder: Float64Array;
  readonly exportGot: Float64Array;
  /** Today: what the buildings asked for (their buy orders), and what was lost over the stockpile's limit. */
  readonly buildingOrder: Float64Array;
  readonly lost: Float64Array;
  /** Per country: the share of its pops' goods that went undelivered last week (0–1). */
  readonly shortage: Float32Array;
  /** The player's country's prices of the last weeks, oldest first: `historyWeeks` per good (`g * historyWeeks + week`). */
  readonly history: Float32Array;
  readonly historyWeeks: number;
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
  /** F65: today's sales and input costs (US$), the wage level (× the going wage), the share of jobs kept open, the cash reserves (US$) and the most they hold. */
  readonly revenue: Float32Array;
  readonly inputCost: Float32Array;
  readonly wageFactor: Float32Array;
  readonly open: Float32Array;
  readonly reserves: Float32Array;
  readonly reserveCap: Float32Array;
  /** F65: 1 where the building is a subsistence one (its workers share what it makes). */
  readonly subsistence: Uint8Array;
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
  /** Per country and good: the imports that arrived this morning (trade, F19). */
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
  /** Per province: everyone, the dependents among them, the people with a job, the average standard of living (1–99). */
  readonly provincePopulation: Float64Array;
  readonly provinceDependents: Float64Array;
  readonly provinceEmployed: Float64Array;
  readonly provinceStandardOfLiving: Float32Array;
  /**
   * Per pop: people, people with a job, the going wage (US$ per worker per
   * day), the standard of living (1–99), and (F65) the wealth (1–99), the
   * standard of living it expects and last week's income (US$ per worker per day).
   */
  readonly popSize: Float32Array;
  readonly popEmployed: Float32Array;
  readonly popWage: Float32Array;
  readonly popStandardOfLiving: Float32Array;
  readonly popWealth: Float32Array;
  readonly popExpected: Float32Array;
  readonly popIncome: Float32Array;
  /** Per country (the provinces it owns now): everyone, and the dependents among them. */
  readonly countryPopulation: Float64Array;
  readonly countryDependents: Float64Array;
  /** Per country and pop group: people, people with a job, average going wage (US$ per day), standard of living (1–99), income last week (US$ per worker per day). */
  readonly countryGroupSize: Float64Array;
  readonly countryGroupEmployed: Float64Array;
  readonly countryGroupWage: Float64Array;
  readonly countryGroupStandardOfLiving: Float32Array;
  readonly countryGroupIncome: Float64Array;
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
            popSize: Float32Array.from(population.size),
            popEmployed: Float32Array.from(population.employed),
            popWage: Float32Array.from(population.wage),
            popStandardOfLiving: population.standardOfLiving.slice(),
            popWealth: Float32Array.from(population.wealth),
            popExpected: population.expectedLiving.slice(),
            popIncome: Float32Array.from(population.income),
            countryPopulation: population.countryPopulation.slice(),
            countryDependents: population.countryDependents.slice(),
            countryGroupSize: population.countryGroupSize.slice(),
            countryGroupEmployed: population.countryGroupEmployed.slice(),
            countryGroupWage: population.countryGroupWage.slice(),
            countryGroupStandardOfLiving: population.countryGroupStandardOfLiving.slice(),
            countryGroupIncome: population.countryGroupIncome.slice(),
          },
        }
      : {}),
    buildingsVersion: buildings.version,
    ...(buildingsChanged
      ? {
          buildings: buildingsSnapshot(state, buildings),
          market: marketSnapshot(state.market, buildings, state.playerCountry),
          trade: tradeSnapshot(state.trade, state.playerCountry),
        }
      : {}),
  };
}

function marketSnapshot(
  market: MarketState,
  buildings: BuildingsState,
  country: number,
): MarketSnapshot {
  const goods = market.goodCount;
  const weeks = market.historyCount;
  const history = new Float32Array(goods * weeks);
  // The ring holds the last weeks; the oldest is at `historyNext` once it is full.
  const first = weeks < HISTORY_WEEKS ? 0 : market.historyNext;
  for (let g = 0; g < goods; g++) {
    const base = (country * goods + g) * HISTORY_WEEKS;
    for (let w = 0; w < weeks; w++)
      history[g * weeks + w] = market.history[base + ((first + w) % HISTORY_WEEKS)];
  }
  return {
    goodCount: goods,
    basePrice: market.basePrice.slice(),
    price: market.price.slice(),
    sell: market.sell.slice(),
    buy: market.buy.slice(),
    popOrder: market.popOrder.slice(),
    popGot: market.popGot.slice(),
    restOrder: market.restOrder.slice(),
    restGot: market.restGot.slice(),
    exportOrder: market.exportOrder.slice(),
    exportGot: market.exportGot.slice(),
    buildingOrder: buildings.ordered.slice(),
    lost: market.lost.slice(),
    shortage: market.shortage.slice(),
    history,
    historyWeeks: weeks,
  };
}

function tradeSnapshot(trade: TradeState, country: number): TradeSnapshot {
  const goods = trade.goodCount;
  const n = trade.countryCount;
  const weeks = trade.historyCount;
  const worldHistory = new Float32Array(goods * weeks);
  const first = weeks < HISTORY_WEEKS ? 0 : trade.historyNext;
  for (let g = 0; g < goods; g++)
    for (let w = 0; w < weeks; w++)
      worldHistory[g * weeks + w] = trade.history[g * HISTORY_WEEKS + ((first + w) % HISTORY_WEEKS)];
  const fromPartner = new Float32Array(goods * (n + 1));
  const toPartner = new Float32Array(goods * n);
  for (let g = 0; g < goods; g++) {
    const at = g * (n + 1) * n;
    for (let e = 0; e <= n; e++) fromPartner[g * (n + 1) + e] = trade.flows[at + e * n + country];
    for (let i = 0; i < n; i++) toPartner[g * n + i] = trade.flows[at + country * n + i];
  }
  const shipping = new Float32Array(n);
  const landKm = new Float32Array(n);
  const seaKm = new Float32Array(n);
  const embargo = new Uint8Array(n);
  const agreement = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    shipping[p] = trade.shipping[p * n + country];
    landKm[p] = trade.landKm[p * n + country];
    seaKm[p] = trade.seaKm[p * n + country];
    embargo[p] = trade.embargo[p * n + country];
    agreement[p] = trade.agreement[p * n + country];
  }
  return {
    goodCount: goods,
    countryCount: n,
    tradable: trade.tradable.slice(),
    worldPrice: trade.worldPrice.slice(),
    restOfWorld: trade.restOfWorld.slice(),
    delivered: trade.delivered.slice(),
    worldHistory,
    historyWeeks: weeks,
    imports: trade.imports.slice(),
    exports: trade.exports.slice(),
    importValue: trade.importValue.slice(),
    exportValue: trade.exportValue.slice(),
    landed: trade.landed.slice(),
    tariffIncome: trade.tariffIncome.slice(),
    country,
    fromPartner,
    toPartner,
    shipping,
    landKm,
    seaKm,
    embargo,
    agreement,
    importTariff: trade.importTariff[country],
    exportTariff: trade.exportTariff[country],
    restOfWorldShipping: trade.restOfWorldShipping,
  };
}

function buildingsSnapshot(state: GameState, buildings: BuildingsState): BuildingsSnapshot {
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
  const revenue = new Float32Array(count);
  const inputCost = new Float32Array(count);
  const wageFactor = new Float32Array(count);
  const open = new Float32Array(count);
  const reserves = new Float32Array(count);
  const cap = new Float32Array(count);
  const subsistence = new Uint8Array(count);
  const reserveDays = state.data.market.buildings.reserveDays;
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
    revenue[i] = buildings.revenue[cell];
    inputCost[i] = buildings.inputCost[cell];
    wageFactor[i] = buildings.wageFactor[cell];
    open[i] = buildings.open[cell];
    reserves[i] = buildings.reserves[cell];
    cap[i] = reserveCap(buildings, state.population, cell, reserveDays);
    subsistence[i] = buildings.recipeSubsistence[recipeOf(buildings, cell)];
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
    revenue,
    inputCost,
    wageFactor,
    open,
    reserves,
    reserveCap: cap,
    subsistence,
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
