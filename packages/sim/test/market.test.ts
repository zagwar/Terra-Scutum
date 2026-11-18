import { describe, expect, it } from 'vitest';
import {
  GameState,
  SAVE_FORMAT_VERSION,
  createMarket,
  createSnapshot,
  deserializeGameState,
  ensureBuildingsReport,
  ensurePopulationReport,
  hashGameState,
  marketPrice,
  parseGameData,
  refreshBuildingJobs,
  serializeGameState,
  updateShares,
} from '../src';
import {
  type TestStartingBuilding,
  testBuildingStart,
  testBuildings,
  testMarket,
  testPops,
  testRawData,
} from './helpers';

/**
 * National markets (F65) on the tiny test world: AAA (two provinces, rich)
 * and BBB (one province, poor). The test goods are ore, coal, steel and
 * electricity; here the pops heat with coal and electricity (in the shared
 * test data their heating costs nothing).
 */
const GOODS = ['ore', 'coal', 'steel', 'electricity'];
const TYPES = ['mine', 'coal_mine', 'power_plant', 'mill', 'dam'];
const GROUPS = 6;
const [LABORERS, , , OWNERS] = [0, 1, 2, 3];

interface GameOptions {
  readonly start?: Record<string, TestStartingBuilding[]>;
  /** Heating's value in the buy packages at levels 1, 50 and 99 (US$ per worker a day). */
  readonly heating?: [number, number, number];
  readonly restOfEconomyShare?: number;
  readonly standingImportsShare?: number;
  readonly market?: (market: ReturnType<typeof testMarket>) => void;
  readonly buildings?: (buildings: ReturnType<typeof testBuildings>) => void;
}

function game(options: GameOptions = {}) {
  const raw = testRawData();
  const pops = testPops();
  const [low, mid, high] = options.heating ?? [0.5, 2, 5];
  pops.wealth.packages[0].needs.heating = low;
  pops.wealth.packages[1].needs.heating = mid;
  pops.wealth.packages[2].needs.heating = high;
  raw.pops = pops;
  const buildings = testBuildings();
  buildings.standIns.restOfEconomyShare = options.restOfEconomyShare ?? 1;
  buildings.standIns.standingImportsShare = options.standingImportsShare ?? 0;
  options.buildings?.(buildings);
  raw.buildings = buildings;
  const market = testMarket();
  options.market?.(market);
  raw.market = market;
  raw.buildingStart = testBuildingStart(options.start ?? {});
  const data = parseGameData(raw);
  const state = new GameState({ data, seed: 1 });
  const country = (id: string) => state.world.countryIndex.get(id)!;
  const province = (id: string) => state.world.provinceIndex.get(id)!;
  const at = (countryId: string, good: string) =>
    country(countryId) * GOODS.length + GOODS.indexOf(good);
  const cell = (provinceId: string, type: string) =>
    province(provinceId) * TYPES.length + TYPES.indexOf(type);
  const price = (countryId: string, good: string) =>
    state.market.price[at(countryId, good)] / state.market.basePrice[GOODS.indexOf(good)];
  const run = (days: number) => {
    for (let i = 0; i < days; i++) state.advanceDay();
  };
  /** Runs to the end of the week after next, so a full week of orders has set the prices. */
  const runWeeks = (weeks: number) => {
    while (!state.isWeeklyTickDay) state.advanceDay();
    run(7 * weeks + 1);
  };
  const build = (provinceId: string, building: string, level: number) =>
    expect(
      state.applyCommand({ type: 'debugSetBuildingLevel', province: provinceId, building, level }),
    ).toEqual({ ok: true });
  return { data, state, country, province, at, cell, price, run, runWeeks, build };
}

/**
 * A coal economy in AAA: coal mines, a power plant and dams (enough
 * electricity for the pops' heating too), and a mill with a mine for its ore.
 */
const COAL_ECONOMY: Record<string, TestStartingBuilding[]> = {
  alpha_west: [
    ['coal_mine', 'machines', 3],
    ['power_plant', 'turbines', 1],
    ['dam', 'turbines', 1000],
  ],
  alpha_east: [
    ['mine', 'machines', 1],
    ['mill', 'modern', 1],
  ],
};

