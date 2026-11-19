import { describe, expect, it } from 'vitest';
import {
  BUILDING_LIMIT,
  DataValidationError,
  GameState,
  SAVE_FORMAT_VERSION,
  addToStockpile,
  createSnapshot,
  deserializeGameState,
  ensureBuildingsReport,
  ensurePopulationReport,
  formatDataIssue,
  hashGameState,
  parseGameData,
  removePeople,
  serializeGameState,
  setBuildingMethod,
} from '../src';
import {
  type TestStartingBuilding,
  testBuildingStart,
  testBuildings,
  type testMarket,
  testRawData,
} from './helpers';

/**
 * Buildings with recipes (F07) and production methods (F85) on the tiny
 * test world: AAA (two provinces, 2 million people, GDP 50 billion US$) and
 * BBB (one province, 500,000 people, GDP 1 billion US$). The test buildings
 * (`testBuildings`), per level and day:
 *
 *   mine         100 laborers, 10 MWh                       → 200 ore
 *   coal_mine    100 laborers, 10 MWh                       → 300 coal
 *   power_plant  20 skilled workers, 100 coal               → 200 MWh
 *   mill (modern) 200 laborers + 100 skilled, 50 MWh, 100 ore + 50 coal → 60 steel
 *   mill (old)    900 laborers + 100 skilled, 20 MWh, 100 ore + 80 coal → 60 steel
 *   dam          10 skilled workers, nothing                → 100 MWh
 */
const GROUPS = 6;
const [LABORERS, SKILLED] = [0, 1];
const TYPES = ['mine', 'coal_mine', 'power_plant', 'mill', 'dam'];
const GOODS = ['ore', 'coal', 'steel', 'electricity'];

/** AAA's starting buildings in the tests that need some. */
const STARTING: Record<string, TestStartingBuilding[]> = {
  alpha_west: [
    ['mine', 'machines', 2],
    ['coal_mine', 'machines', 1],
    ['power_plant', 'turbines', 1],
    ['mill', 'modern', 3],
  ],
  alpha_east: [
    ['mine', 'machines', 1],
    ['coal_mine', 'machines', 1],
    ['power_plant', 'turbines', 1],
    ['mill', 'modern', 2],
  ],
};

function newGame(
  start: Record<string, TestStartingBuilding[]> = {},
  change: (buildings: ReturnType<typeof testBuildings>) => void = () => {},
  changeRaw: (raw: ReturnType<typeof testRawData>) => void = () => {},
) {
  const raw = testRawData();
  changeRaw(raw);
  const buildings = testBuildings();
  change(buildings);
  raw.buildings = buildings;
  raw.buildingStart = testBuildingStart(start);
  const data = parseGameData(raw);
  const state = new GameState({ data, seed: 1 });
  return { data, ...toolsFor(state) };
}

function toolsFor(state: GameState) {
  const province = (id: string) => state.world.provinceIndex.get(id)!;
  const country = (id: string) => state.world.countryIndex.get(id)!;
  const cell = (provinceId: string, building: string) =>
    province(provinceId) * TYPES.length + TYPES.indexOf(building);
  const pop = (provinceId: string, group: number) => province(provinceId) * GROUPS + group;
  const market = (countryId: string, good: string) =>
    country(countryId) * GOODS.length + GOODS.indexOf(good);
  const build = (provinceId: string, building: string, level: number) =>
    expect(
      state.applyCommand({ type: 'debugSetBuildingLevel', province: provinceId, building, level }),
    ).toEqual({ ok: true });
  const give = (countryId: string, good: string, amount: number) =>
    addToStockpile(state, country(countryId), GOODS.indexOf(good), amount);
  const stock = (countryId: string, good: string) => state.buildings.stock[market(countryId, good)];
  /** A building as the report shows it. */
  const building = (provinceId: string, type: string) => {
    const report = ensureBuildingsReport(state);
    const at = cell(provinceId, type);
    return {
      output: report.output[at],
      staffing: report.staffing[at],
      workers: report.workers[at],
      wages: report.wages[at],
      limit: report.limitKind[at],
      what: report.limitWhat[at],
    };
  };
  return { state, province, country, cell, pop, market, build, give, stock, building };
}

const run = (state: GameState, days: number) => {
  for (let i = 0; i < days; i++) state.advanceDay();
};

