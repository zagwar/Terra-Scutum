import type { GameState } from '../core/game-state';
import type { SimSystem, SystemRegistry } from '../core/systems';
import type { GameData } from '../data/game-data';
import type { WorldMap } from '../world/world-map';
import { BUILDING_STAGES } from './buildings-data';
import { type BuildingsState, ensureLayout, prepareDay, recipeOf, runStage } from './buildings';
import {
  type MarketState,
  computeOrders,
  marketDay,
  marketWeek,
  reserveCap,
  unitEconomics,
  updateShares,
  updateWealth,
} from './market';
import { type PopulationState, ensurePopulationReport } from './population';
import { type TradeState, settleStartingTrade, tradeDay, tradeWeek } from './trade';

/**
 * The economy's day (F07, F85, F65, F19): the buildings' three production
 * steps (energy, resourceProduction, industry), then the market (the pops,
 * the rest of the economy and the exporters buy; on Mondays first the
 * week's prices, wages, dividends and wealth), then trade (`trade.ts`). This module ties `buildings.ts` and `market.ts`
 * together, runs the report's trial day and sets up the markets at the
 * start of a campaign (`calibrateMarkets`).
 */

/** The start of a day: everyone's buy orders, then who works where and the electricity asked for. */
function startDay(
  population: PopulationState,
  buildings: BuildingsState,
  market: MarketState,
  provinceOwner: Uint16Array,
  data: GameData,
): void {
  computeOrders(market, population, provinceOwner);
  prepareDay(
    buildings,
    population,
    provinceOwner,
    market.popPower,
    data.market.buildings.switchForMorePay,
  );
}

/** A whole day of production and buying on `stock` (the report's trial run uses a copy). */
function wholeDay(
  population: PopulationState,
  buildings: BuildingsState,
  market: MarketState,
  provinceOwner: Uint16Array,
  data: GameData,
  stock: Float64Array,
): void {
  startDay(population, buildings, market, provinceOwner, data);
  for (let stage = 0; stage < BUILDING_STAGES.length; stage++)
    runStage(buildings, stage, stock, provinceOwner, market.price, population.groupCount);
  marketDay(market, buildings, population, stock, false);
}

/** Runs one production step on the real stockpiles (the first step prepares the day). */
function produce(state: GameState, stage: number): void {
  const { buildings, population, market } = state;
  if (stage === 0) {
    ensureLayout(buildings, state.provinceOwner, state.ownershipVersion);
    startDay(population, buildings, market, state.provinceOwner, state.data);
  }
  runStage(
    buildings,
    stage,
    buildings.stock,
    state.provinceOwner,
    market.price,
    population.groupCount,
  );
  buildings.changes += 1;
}

const stageSystem = (stage: number): SimSystem => ({
  daily(state) {
    produce(state, stage);
  },
});

/** The market step (tick slot `market`): on Mondays the week first, then the day's buying. */
export const marketSystem: SimSystem = {
  weekly(state) {
    marketWeek(state.market, state.buildings, state.population, state.provinceOwner, state.data);
  },
  daily(state) {
    marketDay(state.market, state.buildings, state.population, state.buildings.stock, true);
    state.buildings.changes += 1;
  },
};

/**
 * The trade step (tick slot `trade`, F19): on Mondays first the week (new
 * plans, world prices, partners, reference prices), then the day (what was
 * shipped reaches the World Market and is shared among importers).
 */
export const tradeSystem: SimSystem = {
  weekly(state) {
    tradeWeek(state.trade, state.market, state.buildings, state.data);
    state.buildings.changes += 1;
  },
  daily(state) {
    tradeDay(state.trade, state.market, state.buildings);
    state.buildings.changes += 1;
  },
};

/**
 * The economy's systems: the three production steps, each in its slot of
 * the tick (energy, resourceProduction, industry), the market and trade.
 * They belong together: the first prepares the day for the others.
 */
