import { describe, expect, it } from 'vitest';
import {
  DataValidationError,
  GameState,
  SAVE_FORMAT_VERSION,
  type SimEvent,
  createSnapshot,
  deserializeGameState,
  ensureBuildingsReport,
  ensurePopulationReport,
  foodReserveDays,
  hashGameState,
  parseGameData,
  serializeGameState,
} from '../src';
import {
  testBuildingStart,
  testBuildings,
  testFood,
  testGoods,
  testPops,
  testRawData,
  testTrade,
} from './helpers';

/**
 * Food (F08) on the tiny test world: AAA (two provinces, rich) and BBB (one
 * province, poor) eat grain (a fifth good, made by a farm): basic food and
 * better food. Farms are built to feed each country; tests take them away.
 */
const GRAIN = 4;
const LEVELS = ['none', 'light', 'strict', 'emergency'];

function foodData() {
  return {
    ...testFood(),
    goods: ['grain'],
    basicNeed: 'basic_food',
    betterNeed: 'luxury_food',
    reserves: { startingDays: 30, targetDays: 30, maxDays: 90, lowDays: 7 },
    rationing: [
      { id: 'none', restCut: 0, betterCut: 0, stopExports: false, living: 0 },
      {
        id: 'light',
        restCut: 0.25,
        betterCut: 0.2,
        stopExports: false,
        living: 1,
        auto: { belowDays: 15, shortage: 0.02, liftAboveDays: 20 },
      },
      {
        id: 'strict',
        restCut: 0.5,
        betterCut: 0.5,
        stopExports: true,
        living: 3,
        auto: { belowDays: 7, shortage: 0.1, liftAboveDays: 12 },
      },
      {
        id: 'emergency',
        restCut: 0.9,
        betterCut: 1,
        stopExports: true,
        living: 6,
        auto: { belowDays: 3, shortage: 0.25, liftAboveDays: 6 },
      },
    ],
  };
}

interface FoodOptions {
  /** Farms make this much of what each country eats (default 1.05). */
  readonly farms?: number;
  /** The rest of the economy buys what is left over at the start (default: nothing). */
  readonly restOfEconomyShare?: number;
  /** Grain can be traded (default: no trade at all). */
  readonly trade?: boolean;
  readonly food?: (food: ReturnType<typeof foodData>) => void;
}

function rawFood(options: FoodOptions, farmLevels: [number, number]) {
  const raw = testRawData();
  const goods = testGoods();
  goods.goods.push({ id: 'grain', unit: 't', basePrice: 500 });
  raw.goods = goods;
  const pops = testPops();
  pops.needs.push(
    { id: 'basic_food', goods: [{ good: 'grain', maxShare: 1 }] },
    { id: 'luxury_food', goods: [{ good: 'grain', maxShare: 1 }] },
  );
  const food = [
    [0.5, 0],
    [1, 0.5],
    [1.5, 3],
  ];
  pops.wealth.packages.forEach((row, i) =>
    Object.assign(row.needs, { basic_food: food[i][0], luxury_food: food[i][1] }),
  );
  raw.pops = pops;
  const buildings = testBuildings();
  buildings.buildings.push({
    id: 'farm',
    category: 'extraction',
    methods: [{ id: 'fields', workers: { laborers: 50 }, outputs: { grain: 100 } }] as never,
  });
  buildings.standIns.restOfEconomyShare = options.restOfEconomyShare ?? 0;
  raw.buildings = buildings;
  raw.buildingStart = testBuildingStart({
    alpha_west: farmLevels[0] > 0 ? [['farm', 'fields', farmLevels[0]]] : [],
    beta_main: farmLevels[1] > 0 ? [['farm', 'fields', farmLevels[1]]] : [],
  });
  raw.trade = {
    ...testTrade(),
    localGoods: options.trade ? ['electricity'] : ['ore', 'coal', 'steel', 'electricity', 'grain'],
  };
  const f = foodData();
  options.food?.(f);
  raw.food = f;
  return raw;
}