describe('a building runs its recipe (F07)', () => {
  it('makes its outputs from its inputs, per level and day', () => {
    const { state, build, give, stock, building, market } = newGame();
    build('alpha_west', 'mine', 1);
    build('alpha_west', 'coal_mine', 1);
    build('alpha_west', 'power_plant', 1);
    build('alpha_west', 'mill', 2);
    give('AAA', 'coal', 100);
    // Before the first day the report already shows today's production.
    expect(building('alpha_west', 'mill')).toMatchObject({ output: 1, limit: BUILDING_LIMIT.none });
    expect(ensureBuildingsReport(state).made[market('AAA', 'steel')]).toBeCloseTo(120, 9);
    expect(stock('AAA', 'steel')).toBe(0);

    run(state, 1);
    // The plant makes the 120 MWh asked for (10 + 10 + 2 × 50) from 60 coal.
    expect(stock('AAA', 'steel')).toBeCloseTo(120, 9);
    expect(stock('AAA', 'ore')).toBeCloseTo(0, 9); // 200 mined, 200 used
    expect(stock('AAA', 'coal')).toBeCloseTo(100 - 60 + 300 - 100, 9);
    expect(stock('AAA', 'electricity')).toBe(0); // never stored
    const report = ensureBuildingsReport(state);
    expect(report.made[market('AAA', 'electricity')]).toBeCloseTo(120, 9);
    expect(report.used[market('AAA', 'electricity')]).toBeCloseTo(120, 9);
    expect(report.used[market('AAA', 'coal')]).toBeCloseTo(160, 9);
    // The other country has nothing to do with it.
    expect(stock('BBB', 'steel')).toBe(0);
  });

  it('a power plant only makes the electricity that is asked for', () => {
    const { build, give, building } = newGame();
    build('alpha_west', 'power_plant', 1);
    build('alpha_west', 'mine', 5); // asks for 50 of the plant's 200 MWh
    give('AAA', 'coal', 1000);
    const plant = building('alpha_west', 'power_plant');
    expect(plant.output).toBeCloseTo(0.25, 6);
    expect(plant.limit).toBe(BUILDING_LIMIT.demand);
    expect(building('alpha_west', 'mine').output).toBe(1);
  });

  it('pays its workers the going wage and offers jobs to the pops of its province', () => {
    const { state, build, building, pop } = newGame();
    const before = state.population.jobs[pop('alpha_west', LABORERS)];
    build('alpha_west', 'mill', 3);
    const population = state.population;
    expect(population.buildingJobs[pop('alpha_west', LABORERS)]).toBe(600);
    expect(population.buildingJobs[pop('alpha_west', SKILLED)]).toBe(300);
    expect(population.jobs[pop('alpha_west', LABORERS)]).toBeCloseTo(before + 600, 6);
    expect(population.buildingJobs[pop('alpha_east', LABORERS)]).toBe(0);
    const mill = building('alpha_west', 'mill');
    expect(mill.workers).toBeCloseTo(900, 6);
    expect(mill.wages).toBeCloseTo(
      600 * population.wage[pop('alpha_west', LABORERS)] +
        300 * population.wage[pop('alpha_west', SKILLED)],
      6,
    );
    const report = ensureBuildingsReport(state);
    expect(report.provinceJobs[state.world.provinceIndex.get('alpha_west')!]).toBe(900);
    // Closing it takes the jobs away again.
    build('alpha_west', 'mill', 0);
    expect(population.buildingJobs[pop('alpha_west', LABORERS)]).toBe(0);
    expect(population.jobs[pop('alpha_west', LABORERS)]).toBeCloseTo(before, 6);
    expect(ensureBuildingsReport(state).cellCount).toBe(0);
  });

  it('opening a building lowers unemployment, closing it raises it', () => {
    const { state, build, pop } = newGame();
    const employed = () => ensurePopulationReport(state).employed[pop('alpha_west', LABORERS)];
    const before = employed();
    build('alpha_west', 'mine', 50); // 5,000 jobs for laborers
    expect(employed()).toBeCloseTo(before + 5000, 4);
    build('alpha_west', 'mine', 0);
    expect(employed()).toBeCloseTo(before, 4);
  });
});