export const economySystems: SystemRegistry = {
  energy: stageSystem(0),
  resourceProduction: stageSystem(1),
  industry: stageSystem(2),
  market: marketSystem,
  trade: tradeSystem,
};

/**
 * Makes sure the buildings' and the market's report matches the state;
 * redoes it if not. The report is **what happens today, from the state as
 * it is**: a trial run of the day's production and buying on a copy of the
 * stockpiles. So a campaign continued from a save shows the same numbers,
 * and a new game shows them before the first day. Everything that reads the
 * report (the snapshot, later systems) calls this first.
 */
export function ensureBuildingsReport(state: GameState): BuildingsState {
  const { buildings, market } = state;
  const population = ensurePopulationReport(state);
  if (
    buildings.reportChanges === buildings.changes &&
    buildings.reportPopulationVersion === population.version &&
    buildings.reportOwnershipVersion === state.ownershipVersion
  )
    return buildings;

  ensureLayout(buildings, state.provinceOwner, state.ownershipVersion);
  const trial = buildings.trialStock;
  trial.set(buildings.stock);
  wholeDay(population, buildings, market, state.provinceOwner, state.data, trial);

  const { cells, level, open, recipeJobs, typeCount, provinceJobs, provinceWorkers } = buildings;
  provinceJobs.fill(0);
  provinceWorkers.fill(0);
  for (let i = 0; i < buildings.cellCount; i++) {
    const cell = cells[i];
    const province = (cell / typeCount) | 0;
    provinceJobs[province] += level[cell] * open[cell] * recipeJobs[recipeOf(buildings, cell)];
    provinceWorkers[province] += buildings.workers[cell];
  }
  buildings.reportChanges = buildings.changes;
  buildings.reportPopulationVersion = population.version;
  buildings.reportOwnershipVersion = state.ownershipVersion;
  buildings.version += 1;
  return buildings;
}

/** The rest of the economy's starting prices: what each good costs it today (the higher of its price and what it fetches abroad). */
function setRestReference(market: MarketState): void {
  const { restReference, price, exportPrice } = market;
  for (let m = 0; m < price.length; m++)
    restReference[m] = exportPrice[m] > price[m] ? exportPrice[m] : price[m];
}

/**
 * The markets at the start of a campaign, so that every market starts in
 * balance (a trial of the first day decides):
 * 1. Each building pays the going wage, or the lower wage it can afford at
 *    the starting prices with `startingMargin` of its sales left as profit;
 *    its cash reserves start at `startingReserves` of the most they hold.
 * 2. Each pop's income (wages, its share of a subsistence building, the
 *    rest of the economy's wages, dividends from the buildings' profits)
 *    sets its wealth, the most its income buys; that is also the standard of
 *    living it expects. The substitution shares follow what is on sale.
 * 3. Trade (F19, `settleStartingTrade`): each country imports what its
 *    buildings and pops want but it doesn't make, countries with spare
 *    export, the rest of the world sells what the world can't make; the rest
 *    of the economy buys what is left over, per person; prices start at the
 *    reference prices trade gives them (importers pay for shipping and
 *    tariffs). The pops' electricity comes out of the rest of the economy's
 *    (F85); the stockpiles start with `startingDays` of everyone's buying.
 * These settle together over a few rounds (each depends on the others).
 */