describe('the price (F65, Victoria 3)', () => {
  const rules = { sensitivity: 0.75, min: 0.25, max: 1.75 };
  it('is the base price when buy and sell orders match', () => {
    expect(marketPrice(100, 50, 50, rules)).toBe(100);
  });
  it('moves by 0.75 × (buy − sell) ÷ the smaller of the two, at most ±75 %', () => {
    expect(marketPrice(100, 110, 100, rules)).toBeCloseTo(107.5, 9);
    expect(marketPrice(100, 100, 120, rules)).toBeCloseTo(100 * (1 - 0.75 * 0.2), 9);
    expect(marketPrice(100, 200, 100, rules)).toBeCloseTo(175, 9);
    expect(marketPrice(100, 500, 100, rules)).toBeCloseTo(175, 9);
    expect(marketPrice(100, 100, 300, rules)).toBeCloseTo(25, 9);
  });
  it('is at its limits when nothing is sold or nothing is bought', () => {
    expect(marketPrice(100, 10, 0, rules)).toBe(175);
    expect(marketPrice(100, 0, 10, rules)).toBe(25);
    expect(marketPrice(100, 0, 0, rules)).toBe(100);
  });
});

describe('substitution (F65, Victoria 3)', () => {
  const { data, state, at } = game();
  const market = createMarket(data, state.world, GROUPS);
  const sell = new Float64Array(market.price.length);
  const buy = new Float64Array(market.price.length);
  const popBuy = new Float64Array(market.price.length);
  // Heating is the first need: coal (at most 60 %), then electricity (at most 100 %).
  const heating = (country: number) => [
    market.shares[country * market.entryCount],
    market.shares[country * market.entryCount + 1],
  ];
  const aaa = state.world.countryIndex.get('AAA')!;

  it('splits a need by what is on sale, each good at most its share', () => {
    sell[at('AAA', 'coal')] = 100;
    sell[at('AAA', 'electricity')] = 100;
    updateShares(market, sell, buy, popBuy, 0.5);
    expect(heating(aaa)[0]).toBeCloseTo(0.5, 9);
    expect(heating(aaa)[1]).toBeCloseTo(0.5, 9);
    // Plenty of coal: coal stops at 60 %, electricity covers the rest.
    sell[at('AAA', 'coal')] = 1000;
    sell[at('AAA', 'electricity')] = 10;
    updateShares(market, sell, buy, popBuy, 0.5);
    expect(heating(aaa)[0]).toBeCloseTo(0.6, 9);
    expect(heating(aaa)[1]).toBeCloseTo(0.4, 9);
  });

  it('counts a good’s sell orders less half of what others buy of it', () => {
    sell[at('AAA', 'coal')] = 100;
    sell[at('AAA', 'electricity')] = 100;
    buy[at('AAA', 'coal')] = 200; // the power plants take it all
    updateShares(market, sell, buy, popBuy, 0.5);
    expect(heating(aaa)).toEqual([0, 1]);
  });

  it('splits a need evenly when none of its goods is on sale', () => {
    sell.fill(0);
    buy.fill(0);
    updateShares(market, sell, buy, popBuy, 0.5);
    expect(heating(aaa)[0]).toBeCloseTo(0.5, 9);
    expect(heating(aaa)[1]).toBeCloseTo(0.5, 9);
  });
});

describe('the start of a campaign (F65)', () => {
  it('starts every market in balance: prices stay at their base the first weeks', () => {
    const { runWeeks, price } = game({ start: COAL_ECONOMY });
    runWeeks(2);
    for (const good of ['coal', 'ore', 'steel'])
      expect(Math.abs(price('AAA', good) - 1)).toBeLessThan(0.02);
  });

  it('gives standing imports for what the pops want but the country doesn’t make', () => {
    // No coal mine in AAA: its power plant and its pops' heating need coal.
    const { state, at } = game({
      start: { alpha_west: [['power_plant', 'turbines', 1]] },
      standingImportsShare: 1,
    });
    const imports = state.buildings.imports[at('AAA', 'coal')];
    const report = ensureBuildingsReport(state);
    const wanted = report.ordered[at('AAA', 'coal')] + state.market.popOrder[at('AAA', 'coal')];
    expect(state.market.popOrder[at('AAA', 'coal')]).toBeGreaterThan(0);
    expect(imports).toBeCloseTo(wanted, 3);
  });

  it('sets each pop’s wealth to what its income buys, a little above what it expects', () => {
    const { state } = game({ start: COAL_ECONOMY });
    const { wealth, expectedLiving, size } = state.population;
    for (let i = 0; i < size.length; i++) {
      if (size[i] <= 0) continue;
      expect(wealth[i]).toBeGreaterThanOrEqual(1);
      expect(wealth[i]).toBeLessThanOrEqual(99);
      expect(expectedLiving[i]).toBeCloseTo(Math.max(1, wealth[i] - 5), 4);
    }
  });
});