describe('partial output (F07)', () => {
  it('runs as far as its scarcest input goes, and says which one', () => {
    const { state, build, give, stock, building } = newGame();
    build('alpha_west', 'power_plant', 1);
    build('alpha_west', 'mill', 2); // wants 200 ore and 100 coal a day
    give('AAA', 'coal', 1000);
    give('AAA', 'ore', 100);
    const mill = building('alpha_west', 'mill');
    expect(mill.output).toBeCloseTo(0.5, 6);
    expect(mill.limit).toBe(BUILDING_LIMIT.input);
    expect(GOODS[mill.what]).toBe('ore');
    run(state, 1);
    expect(stock('AAA', 'steel')).toBeCloseTo(60, 9);
    expect(stock('AAA', 'ore')).toBeCloseTo(0, 9);
    // No ore left: the mill stops.
    expect(building('alpha_west', 'mill').output).toBe(0);
    run(state, 1);
    expect(stock('AAA', 'steel')).toBeCloseTo(60, 9);
  });

  it('gives every building that needs a short good the same share', () => {
    const { build, give, building } = newGame();
    build('alpha_west', 'power_plant', 2);
    build('alpha_west', 'mill', 1);
    build('alpha_east', 'mill', 3);
    give('AAA', 'coal', 10_000);
    give('AAA', 'ore', 100); // a quarter of the 400 they want
    expect(building('alpha_west', 'mill').output).toBeCloseTo(0.25, 6);
    expect(building('alpha_east', 'mill').output).toBeCloseTo(0.25, 6);
  });

  it('stops without electricity, and runs partly on too little', () => {
    const { build, give, building } = newGame();
    build('alpha_west', 'mill', 8); // wants 400 MWh
    give('AAA', 'coal', 10_000);
    give('AAA', 'ore', 10_000);
    expect(building('alpha_west', 'mill')).toMatchObject({
      output: 0,
      limit: BUILDING_LIMIT.electricity,
    });
    build('alpha_west', 'power_plant', 1); // makes 200 MWh
    const mill = building('alpha_west', 'mill');
    expect(mill.output).toBeCloseTo(0.5, 6);
    expect(mill.limit).toBe(BUILDING_LIMIT.electricity);
    expect(building('alpha_west', 'power_plant').output).toBe(1);
  });

  it('a power plant short of fuel makes less electricity for everyone', () => {
    const { state, build, give, building } = newGame();
    build('alpha_west', 'power_plant', 1);
    build('alpha_west', 'mine', 20); // wants all 200 MWh
    give('AAA', 'coal', 25); // a quarter of the plant's 100 coal
    const plant = building('alpha_west', 'power_plant');
    expect(plant.output).toBeCloseTo(0.25, 6);
    expect(plant.limit).toBe(BUILDING_LIMIT.input);
    expect(GOODS[plant.what]).toBe('coal');
    expect(building('alpha_west', 'mine').output).toBeCloseTo(0.25, 6);
    // With the coal gone, the plant and everything on its electricity stop.
    run(state, 1);
    expect(building('alpha_west', 'power_plant').output).toBe(0);
    expect(building('alpha_west', 'mine').output).toBe(0);
  });

  it('runs only as far as its scarcest pop group allows, and stops without workers', () => {
    // Nobody buys the mill's steel here: so that it doesn't go broke and lay
    // its workers off (F65), its wages and jobs stay as they are.
    const { state, build, give, building, pop, province } = newGame({}, undefined, (raw) => {
      const market = raw.market as ReturnType<typeof testMarket>;
      market.buildings.minWage = 1;
      market.buildings.firingRate = 0;
    });
    build('beta_main', 'power_plant', 400); // plenty of electricity
    build('beta_main', 'mill', 1000); // 200,000 laborers and 100,000 skilled workers: far too many
    give('BBB', 'coal', 1e9);
    give('BBB', 'ore', 1e9);
    const population = state.population;
    const share = (group: number) =>
      population.size[pop('beta_main', group)] / population.jobs[pop('beta_main', group)];
    expect(share(SKILLED)).toBeLessThan(share(LABORERS));
    const mill = building('beta_main', 'mill');
    expect(mill.staffing).toBeCloseTo(share(SKILLED), 6);
    expect(mill.limit).toBe(BUILDING_LIMIT.workers);
    expect(mill.what).toBe(SKILLED);
    // Every employer of a short pop gets the same share of its people.
    expect(mill.workers).toBeCloseTo(1000 * (200 * share(LABORERS) + 100 * share(SKILLED)), 2);
    // The open jobs draw laborers into training: staffing improves with time.
    const skilledBefore = population.size[pop('beta_main', SKILLED)];
    run(state, 365);
    expect(population.size[pop('beta_main', SKILLED)]).toBeGreaterThan(skilledBefore * 1.2);
    expect(building('beta_main', 'mill').staffing).toBeGreaterThan(mill.staffing * 1.05);
    // Without any skilled workers the mill stops.
    removePeople(population, province('beta_main'), SKILLED, 1e9);
    expect(building('beta_main', 'mill')).toMatchObject({
      output: 0,
      staffing: 0,
      limit: BUILDING_LIMIT.workers,
    });
  });

  it('keeps at most so many days of a good in the stockpile', () => {
    const { state, build, give, stock } = newGame();
    build('alpha_west', 'power_plant', 1);
    build('alpha_west', 'coal_mine', 1); // makes 300 coal a day; the plant burns 5
    give('AAA', 'coal', 100);
    run(state, 60);
    // 30 days of the most the country makes or uses in a day (300).
    expect(stock('AAA', 'coal')).toBeCloseTo(9000, 6);
  });
});