export function calibrateMarkets(
  data: GameData,
  world: WorldMap,
  population: PopulationState,
  buildings: BuildingsState,
  market: MarketState,
  trade: TradeState,
): void {
  const owner = world.provinceCountry;
  const rules = data.market.buildings;
  const { cells, cellCount, typeCount, recipeSubsistence, wageFactor, reserves } = buildings;
  const groups = population.groupCount;
  ensureLayout(buildings, owner, buildings.layoutOwnershipVersion);

  const trial = buildings.trialStock;
  const ownersGroup = data.pops.groups.findIndex((group) => group.id === 'owners');
  const keep =
    rules.depositWhenEmpty -
    (rules.depositWhenEmpty - rules.depositAtFull) * rules.startingReserves;
  const { size, standInJobs, wage, income } = population;
  const { goodCount, electricityGood, popOrder, sell, buy } = market;
  const { made, imports, ordered, otherPowerPerPerson } = buildings;
  const { countryPeople, popPower } = market;
  const restShare = data.buildings.standIns.restOfEconomyShare;
  // F85's electricity for the rest of the economy and homes: the pops' part comes out of it.
  const otherPower = otherPowerPerPerson.slice();
  for (let round = 0; round < 6; round++) {
    // 1. Wages each building can afford at today's prices; its reserves.
    for (let i = 0; i < cellCount; i++) {
      const cell = cells[i];
      const province = (cell / typeCount) | 0;
      if (recipeSubsistence[recipeOf(buildings, cell)] === 1) continue;
      const unit = unitEconomics(market, buildings, population, cell, owner[province], 1);
      const afford =
        unit.wages > 0 ? ((unit.sales - unit.costs) * (1 - rules.startingMargin)) / unit.wages : 1;
      wageFactor[cell] = Math.max(rules.minWage, Math.min(1, afford));
      reserves[cell] =
        rules.startingReserves * reserveCap(buildings, population, cell, rules.reserveDays);
    }
    // 2. A trial of the first day; incomes, wealth, the shares.
    setRestReference(market);
    trial.set(buildings.stock);
    wholeDay(population, buildings, market, owner, data, trial);
    market.dividend.fill(0);
    for (let i = 0; i < cellCount; i++) {
      const cell = cells[i];
      if (recipeSubsistence[recipeOf(buildings, cell)] === 1 || ownersGroup < 0) continue;
      const profit = buildings.revenue[cell] - buildings.inputCost[cell] - buildings.wages[cell];
      if (profit > 0)
        market.dividend[((cell / typeCount) | 0) * groups + ownersGroup] += profit * (1 - keep);
    }
    for (let i = 0; i < size.length; i++)
      income[i] =
        size[i] > 0
          ? (buildings.popPay[i] +
              standInJobs[i] * buildings.standInFill[i] * wage[i] +
              market.dividend[i]) /
            size[i]
          : 0;
    for (let m = 0; m < sell.length; m++) {
      // As `marketDay` counts them: electricity is on sale as far as the
      // plants could make it, and its orders (everyone's) are what was asked.
      if (m % goodCount === electricityGood) {
        sell[m] = buildings.powerPotential[(m / goodCount) | 0];
        buy[m] = ordered[m];
      } else {
        sell[m] = made[m] + imports[m];
        buy[m] = ordered[m] + popOrder[m] + market.restOrder[m] + market.exportOrder[m];
      }
    }
    updateShares(market, sell, buy, popOrder, data.pops.wealth.substitution.otherBuyersWeight);
    updateWealth(market, population, owner, data, true);
    computeOrders(market, population, owner);
    // 3. Trade and the rest of the economy; the starting prices.
    settleStartingTrade(trade, market, buildings, restShare);
    for (let p = 0; p < otherPowerPerPerson.length; p++) {
      const c = owner[p];
      const pops = countryPeople[c] > 0 ? popPower[c] / countryPeople[c] : 0;
      otherPowerPerPerson[p] = Math.max(0, otherPower[p] - pops);
    }
    setRestReference(market);
    computeOrders(market, population, owner);
  }
  const below = data.pops.wealth.expectedBelowStart;
  for (let i = 0; i < size.length; i++)
    population.expectedLiving[i] = Math.max(1, population.wealth[i] - below);

  // The stockpiles start with so many days of everyone's buying.
  const { stock, capacityUse, startingDays } = buildings;
  for (let m = 0; m < stock.length; m++) {
    if (m % goodCount === electricityGood) continue;
    const daily = capacityUse[m] + popOrder[m] + market.restOrder[m] + market.exportOrder[m];
    stock[m] = Math.max(stock[m], startingDays[m % goodCount] * daily);
  }
  buildings.changes += 1;
  population.reportOwnershipVersion = -1;
}