function foodGame(options: FoodOptions = {}) {
  // What each country eats, from a world without farms: then farms for it.
  const probe = new GameState({ data: parseGameData(rawFood(options, [0, 0])), seed: 1 });
  ensureBuildingsReport(probe);
  const eats = (c: number) =>
    probe.market.popOrder[c * 5 + GRAIN] + probe.market.restOrder[c * 5 + GRAIN];
  const farms = options.farms ?? 1.05;
  const levels: [number, number] = [
    Math.ceil((eats(0) * farms) / 100),
    Math.ceil((eats(1) * farms) / 100),
  ];
  const data = parseGameData(rawFood(options, levels));
  const state = new GameState({ data, seed: 1 });
  const events: SimEvent[] = [];
  const day = () => {
    state.advanceDay();
    events.push(...state.drainEvents());
  };
  const run = (days: number) => {
    for (let i = 0; i < days; i++) day();
  };
  /** Runs to the Monday after `weeks` full weeks (the food week has just run). */
  const runWeeks = (weeks: number) => {
    for (let w = 0; w < weeks; w++) {
      day();
      while (!state.isWeeklyTickDay) day();
    }
    day();
  };
  const country = (id: string) => state.world.countryIndex.get(id)!;
  /** BBB loses its farm and its food: a famine in the making. */
  const starveBBB = () => {
    expect(
      state.applyCommand({
        type: 'debugSetBuildingLevel',
        province: 'beta_main',
        building: 'farm',
        level: 0,
      }),
    ).toEqual({ ok: true });
    expect(
      state.applyCommand({ type: 'debugSetStockpile', country: 'BBB', good: 'grain', amount: 0 }),
    ).toEqual({ ok: true });
  };
  return { data, state, events, run, runWeeks, country, starveBBB, levels };
}

describe('food at the start (F08)', () => {
  it('feeds everyone: no starvation, no rationing, no famine, 30 days of food', () => {
    const { state, runWeeks, country } = foodGame();
    runWeeks(2);
    const { food } = state;
    for (const id of ['AAA', 'BBB']) {
      const c = country(id);
      expect(food.basicShortage[c]).toBe(0);
      expect(food.countryStarving[c]).toBe(0);
      expect(food.rationing[c]).toBe(0);
      expect(food.famineCount[c]).toBe(0);
      expect(food.starvationDeaths[c]).toBe(0);
    }
    // The poor spend more of their income on food: lower food security.
    expect(food.countrySecurity[country('BBB')]).toBeLessThan(food.countrySecurity[country('AAA')]);
    expect(food.countrySecurity[country('BBB')]).toBeGreaterThan(0.4);
  });

  it('starts the reserves at 30 days and keeps at most 90 (the food rule)', () => {
    const { state, country } = foodGame({ farms: 3 });
    const report = ensureBuildingsReport(state);
    const c = country('AAA');
    const days = foodReserveDays(state.food, state.market, report.stock, state.market.buy, c);
    expect(days).toBeCloseTo(30, 0);
    expect(state.buildings.maxDays[GRAIN]).toBe(90);
    expect(state.buildings.maxDays[0]).toBe(30);
    expect(state.trade.stockTargetDays[GRAIN]).toBe(30);
    // Farms making three times what is eaten: the stockpile fills up to its
    // limit, 90 days of the most the market buys or sells (here: makes) a day.
    for (let i = 0; i < 400; i++) state.advanceDay();
    const at = c * 5 + GRAIN;
    const limit = 90 * Math.max(state.market.buy[at], state.market.sell[at]);
    expect(state.buildings.stock[at]).toBeGreaterThan(0.9 * limit);
    expect(state.buildings.stock[at]).toBeLessThanOrEqual(limit * 1.001);
  });
});