describe('the buildings a campaign starts with (F07, F85)', () => {
  const anchors = STARTING;

  it('starts every province with its buildings from building_start.json', () => {
    const { state, cell } = newGame(anchors);
    const level = (provinceId: string, type: string) =>
      state.buildings.level[cell(provinceId, type)];
    expect([level('alpha_west', 'mill'), level('alpha_east', 'mill')]).toEqual([3, 2]);
    expect([level('alpha_west', 'mine'), level('alpha_east', 'mine')]).toEqual([2, 1]);
    expect([level('alpha_west', 'coal_mine'), level('alpha_east', 'coal_mine')]).toEqual([1, 1]);
    expect(level('beta_main', 'mill')).toBe(0);
    expect(state.buildings.method[cell('alpha_west', 'mill')]).toBe(0);
  });

  it('starts with a stockpile and keeps running by itself', () => {
    const { state, stock, cell } = newGame(anchors);
    expect(stock('AAA', 'ore')).toBe(10 * 500);
    expect(stock('AAA', 'coal')).toBe(10 * (250 + 200));
    run(state, 400);
    const report = ensureBuildingsReport(state);
    for (const provinceId of ['alpha_west', 'alpha_east'])
      for (const type of ['mine', 'coal_mine', 'mill'])
        expect(report.output[cell(provinceId, type)]).toBeGreaterThan(0.999);
    expect(stock('AAA', 'steel')).toBeCloseTo(30 * 300, 6);
  });

  it('takes its jobs over from the stand-in economy: unemployment starts as in the data', () => {
    const { state, pop, country } = newGame(anchors);
    const population = ensurePopulationReport(state);
    const at = pop('alpha_west', LABORERS);
    expect(population.buildingJobs[at]).toBe(3 * 200 + 2 * 100 + 1 * 100);
    expect(population.standInJobs[at]).toBeCloseTo(
      population.size[at] * population.employmentTarget[at] - 900,
      6,
    );
    // The stand-in keeps the rest of the economy in step with the workforce.
    expect(population.standInTarget[at]).toBeCloseTo(
      population.employmentTarget[at] - 900 / population.size[at],
      12,
    );
    let people = 0;
    let employed = 0;
    for (let g = 0; g < GROUPS; g++) {
      people += population.countryGroupSize[country('AAA') * GROUPS + g];
      employed += population.countryGroupEmployed[country('AAA') * GROUPS + g];
    }
    expect(1 - employed / people).toBeCloseTo(0.05, 6);
    run(state, 365);
    expect(state.population.jobs[at]).toBeCloseTo(
      state.population.standInJobs[at] + state.population.buildingJobs[at],
      9,
    );
  });
});