describe('shortages (F65)', () => {
  it('raise the price within weeks; the pops turn to other goods where they can', () => {
    const { state, runWeeks, price, build, country, at } = game({ start: COAL_ECONOMY });
    runWeeks(1);
    const coalHeating = state.market.popOrder[at('AAA', 'coal')];
    expect(coalHeating).toBeGreaterThan(0);
    build('alpha_west', 'coal_mine', 0);
    runWeeks(1);
    expect(price('AAA', 'coal')).toBeGreaterThan(1.7);
    // With no coal on sale they heat with electricity (the dams have plenty): no shortage.
    runWeeks(4);
    expect(state.market.popOrder[at('AAA', 'coal')]).toBeLessThan(coalHeating * 0.01);
    expect(state.market.shortage[country('AAA')]).toBe(0);
  });

  it('leave the pops short when there is nothing to turn to, and lower their standard of living', () => {
    const { state, runWeeks, price, build, country } = game({ start: COAL_ECONOMY });
    runWeeks(1);
    const before = ensurePopulationReport(state).provinceStandardOfLiving[0];
    // Without the dams the one power plant can't heat the homes.
    build('alpha_west', 'dam', 0);
    runWeeks(2);
    expect(price('AAA', 'electricity')).toBeGreaterThan(1.7);
    expect(state.market.shortage[country('AAA')]).toBeGreaterThan(0);
    expect(ensurePopulationReport(state).provinceStandardOfLiving[0]).toBeLessThan(before);
  });
});

describe('buildings’ money (F65, Victoria 3)', () => {
  it('fills its reserves from a profit and pays the rest to the province’s owners', () => {
    const { state, runWeeks, cell, province } = game({ start: COAL_ECONOMY });
    const mill = cell('alpha_east', 'mill');
    const before = state.buildings.reserves[mill];
    runWeeks(3);
    expect(state.buildings.reserves[mill]).toBeGreaterThan(before);
    const owners = province('alpha_east') * GROUPS + OWNERS;
    expect(state.market.dividend[owners]).toBeGreaterThan(0);
    // The owners earn their going wage and the dividends.
    expect(state.population.income[owners]).toBeGreaterThan(state.population.wage[owners]);
  });

  it('cuts its wages when it loses money, down to where it breaks even', () => {
    // Nobody buys steel here (no rest of the economy): its price falls to the floor.
    const { state, runWeeks, cell, price } = game({ start: COAL_ECONOMY, restOfEconomyShare: 0 });
    const mill = cell('alpha_east', 'mill');
    runWeeks(30);
    expect(price('AAA', 'steel')).toBeCloseTo(0.25, 6);
    const wage = state.buildings.wageFactor[mill];
    expect(wage).toBeLessThan(0.9);
    // It breaks even there: it keeps its wage and all its jobs.
    runWeeks(10);
    expect(state.buildings.wageFactor[mill]).toBeCloseTo(wage, 6);
    expect(state.buildings.open[mill]).toBe(1);
  });

  it('lays workers off when it still loses money at its lowest wage', () => {
    // Here it may not pay less than 90 % of the going wage: not enough to break even.
    const { state, runWeeks, cell, price, data } = game({
      start: COAL_ECONOMY,
      restOfEconomyShare: 0,
      market: (market) => (market.buildings.minWage = 0.9),
    });
    const mill = cell('alpha_east', 'mill');
    // Week by week: first its reserves go below half, then the wage falls to
    // its floor, then the jobs go.
    let fewestOpen = 1;
    let lowestWage = Infinity;
    let cheapestSteel = Infinity;
    for (let week = 0; week < 20; week++) {
      runWeeks(1);
      fewestOpen = Math.min(fewestOpen, state.buildings.open[mill]);
      lowestWage = Math.min(lowestWage, state.buildings.wageFactor[mill]);
      cheapestSteel = Math.min(cheapestSteel, price('AAA', 'steel'));
      // The jobs it keeps open are all the jobs it offers.
      expect(ensureBuildingsReport(state).workers[mill]).toBeLessThanOrEqual(
        state.buildings.open[mill] * 300 + 1e-6,
      );
    }
    expect(cheapestSteel).toBeCloseTo(0.25, 6);
    expect(lowestWage).toBeCloseTo(data.market.buildings.minWage, 6);
    expect(fewestOpen).toBe(0);
  });

  it('offers only the jobs it keeps open', () => {
    const { state, cell, province } = game({ start: COAL_ECONOMY });
    const mill = cell('alpha_east', 'mill');
    const laborers = province('alpha_east') * GROUPS + LABORERS;
    const before = state.population.buildingJobs[laborers];
    state.buildings.open[mill] = 0.5;
    refreshBuildingJobs(state.buildings, state.population, province('alpha_east'));
    // The modern mill has 200 laborer jobs a level: half of them go.
    expect(state.population.buildingJobs[laborers]).toBeCloseTo(before - 100, 6);
  });

  it('fills the best-paying employer’s jobs first', () => {
    // 200,000 laborer jobs in mines and coal mines: far more than BBB has laborers.
    const { state, cell } = game({
      start: {
        beta_main: [
          ['mine', 'machines', 1000],
          ['coal_mine', 'machines', 1000],
        ],
      },
    });
    const mine = cell('beta_main', 'mine');
    const coalMine = cell('beta_main', 'coal_mine');
    state.buildings.wageFactor[mine] = 2;
    state.buildings.wageFactor[coalMine] = 1;
    state.buildings.changes += 1;
    const report = ensureBuildingsReport(state);
    const laborers = state.population.size[state.world.provinceIndex.get('beta_main')! * GROUPS];
    expect(laborers).toBeLessThan(200_000);
    expect(report.staffing[mine]).toBeGreaterThan(report.staffing[coalMine]);
    // Within 10 % of each other they share alike.
    state.buildings.wageFactor[mine] = 1.05;
    state.buildings.changes += 1;
    const even = ensureBuildingsReport(state);
    expect(even.staffing[mine]).toBeCloseTo(even.staffing[coalMine], 6);
  });

  it('pays a subsistence building’s workers what it makes, less its inputs', () => {
    const { state, cell, province, at } = game({
      start: { beta_main: [['mine', 'plots', 1]] },
      buildings: (buildings) =>
        buildings.buildings[0].methods.push({
          id: 'plots',
          workers: { laborers: 1000 },
          outputs: { ore: 50 },
          subsistence: true,
        } as never),
    });
    const report = ensureBuildingsReport(state);
    const mine = cell('beta_main', 'mine');
    const value = 50 * state.market.price[at('BBB', 'ore')] * report.output[mine];
    expect(report.wages[mine]).toBeCloseTo(value, 6);
    expect(report.popPay[province('beta_main') * GROUPS + LABORERS]).toBeCloseTo(value, 6);
  });
});