describe('starvation and famine (F08, Victoria 3 1.8)', () => {
  it('turns a lasting shortage into starvation, then famine, over a few weeks', () => {
    const { state, events, runWeeks, country, starveBBB } = foodGame();
    runWeeks(1);
    starveBBB();
    const { food } = state;
    const c = country('BBB');
    const weekly: number[] = [];
    for (let w = 0; w < 6; w++) {
      runWeeks(1);
      weekly.push(food.countrySecurity[c]);
    }
    expect(food.basicShortage[c]).toBe(1);
    // Food security halves toward nothing every week: hunger first, then starvation.
    expect(weekly[0]).toBeGreaterThan(0.4);
    for (let w = 1; w < weekly.length; w++) expect(weekly[w]).toBeLessThan(weekly[w - 1]);
    expect(weekly[5]).toBeLessThan(0.05);
    expect(food.countryStarving[c]).toBe(1);
    expect(food.countrySevere[c]).toBe(1);
    expect(food.famineCount[c]).toBe(1);
    const started = events.filter((event) => event.type === 'famineStarted');
    expect(started).toEqual([{ type: 'famineStarted', province: 'beta_main', country: 'BBB' }]);
    // The rich country is fine.
    expect(food.countryStarving[country('AAA')]).toBe(0);
    // Emergency rationing: the shortage is far over its share.
    expect(LEVELS[food.rationing[c]]).toBe('emergency');
  });

  it('kills people and costs births, as counted, and lowers the standard of living', () => {
    const control = foodGame();
    const famine = foodGame();
    control.runWeeks(1);
    famine.runWeeks(1);
    famine.starveBBB();
    control.runWeeks(10);
    famine.runWeeks(10);
    const c = famine.country('BBB');
    const { food, population } = famine.state;
    const p = famine.state.world.provinceIndex.get('beta_main')!;
    expect(food.starvationDeaths[c]).toBeGreaterThan(0);
    expect(food.lostBirths[c]).toBeGreaterThan(0);
    expect(food.famineDeaths[p]).toBeGreaterThan(0);
    expect(food.famineDeaths[p]).toBeLessThanOrEqual(food.starvationDeaths[c]);
    // The famine's toll is what the population lost against the control.
    const people = (state: GameState) => ensurePopulationReport(state).countryPopulation[c];
    const lost = people(control.state) - people(famine.state);
    const counted = food.starvationDeaths[c] + food.lostBirths[c];
    expect(Math.abs(lost - counted) / counted).toBeLessThan(0.05);
    expect(lost / people(control.state)).toBeGreaterThan(0.005);
    expect(lost / people(control.state)).toBeLessThan(0.05);
    // Severe starvation: deaths at least doubled, with extra deaths on top; births cut by 90 %.
    const row = p * population.groupCount;
    expect(population.deathFactor[row]).toBeGreaterThan(1.9);
    expect(population.extraDeaths[row]).toBeGreaterThan(0);
    expect(population.birthKeep[row]).toBeLessThan(0.2);
    // Up to 15 points of standard of living, and 6 for emergency rationing.
    const report = ensurePopulationReport(famine.state);
    expect(report.standardOfLiving[row]).toBeLessThan(population.wealth[row] - 15);
  });

  it('ends the famine when food comes back, and reports its deaths', () => {
    const { state, events, runWeeks, country, starveBBB, levels } = foodGame();
    runWeeks(1);
    starveBBB();
    runWeeks(6);
    expect(state.food.famineCount[country('BBB')]).toBe(1);
    state.applyCommand({
      type: 'debugSetBuildingLevel',
      province: 'beta_main',
      building: 'farm',
      level: levels[1] * 2,
    });
    state.applyCommand({ type: 'debugFillStockpile', country: 'BBB', days: 30 });
    runWeeks(4);
    expect(state.food.famineCount[country('BBB')]).toBe(0);
    expect(state.food.countryStarving[country('BBB')]).toBe(0);
    const ended = events.filter((event) => event.type === 'famineEnded');
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({ province: 'beta_main', country: 'BBB' });
    expect((ended[0] as { deaths: number }).deaths).toBeGreaterThan(0);
    expect(state.food.famineSince[state.world.provinceIndex.get('beta_main')!]).toBe(-1);
  });

  it('meets a lasting partial shortage with rationing first, then hunger for the poor', () => {
    const { state, runWeeks, country } = foodGame({ farms: 0.6 });
    const c = country('BBB');
    const shortages: number[] = [];
    for (let w = 0; w < 30; w++) {
      runWeeks(1);
      shortages.push(state.food.basicShortage[c]);
    }
    const { food } = state;
    // Rationing stretched the reserves: no shortage for months, then one.
    expect(shortages.slice(0, 15).every((share) => share === 0)).toBe(true);
    expect(LEVELS[food.rationing[c]]).toBe('emergency');
    expect(food.basicShortage[c]).toBeGreaterThan(0.03);
    expect(food.countrySecurity[c]).toBeLessThan(food.countrySecurity[country('AAA')]);
  });
});