describe('the buildings in the report, the snapshot and the save (F07)', () => {
  const anchors = STARTING;

  it("a province's buildings work for whoever owns it now", () => {
    const { state, stock } = newGame(anchors);
    run(state, 5);
    const before = stock('BBB', 'steel');
    expect(before).toBe(0);
    state.applyCommand({ type: 'debugSetProvinceOwner', province: 'alpha_east', country: 'BBB' });
    state.applyCommand({ type: 'debugFillStockpile', country: 'BBB', days: 10 });
    expect(stock('BBB', 'ore')).toBe(10 * 200); // its 2 mills use 200 ore a day
    run(state, 1);
    expect(stock('BBB', 'steel')).toBeCloseTo(120, 6);
  });

  it('sends the buildings in the snapshot only when they changed', () => {
    const { state, build, cell } = newGame(anchors);
    const first = createSnapshot(state);
    const sent = first.buildings!;
    expect(sent.typeCount).toBe(5);
    expect(sent.cells.length).toBe(8);
    expect(sent.cells[0]).toBe(cell('alpha_east', 'mine'));
    expect([...sent.level]).toEqual([1, 1, 1, 2, 2, 1, 1, 3]);
    expect(sent.output[3]).toBe(1);
    expect(sent.stockLimit.length).toBe(sent.stock.length);
    const again = createSnapshot(state, first);
    expect(again.buildings).toBeUndefined();
    expect(again.buildingsVersion).toBe(first.buildingsVersion);
    run(state, 1);
    const next = createSnapshot(state, again);
    expect(next.buildings).toBeDefined();
    build('beta_main', 'mine', 2);
    const built = createSnapshot(state, next);
    expect(built.buildings!.cells.length).toBe(9);
    // The copy doesn't change when the sim goes on.
    const kept = next.buildings!.stock.slice();
    run(state, 10);
    expect([...next.buildings!.stock]).toEqual([...kept]);
  });

  it('a loaded game continues exactly like the original', () => {
    const { data, state, build } = newGame(anchors);
    build('beta_main', 'mill', 4);
    run(state, 100);
    const text = JSON.stringify(serializeGameState(state));
    const loaded = deserializeGameState(JSON.parse(text), { data });
    expect(hashGameState(loaded)).toBe(hashGameState(state));
    // The report is the state's own: the loaded game shows the same numbers.
    expect([...ensureBuildingsReport(loaded).output]).toEqual([
      ...ensureBuildingsReport(state).output,
    ]);
    expect([...ensureBuildingsReport(loaded).made]).toEqual([...ensureBuildingsReport(state).made]);
    run(state, 300);
    run(loaded, 300);
    expect(hashGameState(loaded)).toBe(hashGameState(state));
  });

  it('asking for the report changes nothing', () => {
    const a = newGame(anchors).state;
    const b = newGame(anchors).state;
    for (let day = 0; day < 50; day++) {
      ensureBuildingsReport(a);
      createSnapshot(a);
      a.advanceDay();
      b.advanceDay();
    }
    expect(hashGameState(a)).toBe(hashGameState(b));
  });

  it('is deterministic, and different after a different history', () => {
    const a = newGame(anchors).state;
    const b = newGame(anchors).state;
    run(a, 200);
    run(b, 200);
    expect(hashGameState(a)).toBe(hashGameState(b));
    const c = newGame(anchors);
    c.build('alpha_west', 'mill', 4);
    run(c.state, 200);
    expect(hashGameState(c.state)).not.toBe(hashGameState(a));
  });

  it('loads a version 4 save (from before buildings) with the starting buildings', () => {
    const { data, state } = newGame(anchors);
    const save = serializeGameState(state);
    const { buildings: _buildings, population, ...rest } = save;
    void _buildings;
    const { standInJobs: _standInJobs, ...people } = population;
    void _standInJobs;
    const old = {
      ...rest,
      saveVersion: 4,
      population: { ...people, jobs: Array.from(state.population.jobs) },
    };
    const loaded = deserializeGameState(old, { data });
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(6);
    expect([...loaded.buildings.level]).toEqual([...state.buildings.level]);
    expect([...loaded.buildings.stock]).toEqual([...state.buildings.stock]);
    loaded.population.jobs.forEach((jobs, i) =>
      expect(jobs).toBeCloseTo(state.population.jobs[i], 6),
    );
  });

  it('rejects a save whose buildings do not fit the game', () => {
    const { data, state } = newGame(anchors);
    const good = serializeGameState(state);
    const key = (save: unknown) => {
      try {
        deserializeGameState(save, { data });
      } catch (error) {
        return (error as { key?: string }).key;
      }
      return 'loaded';
    };
    expect(key(good)).toBe('loaded');
    const { buildings } = good;
    for (const bad of [
      { ...buildings, types: ['mine'] },
      { ...buildings, goods: [...buildings.goods].reverse() },
      { ...buildings, levels: buildings.levels.slice(1) },
      { ...buildings, levels: [99, 0, 1, 0] },
      { ...buildings, levels: [0, 9, 1, 0] },
      { ...buildings, levels: [0, 3, 1, 2] },
      {
        ...buildings,
        methods: [['machines'], ['machines'], ['turbines'], ['modern'], ['turbines']],
      },
      { ...buildings, stock: buildings.stock.slice(1) },
    ])
      expect(key({ ...good, buildings: bad })).toBe('SAVE_ERROR_CORRUPT');
  });

  it('refuses bad building commands', () => {
    const { state } = newGame();
    const level = (province: string, building: string, value: number) =>
      state.applyCommand({ type: 'debugSetBuildingLevel', province, building, level: value });
    expect(level('nowhere', 'mill', 1)).toMatchObject({ reasonKey: 'COMMAND_UNKNOWN_PROVINCE' });
    expect(level('alpha_west', 'castle', 1)).toMatchObject({
      reasonKey: 'COMMAND_UNKNOWN_BUILDING',
    });
    expect(level('alpha_west', 'mill', -1)).toMatchObject({ reasonKey: 'COMMAND_INVALID' });
    expect(level('alpha_west', 'mill', 1.5)).toMatchObject({ reasonKey: 'COMMAND_INVALID' });
    expect(
      state.applyCommand({ type: 'debugFillStockpile', country: 'ZZZ', days: 10 }),
    ).toMatchObject({ reasonKey: 'COMMAND_UNKNOWN_COUNTRY' });
    expect(
      state.applyCommand({ type: 'debugFillStockpile', country: 'AAA', days: -1 }),
    ).toMatchObject({ reasonKey: 'COMMAND_INVALID' });
  });
});