describe('markets in saves and snapshots (F65)', () => {
  it('saves in the middle of a week and continues exactly as the original', () => {
    const { data, state, run } = game({ start: COAL_ECONOMY });
    run(10);
    const loaded = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))), {
      data,
    });
    expect(hashGameState(loaded)).toBe(hashGameState(state));
    run(30);
    for (let i = 0; i < 30; i++) loaded.advanceDay();
    expect(hashGameState(loaded)).toBe(hashGameState(state));
  });

  it('loads a version 6 save with the markets of a new campaign', () => {
    const { data, state, run } = game({ start: COAL_ECONOMY });
    run(10);
    const save = serializeGameState(state);
    const { market: _market, ...rest } = save;
    void _market;
    const { economy: _economy, ...buildings } = save.buildings;
    void _economy;
    const { wealth: _wealth, income: _income, ...population } = save.population;
    void _wealth;
    void _income;
    const old = { ...rest, saveVersion: 6, buildings, population };
    expect(SAVE_FORMAT_VERSION).toBe(7);
    const loaded = deserializeGameState(old, { data });
    expect(loaded.day).toBe(10);
    expect([...loaded.market.price]).toEqual([...game({ start: COAL_ECONOMY }).state.market.price]);
    expect([...loaded.buildings.level]).toEqual([...state.buildings.level]);
  });

  it('sends the prices, the day’s flows and the player’s price history', () => {
    const { state, runWeeks } = game({ start: COAL_ECONOMY });
    runWeeks(3);
    const snapshot = createSnapshot(state);
    expect(snapshot.market).toBeDefined();
    const market = snapshot.market!;
    expect(market.price.length).toBe(state.world.countryIds.length * GOODS.length);
    expect(market.historyWeeks).toBeGreaterThanOrEqual(3);
    expect(market.history.length).toBe(GOODS.length * market.historyWeeks);
    expect(snapshot.buildings!.revenue.length).toBe(snapshot.buildings!.cells.length);
  });
});