describe('rationing (F08, section 8.8)', () => {
  it('rations by itself as reserves fall, one level after another', () => {
    const { state, runWeeks, country } = foodGame({ farms: 0.5 });
    const c = country('AAA');
    const levels: number[] = [];
    for (let w = 0; w < 40 && state.food.rationing[c] < 2; w++) {
      runWeeks(1);
      levels.push(state.food.rationing[c]);
    }
    expect(levels.indexOf(1)).toBeGreaterThan(0);
    expect(levels.indexOf(1)).toBeLessThan(levels.indexOf(2));
    expect(state.market.rationRest[c]).toBe(0.5);
    expect(state.market.rationBetter[c]).toBe(0.5);
    // Strict rationing costs 3 points of standard of living.
    const p = state.world.provinceIndex.get('alpha_west')!;
    expect(state.population.livingPenalty[p * state.population.groupCount]).toBe(3);
  });

  it("cuts the rest of the economy's food and the people's better food", () => {
    const { state, run, country } = foodGame({ farms: 1.5, restOfEconomyShare: 1 });
    const at = country('AAA') * 5 + GRAIN;
    run(1);
    const rest = state.market.restOrder[at];
    const people = state.market.popOrder[at];
    expect(rest).toBeGreaterThan(0);
    state.applyCommand({ type: 'setRationing', country: 'AAA', level: 'strict' });
    run(1);
    expect(state.market.restOrder[at]).toBeCloseTo(rest * 0.5, -1);
    expect(state.market.popOrder[at]).toBeLessThan(people);
  });

  it('steps back down one level a week once reserves have recovered', () => {
    const { state, runWeeks, country } = foodGame({ farms: 0.5, restOfEconomyShare: 1 });
    const c = country('AAA');
    while (state.food.rationing[c] < 2) runWeeks(1);
    state.applyCommand({
      type: 'debugSetBuildingLevel',
      province: 'alpha_west',
      building: 'farm',
      level: 1000,
    });
    state.applyCommand({ type: 'debugSetStockpile', country: 'AAA', good: 'grain', amount: 1e9 });
    runWeeks(1);
    expect(state.food.rationing[c]).toBe(1);
    runWeeks(1);
    expect(state.food.rationing[c]).toBe(0);
  });

  it('stops food exports under strict rationing', () => {
    const { state, country } = foodGame({ trade: true });
    state.applyCommand({ type: 'setRationing', country: 'BBB', level: 'strict' });
    const at = country('BBB') * 5 + GRAIN;
    expect(state.trade.exportBan[at]).toBe(1);
    state.applyCommand({ type: 'setRationing', country: 'BBB', level: 'light' });
    expect(state.trade.exportBan[at]).toBe(0);
  });

  it("follows the player's choice until set back to automatic", () => {
    const { state, runWeeks, country } = foodGame();
    const c = country('AAA');
    expect(
      state.applyCommand({ type: 'setRationing', country: 'AAA', level: 'emergency' }),
    ).toEqual({ ok: true });
    expect(state.food.rationing[c]).toBe(3);
    expect(state.market.rationBetter[c]).toBe(0);
    runWeeks(2);
    expect(state.food.rationing[c]).toBe(3);
    state.applyCommand({ type: 'setRationing', country: 'AAA', level: null });
    // Automatic: plenty of food, so it steps back one level a week.
    runWeeks(1);
    expect(state.food.rationing[c]).toBe(2);
    expect(
      state.applyCommand({ type: 'setRationing', country: 'AAA', level: 'feast' }),
    ).toMatchObject({ ok: false });
    expect(state.applyCommand({ type: 'setRationing', country: 'ZZZ', level: null })).toMatchObject(
      { ok: false },
    );
    expect(
      state.applyCommand({
        type: 'debugSetStockpile',
        country: 'AAA',
        good: 'electricity',
        amount: 1,
      }),
    ).toMatchObject({ ok: false });
  });
});