describe('goods.json and buildings.json (F07)', () => {
  type Buildings = ReturnType<typeof testBuildings>;
  const issues = (change: (raw: ReturnType<typeof testRawData>) => void): string => {
    const raw = testRawData();
    change(raw);
    try {
      parseGameData(raw);
    } catch (error) {
      if (error instanceof DataValidationError) return error.issues.map(formatDataIssue).join('\n');
      throw error;
    }
    return '';
  };
  const withBuildings = (change: (buildings: Buildings) => void) =>
    issues((raw) => {
      const buildings = testBuildings();
      change(buildings);
      raw.buildings = buildings;
    });

  it('accepts the test data', () => {
    expect(issues(() => {})).toBe('');
  });

  it('checks goods, workers, inputs and outputs', () => {
    expect(
      issues(
        (raw) =>
          (raw.goods = { goods: [{ id: 'ore', unit: 't', basePrice: 1 }], electricity: 'power' }),
      ),
    ).toContain('unknown good "power"');
    expect(withBuildings((b) => b.buildings.push({ ...b.buildings[0] }))).toContain(
      'duplicate building "mine"',
    );
    const worker = (group: string) =>
      withBuildings((b) => (b.buildings[0].methods[0].workers = { [group]: 5 } as never));
    expect(worker('wizards')).toContain('unknown pop group "wizards"');
    expect(worker('soldiers')).toContain(`buildings can't hire "soldiers"`);
    expect(worker('owners')).toContain(`buildings can't hire "owners"`);
    const mill = (b: Buildings) => b.buildings[3].methods[0] as Record<string, unknown>;
    expect(withBuildings((b) => (mill(b).inputs = { gold: 1 }))).toContain('unknown good "gold"');
    expect(withBuildings((b) => (mill(b).inputs = { electricity: 1 }))).toContain(
      'electricity is not an input',
    );
    expect(withBuildings((b) => (mill(b).inputs = { steel: 1 }))).toContain(
      '"steel" is both an input and an output',
    );
    expect(
      withBuildings((b) => (b.buildings[0].methods[0].outputs = { electricity: 5 } as never)),
    ).toContain('only buildings of the energy category make electricity');
    const methodsOf = (b: Buildings) => b.buildings[3].methods as unknown[];
    expect(withBuildings((b) => methodsOf(b).push(methodsOf(b)[0]))).toContain(
      '"mill" lists the method "modern" twice',
    );
    expect(
      withBuildings((b) => ((b.buildings[2].methods[0] as Record<string, unknown>).offGrid = 0.5)),
    ).toContain('only a method that uses electricity can run without it');
    expect(withBuildings((b) => (b.buildings[0].methods = []))).toContain('methods');
  });

  it('checks building_start.json: provinces, buildings, methods', () => {
    const start = (provinces: Record<string, TestStartingBuilding[]>) =>
      issues((raw) => (raw.buildingStart = testBuildingStart(provinces)));
    expect(start({ alpha_west: [['mill', 'old', 2]] })).toBe('');
    expect(start({ atlantis: [['mill', 'old', 2]] })).toContain('unknown province "atlantis"');
    expect(start({ alpha_west: [['castle', 'old', 2]] })).toContain('unknown building "castle"');
    expect(start({ alpha_west: [['mill', 'magic', 2]] })).toContain(
      '"mill" has no production method "magic"',
    );
    expect(
      start({
        alpha_west: [
          ['mill', 'old', 2],
          ['mill', 'modern', 1],
        ],
      }),
    ).toContain('"mill" is listed twice in this province');
  });
});

