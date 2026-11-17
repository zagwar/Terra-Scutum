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
  startingCountryLevels,
} from '../src';
import { testBuildings, testRawData } from './helpers';

/**
 * Buildings with recipes (F07) on the tiny test world: AAA (two provinces,
 * 2 million people, GDP 50 billion US$) and BBB (one province, 500,000
 * people, GDP 1 billion US$). The test buildings (`testBuildings`), per
 * level and day:
 *
 *   mine         100 laborers, 10 MWh                       → 200 ore
 *   coal_mine    100 laborers, 10 MWh                       → 300 coal
 *   power_plant  20 skilled workers, 100 coal               → 200 MWh
 *   mill         200 laborers + 100 skilled, 50 MWh, 100 ore + 50 coal → 60 steel
 */
const GROUPS = 6;
const [LABORERS, SKILLED] = [0, 1];
const TYPES = ['mine', 'coal_mine', 'power_plant', 'mill'];
const GOODS = ['ore', 'coal', 'steel', 'electricity'];

function newGame(anchors: { building: string; gdpBillionUsdPerLevel: number }[] = []) {
  const raw = testRawData();
  raw.buildings = testBuildings(anchors);
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
    const { state, build, give, building, pop, province } = newGame();
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

describe('the buildings a campaign starts with (F07)', () => {
  const anchors = [{ building: 'mill', gdpBillionUsdPerLevel: 10 }];

  it('sizes the anchor buildings by GDP and adds the suppliers they need', () => {
    const { data } = newGame(anchors);
    // 50 billion US$: 5 mills; their 500 ore take 3 mines (2.5 rounded up),
    // and their coal and electricity 2 coal mines and 2 power plants.
    expect(startingCountryLevels(data, 50_000)).toEqual([3, 2, 2, 5]);
    expect(startingCountryLevels(data, 1_000)).toEqual([0, 0, 0, 0]);
  });

  it("shares a country's levels among its provinces by population", () => {
    const { state, cell } = newGame(anchors);
    const level = (provinceId: string, type: string) =>
      state.buildings.level[cell(provinceId, type)];
    // alpha_west has 1.2 million people, alpha_east 0.8 million.
    expect([level('alpha_west', 'mill'), level('alpha_east', 'mill')]).toEqual([3, 2]);
    expect([level('alpha_west', 'mine'), level('alpha_east', 'mine')]).toEqual([2, 1]);
    expect([level('alpha_west', 'coal_mine'), level('alpha_east', 'coal_mine')]).toEqual([1, 1]);
    expect(level('beta_main', 'mill')).toBe(0);
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
  const anchors = [{ building: 'mill', gdpBillionUsdPerLevel: 10 }];

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
    expect(sent.typeCount).toBe(4);
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
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(5);
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
      { ...buildings, levels: [99, 0, 1] },
      { ...buildings, levels: [0, 9, 1] },
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
      issues((raw) => (raw.goods = { goods: [{ id: 'ore', unit: 't' }], electricity: 'power' })),
    ).toContain('unknown good "power"');
    expect(withBuildings((b) => b.buildings.push({ ...b.buildings[0] }))).toContain(
      'duplicate building "mine"',
    );
    const worker = (group: string) =>
      withBuildings((b) => (b.buildings[0].workers = { [group]: 5 } as never));
    expect(worker('wizards')).toContain('unknown pop group "wizards"');
    expect(worker('soldiers')).toContain(`buildings can't hire "soldiers"`);
    expect(worker('owners')).toContain(`buildings can't hire "owners"`);
    expect(withBuildings((b) => (b.buildings[3].inputs = { gold: 1 } as never))).toContain(
      'unknown good "gold"',
    );
    expect(withBuildings((b) => (b.buildings[3].inputs = { electricity: 1 } as never))).toContain(
      'electricity is not an input',
    );
    expect(withBuildings((b) => (b.buildings[3].inputs = { steel: 1 } as never))).toContain(
      '"steel" is both an input and an output',
    );
    expect(withBuildings((b) => (b.buildings[0].outputs = { electricity: 5 } as never))).toContain(
      'only buildings of the energy category make electricity',
    );
    expect(
      withBuildings(
        (b) => (b.startingBuildings.anchors = [{ building: 'castle', gdpBillionUsdPerLevel: 5 }]),
      ),
    ).toContain('unknown building "castle"');
  });
});

describe('the game starts with the building systems', () => {
  it('runs production in the energy, resource production and industry slots', () => {
    const { state } = newGame();
    state.enableProfiling(() => 0);
    state.advanceDay();
    expect(state.getSystemTimings().map((timing) => timing.id)).toEqual([
      'population',
      'energy',
      'resourceProduction',
      'industry',
    ]);
  });
});