describe('food in saves and snapshots (F08)', () => {
  it('saves in the middle of a famine and continues exactly as the original', () => {
    const { data, state, runWeeks, run, starveBBB } = foodGame();
    runWeeks(1);
    starveBBB();
    runWeeks(4);
    run(3);
    state.applyCommand({ type: 'setRationing', country: 'AAA', level: 'light' });
    const loaded = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))), {
      data,
    });
    expect(hashGameState(loaded)).toBe(hashGameState(state));
    expect(loaded.food.famineCount).toEqual(state.food.famineCount);
    run(30);
    for (let i = 0; i < 30; i++) loaded.advanceDay();
    expect(hashGameState(loaded)).toBe(hashGameState(state));
  });

  it('loads a version 8 save (from before food) where a new campaign starts', () => {
    const { data, state, run } = foodGame();
    run(10);
    const { food: _food, ...old } = serializeGameState(state);
    void _food;
    expect(SAVE_FORMAT_VERSION).toBe(9);
    const loaded = deserializeGameState({ ...old, saveVersion: 8 }, { data });
    expect(loaded.day).toBe(10);
    expect(Array.from(loaded.food.security).every((value) => value === 1)).toBe(true);
    expect(Array.from(loaded.food.rationing)).toEqual([0, 0]);
    for (let i = 0; i < 14; i++) loaded.advanceDay();
  });

  it("rejects a save whose rationing levels are not the game's", () => {
    const { data, state } = foodGame();
    const save = serializeGameState(state);
    expect(() =>
      deserializeGameState({ ...save, food: { ...save.food, levels: ['none'] } }, { data }),
    ).toThrow();
  });

  it('sends food in the snapshot', () => {
    const { state, runWeeks, starveBBB, country } = foodGame();
    runWeeks(1);
    starveBBB();
    runWeeks(6);
    const food = createSnapshot(state).food!;
    expect(food.levelIds).toEqual(LEVELS);
    expect(food.famineCount[country('BBB')]).toBe(1);
    const p = state.world.provinceIndex.get('beta_main')!;
    expect(food.famineSince[p]).toBeGreaterThan(0);
    expect(food.provinceStarving[p]).toBe(1);
    expect(food.reserveDays[country('AAA')]).toBeGreaterThan(10);
    expect(food.rationingChoice).toBe(-1);
    expect(food.groupSecurity.length).toBe(state.population.groupCount);
  });
});

describe('food.json checks (F08)', () => {
  const issues = (change: (food: ReturnType<typeof foodData>) => void) => {
    try {
      parseGameData(rawFood({ food: change }, [1, 1]));
      return [];
    } catch (error) {
      if (error instanceof DataValidationError) return error.issues.map((i) => i.message);
      throw error;
    }
  };

  it('accepts the test data and the game data', () => {
    expect(issues(() => {})).toEqual([]);
  });

  it('reports unknown goods and needs, electricity, and levels out of order', () => {
    expect(issues((food) => (food.goods = ['bread']))).toContain('unknown good "bread"');
    expect(issues((food) => food.goods.push('electricity'))).toContain(
      "electricity can't be kept as food",
    );
    expect(issues((food) => (food.basicNeed = 'snacks'))[0]).toContain('unknown need');
    expect(issues((food) => (food.security.severe = 0.5))[0]).toContain('severe starvation');
    expect(issues((food) => (food.rationing[0].restCut = 0.1))[0]).toContain('no rationing');
    expect(issues((food) => (food.rationing[2].restCut = 0.1))[0]).toContain('at least as much');
    expect(issues((food) => delete (food.rationing[1] as { auto?: unknown }).auto)[0]).toContain(
      'automatic rule',
    );
  });
});