describe('production methods (F85)', () => {
  it('a method sets the jobs, the electricity and the inputs of every level', () => {
    const { state, build, give, building, pop, province } = newGame();
    build('alpha_west', 'power_plant', 1);
    build('alpha_west', 'mill', 2);
    give('AAA', 'coal', 1000);
    give('AAA', 'ore', 1000);
    expect(state.population.buildingJobs[pop('alpha_west', LABORERS)]).toBe(400);
    const modern = building('alpha_west', 'mill');
    setBuildingMethod(state, province('alpha_west'), TYPES.indexOf('mill'), 1); // old
    expect(state.population.buildingJobs[pop('alpha_west', LABORERS)]).toBe(1800);
    const old = building('alpha_west', 'mill');
    expect(old.output).toBe(1);
    expect(old.workers).toBeGreaterThan(modern.workers * 3);
    run(state, 1);
    // 2 levels × 80 coal and the plant's 40 coal for 40 MWh.
    expect(
      state.buildings.stock[state.world.countryIndex.get('AAA')! * GOODS.length + 1],
    ).toBeCloseTo(1000 - 160 - 20, 6);
    expect(() =>
      setBuildingMethod(state, province('alpha_west'), TYPES.indexOf('mill'), 2),
    ).toThrow('has no method 2');
  });

  it('a new building runs its type’s first method; a save keeps every method', () => {
    const { data, state, build, cell, province } = newGame({ alpha_west: [['mill', 'old', 2]] });
    expect(state.buildings.method[cell('alpha_west', 'mill')]).toBe(1);
    build('alpha_east', 'mill', 1);
    expect(state.buildings.method[cell('alpha_east', 'mill')]).toBe(0);
    // Closing and reopening a building starts it on the first method again.
    setBuildingMethod(state, province('alpha_east'), TYPES.indexOf('mill'), 1);
    build('alpha_east', 'mill', 0);
    build('alpha_east', 'mill', 1);
    expect(state.buildings.method[cell('alpha_east', 'mill')]).toBe(0);
    const save = serializeGameState(state);
    expect(save.buildings.methods[3]).toEqual(['modern', 'old']);
    const loaded = deserializeGameState(JSON.parse(JSON.stringify(save)), { data });
    expect(loaded.buildings.method[cell('alpha_west', 'mill')]).toBe(1);
    expect(hashGameState(loaded)).toBe(hashGameState(state));
  });
});

describe('electricity: the rest of the economy, fuel-free plants first, off the grid (F85)', () => {
  it('power plants that burn nothing run first; the others make the rest', () => {
    const { build, give, building } = newGame();
    build('alpha_west', 'dam', 1); // 100 MWh, burns nothing
    build('alpha_west', 'power_plant', 1); // 200 MWh from 100 coal
    build('alpha_west', 'mine', 15); // asks for 150 MWh
    give('AAA', 'coal', 1000);
    expect(building('alpha_west', 'dam').output).toBe(1);
    const plant = building('alpha_west', 'power_plant');
    expect(plant.output).toBeCloseTo(0.25, 6);
    expect(plant.limit).toBe(BUILDING_LIMIT.demand);
    expect(building('alpha_west', 'mine').output).toBe(1);
  });

  it('the rest of the economy uses most of what the starting power plants make, and follows the people', () => {
    const { state, building, market } = newGame(
      {
        alpha_west: [
          ['dam', 'turbines', 10],
          ['mine', 'machines', 10],
        ],
      },
      (b) => (b.standIns.otherElectricityShare = 0.9),
    );
    // 0.9 × 1,000 MWh, less the mines' 100 MWh, shared by AAA's 2 million people.
    const report = ensureBuildingsReport(state);
    const aaa = state.world.countryIndex.get('AAA')!;
    expect(report.otherPowerWanted[aaa]).toBeCloseTo(800, 6);
    expect(report.used[market('AAA', 'electricity')]).toBeCloseTo(900, 6);
    expect(building('alpha_west', 'dam').output).toBeCloseTo(0.9, 6);
    // More people want more electricity.
    run(state, 3650);
    expect(ensureBuildingsReport(state).otherPowerWanted[aaa]).toBeGreaterThan(800);
  });

  it('with too little electricity everyone gets the same share, homes too', () => {
    const { state, build, building } = newGame(
      { alpha_west: [['dam', 'turbines', 10]] },
      (b) => (b.standIns.otherElectricityShare = 1),
    );
    build('alpha_west', 'mine', 100); // asks for 1,000 MWh more
    const mine = building('alpha_west', 'mine');
    expect(mine.output).toBeCloseTo(0.5, 6);
    expect(mine.limit).toBe(BUILDING_LIMIT.electricity);
    const aaa = state.world.countryIndex.get('AAA')!;
    expect(ensureBuildingsReport(state).otherPowerUsed[aaa]).toBeCloseTo(500, 6);
  });

  it('a mine with its own generators keeps part of its output in a blackout, so the country climbs back', () => {
    const { state, building, stock } = newGame(
      {
        alpha_west: [
          ['power_plant', 'turbines', 1],
          ['coal_mine', 'machines', 2],
        ],
      },
      (b) => ((b.buildings[1].methods[0] as Record<string, unknown>).offGrid = 0.25),
    );
    // No coal: the plant can't run and the grid is dark.
    expect(stock('AAA', 'coal')).toBeGreaterThan(0);
    state.buildings.stock.fill(0);
    state.buildings.changes += 1;
    const dark = building('alpha_west', 'coal_mine');
    expect(dark.output).toBeCloseTo(0.25, 6);
    expect(dark.limit).toBe(BUILDING_LIMIT.electricity);
    run(state, 3);
    expect(building('alpha_west', 'power_plant').output).toBeGreaterThan(0);
    expect(building('alpha_west', 'coal_mine').output).toBe(1);
  });
});

describe('each province starts with the workers its buildings need (F85)', () => {
  it('keeps every province’s workforce and the country’s pop groups, and moves workers to the jobs', () => {
    const plain = newGame().state.population;
    const { state, pop } = newGame({ alpha_east: [['mill', 'old', 300]] }); // 270,000 laborers
    const fitted = state.population;
    const province = (population: typeof plain, id: string) => {
      let total = 0;
      for (let g = 0; g < GROUPS; g++) total += population.size[pop(id, g)];
      return total;
    };
    for (const id of ['alpha_west', 'alpha_east', 'beta_main'])
      expect(province(fitted, id)).toBeCloseTo(province(plain, id), 3);
    for (let g = 0; g < GROUPS; g++)
      expect(fitted.size[pop('alpha_west', g)] + fitted.size[pop('alpha_east', g)]).toBeCloseTo(
        plain.size[pop('alpha_west', g)] + plain.size[pop('alpha_east', g)],
        3,
      );
    // alpha_east has more laborers than before, alpha_west fewer.
    expect(fitted.size[pop('alpha_east', LABORERS)]).toBeGreaterThan(
      plain.size[pop('alpha_east', LABORERS)],
    );
    expect(fitted.size[pop('alpha_west', LABORERS)]).toBeLessThan(
      plain.size[pop('alpha_west', LABORERS)],
    );
    // So the mill is fully staffed, and unemployment is still as in the data.
    expect(ensureBuildingsReport(state).staffing[toolsFor(state).cell('alpha_east', 'mill')]).toBe(
      1,
    );
    const report = ensurePopulationReport(state);
    const aaa = state.world.countryIndex.get('AAA')!;
    let people = 0;
    let employed = 0;
    for (let g = 0; g < GROUPS; g++) {
      people += report.countryGroupSize[aaa * GROUPS + g];
      employed += report.countryGroupEmployed[aaa * GROUPS + g];
    }
    expect(1 - employed / people).toBeCloseTo(0.05, 6);
  });
});

describe('older saves (F85)', () => {
  it('loads a version 5 save (the six example buildings) with the starting buildings', () => {
    const { data, state } = newGame(STARTING);
    run(state, 10);
    const save = serializeGameState(state);
    const { methods: _methods, ...buildings } = save.buildings;
    void _methods;
    const old = {
      ...save,
      saveVersion: 5,
      buildings: { ...buildings, types: ['farm'], levels: [0, 0, 7] },
    };
    const loaded = deserializeGameState(old, { data });
    expect(loaded.day).toBe(10);
    expect([...loaded.buildings.level]).toEqual([...newGame(STARTING).state.buildings.level]);
    expect([...loaded.population.size]).toEqual([...state.population.size]);
    loaded.population.standInJobs.forEach((jobs, i) =>
      expect(jobs).toBeCloseTo(state.population.standInTarget[i] * state.population.size[i], 6),
    );
  });
});

describe('the game starts with the building and market systems', () => {
  it('runs production in the energy, resource production and industry slots, then the market, trade, food and the budget', () => {
    const { state } = newGame();
    state.enableProfiling(() => 0);
    state.advanceDay();
    expect(state.getSystemTimings().map((timing) => timing.id)).toEqual([
      'population',
      'energy',
      'resourceProduction',
      'industry',
      'market',
      'trade',
      'foodConsumption',
      'budget',
    ]);
  });
});
