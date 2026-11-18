import { describe, expect, it } from 'vitest';
import {
  GameState,
  SAVE_FORMAT_VERSION,
  createSnapshot,
  deserializeGameState,
  ensurePopulationReport,
  hashGameState,
  parseGameData,
  removePeople,
  serializeGameState,
  startingGroupShares,
  worldPopulation,
} from '../src';
import { testData, type testPops, testRawData } from './helpers';

/**
 * The population model (F06) on the tiny test world: AAA (2 million people
 * in two provinces, 25,000 US$ a head) and BBB (500,000 people, 2,000 US$ a head).
 */
const GROUPS = ['laborers', 'skilled_workers', 'professionals', 'owners', 'officials', 'soldiers'];
const [LABORERS, SKILLED, PROFESSIONALS, OWNERS, , SOLDIERS] = [0, 1, 2, 3, 4, 5];

function newGame(change?: (raw: ReturnType<typeof testRawData>) => void) {
  const raw = testRawData();
  change?.(raw);
  const data = parseGameData(raw);
  const state = new GameState({ data, seed: 1 });
  const province = (id: string) => state.world.provinceIndex.get(id)!;
  const country = (id: string) => state.world.countryIndex.get(id)!;
  const pop = (provinceId: string, group: number) => province(provinceId) * GROUPS.length + group;
  return { data, state, province, country, pop };
}

const run = (state: GameState, days: number) => {
  for (let i = 0; i < days; i++) state.advanceDay();
};

const sum = (values: ArrayLike<number>, from = 0, to = values.length) => {
  let total = 0;
  for (let i = from; i < to; i++) total += values[i];
  return total;
};

describe('the population at the start of a campaign (F06)', () => {
  it("splits each province's people into dependents and pops from its country's data", () => {
    const { state, province, pop } = newGame();
    const population = state.population;
    expect(population.groupIds).toEqual(GROUPS);
    expect(population.militaryGroup).toBe(SOLDIERS);

    // alpha_west: 1.2 million people, half of them in the labor force, 1 % of those soldiers.
    const west = province('alpha_west');
    expect(population.dependents[west]).toBeCloseTo(600_000, 6);
    expect(population.size[pop('alpha_west', SOLDIERS)]).toBeCloseTo(6_000, 6);
    const workforce = sum(population.size, west * 6, west * 6 + 6);
    expect(workforce).toBeCloseTo(600_000, 6);
    // Owners are 2 % of the civilians in every row of the test data.
    expect(population.size[pop('alpha_west', OWNERS)]).toBeCloseTo(594_000 * 0.02, 6);
    expect(worldPopulation(population)).toBeCloseTo(2_500_000, 4);
  });

  it('mixes the starting shares by GDP per person', () => {
    const pops = parseGameData(testRawData()).pops;
    expect(startingGroupShares(pops, 300)).toEqual([0.7, 0.15, 0.05, 0.02, 0.08]);
    expect(startingGroupShares(pops, 900_000)).toEqual([0.4, 0.3, 0.2, 0.02, 0.08]);
    // Halfway between 1,000 and 50,000 on a logarithmic scale.
    const middle = startingGroupShares(pops, Math.sqrt(1000 * 50_000));
    expect(middle[0]).toBeCloseTo(0.55, 9);
    expect(middle[2]).toBeCloseTo(0.125, 9);
    expect(sum(middle)).toBeCloseTo(1, 9);
    // The richer country has fewer laborers and more professionals.
    const { state, province, pop } = newGame();
    const share = (provinceId: string, group: number) => {
      const row = province(provinceId) * 6;
      return (
        state.population.size[pop(provinceId, group)] / sum(state.population.size, row, row + 6)
      );
    };
    expect(share('alpha_west', LABORERS)).toBeLessThan(share('beta_main', LABORERS));
    expect(share('alpha_west', PROFESSIONALS)).toBeGreaterThan(share('beta_main', PROFESSIONALS));
  });

  it("starts with each country's real unemployment, and nobody unemployed among owners and soldiers", () => {
    const { state, country } = newGame();
    const report = ensurePopulationReport(state);
    for (const [id, rate] of [
      ['AAA', 0.05],
      ['BBB', 0.1],
    ] as const) {
      const row = country(id) * 6;
      const people = sum(report.countryGroupSize, row, row + 6);
      const working = sum(report.countryGroupEmployed, row, row + 6);
      expect(1 - working / people).toBeCloseTo(rate, 9);
      expect(report.countryGroupEmployed[row + OWNERS]).toBeCloseTo(
        report.countryGroupSize[row + OWNERS],
        6,
      );
      expect(report.countryGroupEmployed[row + SOLDIERS]).toBeCloseTo(
        report.countryGroupSize[row + SOLDIERS],
        6,
      );
    }
  });

  it("pays each country's pops their share of its GDP, better-paid groups more", () => {
    const { state, country } = newGame();
    const report = ensurePopulationReport(state);
    const row = country('AAA') * 6;
    let paidPerDay = 0;
    for (let g = 0; g < 6; g++)
      paidPerDay += report.countryGroupEmployed[row + g] * report.countryGroupWage[row + g];
    // 60 % of 50 billion US$ a year.
    expect(paidPerDay * 365).toBeCloseTo(0.6 * 50_000e6, 0);
    expect(report.countryGroupWage[row + SKILLED]).toBeCloseTo(
      2 * report.countryGroupWage[row + LABORERS],
      9,
    );
    expect(report.countryGroupWage[row + OWNERS]).toBeCloseTo(
      6 * report.countryGroupWage[row + LABORERS],
      9,
    );
  });
});

describe('population growth (F06)', () => {
  it("grows by the country's births minus deaths, and keeps the workforce's share", () => {
    const { state, country } = newGame();
    run(state, 365);
    const report = ensurePopulationReport(state);
    // AAA: 10 births and 9 deaths per 1,000 people a year; BBB: 35 and 10.
    expect(report.countryPopulation[country('AAA')] / 2_000_000).toBeCloseTo(1.001, 4);
    expect(report.countryPopulation[country('BBB')] / 500_000).toBeCloseTo(1.0253, 3);
    const a = country('AAA');
    expect(1 - report.countryDependents[a] / report.countryPopulation[a]).toBeCloseTo(0.5, 6);
    const b = country('BBB');
    expect(1 - report.countryDependents[b] / report.countryPopulation[b]).toBeCloseTo(0.35, 6);
  });

  it('shrinks where more people die than are born', () => {
    const { state, country } = newGame((raw) => {
      const start = raw.countryStart as {
        countries: { birthsPerThousand: number; deathsPerThousand: number }[];
      };
      start.countries[0].birthsPerThousand = 6;
      start.countries[0].deathsPerThousand = 13;
    });
    run(state, 365 * 3);
    const population = ensurePopulationReport(state).countryPopulation[country('AAA')];
    expect(population).toBeLessThan(2_000_000 * 0.98);
    expect(population).toBeGreaterThan(2_000_000 * 0.975);
  });

  it('with no births and no deaths, people only move between dependents and the workforce', () => {
    const { state } = newGame((raw) => {
      const start = raw.countryStart as {
        countries: { birthsPerThousand: number; deathsPerThousand: number }[];
      };
      for (const c of start.countries) c.birthsPerThousand = c.deathsPerThousand = 0;
    });
    run(state, 800);
    expect(worldPopulation(state.population)).toBeCloseTo(2_500_000, 3);
  });

  it('leaves an empty province empty', () => {
    const { state, province } = newGame((raw) => {
      const start = raw.provinceStart as { provinces: { id: string; population: number }[] };
      start.provinces[0].population = 2_000_000; // alpha_west takes everyone
      start.provinces[1].population = 0; // alpha_east is empty
    });
    run(state, 400);
    const report = ensurePopulationReport(state);
    const east = province('alpha_east');
    expect(report.provincePopulation[east]).toBe(0);
    expect(report.provinceStandardOfLiving[east]).toBe(0);
    expect([...report.standardOfLiving].every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(worldPopulation(report))).toBe(true);
  });

  it('removes casualties for good', () => {
    const { state, province, pop } = newGame();
    const population = state.population;
    const west = province('alpha_west');
    const soldiers = population.size[pop('alpha_west', SOLDIERS)];
    expect(removePeople(population, west, SOLDIERS, 1_000)).toBe(1_000);
    expect(population.size[pop('alpha_west', SOLDIERS)]).toBeCloseTo(soldiers - 1_000, 6);
    // Never more than are there.
    expect(removePeople(population, west, SOLDIERS, 1e9)).toBeCloseTo(soldiers - 1_000, 6);
    // From everyone in proportion.
    const before = ensurePopulationReport(state).provincePopulation[west];
    const dependents = population.dependents[west];
    expect(removePeople(population, west, -1, before / 10)).toBeCloseTo(before / 10, 6);
    expect(population.dependents[west]).toBeCloseTo(dependents * 0.9, 6);
    expect(ensurePopulationReport(state).provincePopulation[west]).toBeCloseTo(before * 0.9, 6);
    expect(removePeople(population, west, -1, -5)).toBe(0);
  });
});

describe('jobs and job changes (F06)', () => {
  const scaleJobs = (state: GameState, province: string, group: string | null, factor: number) =>
    state.applyCommand({ type: 'debugScaleJobs', province, group, factor });

  it('closing jobs leaves people unemployed; the placeholder economy slowly opens them again', () => {
    const { state, province } = newGame();
    const west = province('alpha_west');
    const unemployment = () => {
      const report = ensurePopulationReport(state);
      const workforce = report.provincePopulation[west] - report.dependents[west];
      return 1 - report.provinceEmployed[west] / workforce;
    };
    expect(unemployment()).toBeCloseTo(0.05, 9);
    expect(scaleJobs(state, 'alpha_west', null, 0.5)).toEqual({ ok: true });
    const after = unemployment();
    expect(after).toBeGreaterThan(0.5);
    run(state, 7 * 20);
    expect(unemployment()).toBeLessThan(after * 0.6);
    run(state, 7 * 200);
    expect(unemployment()).toBeCloseTo(0.05, 2);
  });

  it('open jobs that pay better draw people up, slowly (training)', () => {
    const { state, pop } = newGame();
    const population = state.population;
    const laborers = population.size[pop('alpha_east', LABORERS)];
    const skilled = population.size[pop('alpha_east', SKILLED)];
    scaleJobs(state, 'alpha_east', 'skilled_workers', 2);
    run(state, 7); // one Monday
    const moved = population.size[pop('alpha_east', SKILLED)] - skilled;
    // At most 1 % of the laborers a week (test data), give or take a week's growth.
    expect(moved).toBeGreaterThan(laborers * 0.009);
    expect(moved).toBeLessThan(laborers * 0.0101);
    expect(population.size[pop('alpha_east', LABORERS)]).toBeLessThan(laborers * 0.9911);
    // The other province is untouched.
    expect(
      population.size[pop('alpha_west', SKILLED)] / population.size[pop('alpha_west', LABORERS)],
    ).toBeCloseTo(skilled / laborers, 9);
  });

  it('the unemployed take worse-paid work at once, but nobody with a job moves down', () => {
    const { state, pop } = newGame();
    const population = state.population;
    // Laborer jobs open while half the skilled jobs close.
    scaleJobs(state, 'beta_main', 'laborers', 3);
    scaleJobs(state, 'beta_main', 'skilled_workers', 0.5);
    const skilled = population.size[pop('beta_main', SKILLED)];
    const jobs = population.jobs[pop('beta_main', SKILLED)];
    run(state, 7 * 30);
    // The unemployed skilled workers became laborers (5 % of the group a week)…
    expect(population.size[pop('beta_main', SKILLED)]).toBeLessThan(skilled * 0.8);
    // …but those with a job stayed.
    expect(population.size[pop('beta_main', SKILLED)]).toBeGreaterThan(jobs * 0.99);
  });

  it('refuses a bad debugScaleJobs command', () => {
    const { state } = newGame();
    expect(scaleJobs(state, 'atlantis', null, 2)).toMatchObject({
      ok: false,
      reasonKey: 'COMMAND_UNKNOWN_PROVINCE',
    });
    expect(scaleJobs(state, 'beta_main', 'wizards', 2)).toMatchObject({ ok: false });
    expect(scaleJobs(state, 'beta_main', null, -1)).toMatchObject({ ok: false });
    expect(scaleJobs(state, 'beta_main', null, Number.NaN)).toMatchObject({ ok: false });
  });
});

describe('wealth and standard of living (F06, F65: Victoria 3)', () => {
  it('starts every pop at the wealth its income buys, and that is its standard of living', () => {
    const { state, country } = newGame();
    const report = ensurePopulationReport(state);
    for (let i = 0; i < report.standardOfLiving.length; i++) {
      if (state.population.size[i] <= 0) continue;
      expect(report.standardOfLiving[i]).toBeGreaterThanOrEqual(1);
      expect(report.standardOfLiving[i]).toBeLessThanOrEqual(99);
      // No shortages yet: the standard of living is the wealth; the pop expects a little less.
      expect(report.standardOfLiving[i]).toBeCloseTo(state.population.wealth[i], 4);
      expect(state.population.expectedLiving[i]).toBeCloseTo(
        Math.max(1, state.population.wealth[i] - 5),
        4,
      );
    }
    // The rich country lives better than the poor one, owners better than laborers.
    const living = (id: string, group: number) =>
      report.countryGroupStandardOfLiving[country(id) * 6 + group];
    expect(living('AAA', LABORERS)).toBeGreaterThan(living('BBB', LABORERS));
    expect(living('BBB', OWNERS)).toBeGreaterThan(living('BBB', LABORERS));
    expect(living('AAA', PROFESSIONALS)).toBeGreaterThan(living('AAA', LABORERS));
  });

  it('unemployment lowers wealth, and with it the standard of living, week by week', () => {
    const { state, province } = newGame();
    const east = province('alpha_east');
    const before = ensurePopulationReport(state).provinceStandardOfLiving[east];
    state.applyCommand({
      type: 'debugScaleJobs',
      province: 'alpha_east',
      group: null,
      factor: 0.5,
    });
    // Wealth only moves on Mondays: nothing yet.
    expect(ensurePopulationReport(state).provinceStandardOfLiving[east]).toBeCloseTo(before, 6);
    for (let day = 0; day < 7 * 4; day++) state.advanceDay();
    const month = ensurePopulationReport(state).provinceStandardOfLiving[east];
    expect(month).toBeLessThan(before - 0.5);
    // A tenth of the gap a week: it keeps falling.
    for (let day = 0; day < 7 * 26; day++) state.advanceDay();
    const halfYear = ensurePopulationReport(state).provinceStandardOfLiving[east];
    expect(halfYear).toBeLessThan(month - 0.2);
    expect(halfYear).toBeLessThan(before - 2);
  });

  it('checks pops.json: groups, shares, needs, wealth packages and job changes', () => {
    const issues = (change: (pops: ReturnType<typeof testPops>) => void): string => {
      const raw = testRawData();
      change(raw.pops as ReturnType<typeof testPops>);
      try {
        parseGameData(raw);
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    };
    expect(issues(() => undefined)).toBe('');
    expect(issues((pops) => (pops.groups[5].military = false))).toContain('exactly one group');
    expect(issues((pops) => (pops.groups[1].id = 'laborers'))).toContain('duplicate pop group');
    expect(issues((pops) => (pops.startingShares[0].shares.laborers = 0.5))).toContain('add up to');
    expect(issues((pops) => pops.startingShares.reverse())).toContain('from poor to rich');
    expect(issues((pops) => pops.wealth.packages.reverse())).toContain('from poor to rich');
    expect(issues((pops) => (pops.wealth.packages[1].needs.services = 0.5))).toContain(
      'cost more than the one before',
    );
    expect(issues((pops) => (pops.wealth.packages[2].level = 98))).toContain('level 99');
    expect(issues((pops) => ((pops.wealth.packages[0].needs as Record<string, number>).food = 1))).toContain(
      'unknown need "food"',
    );
    expect(issues((pops) => (pops.needs[0].goods![0].good = 'gold'))).toContain(
      'unknown good "gold"',
    );
    expect(issues((pops) => (pops.jobChanges[0].to = 'soldiers'))).toContain(
      'not a civilian pop group',
    );
  });

  it('checks province_start.json against the map and the countries', () => {
    const issues = (change: (provinces: { id: string; population: number }[]) => void): string => {
      const raw = testRawData();
      change((raw.provinceStart as { provinces: { id: string; population: number }[] }).provinces);
      try {
        parseGameData(raw);
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    };
    expect(issues((provinces) => (provinces[0].population += 1))).toContain(
      'the provinces of "AAA" hold 2000001 people, but the country has 2000000',
    );
    expect(issues((provinces) => provinces.pop())).toContain(
      'no starting population for province "beta_main"',
    );
    expect(issues((provinces) => (provinces[2].id = 'atlantis'))).toContain(
      'unknown province "atlantis"',
    );
  });
});

describe('the population in the report, the snapshot and the save (F06)', () => {
  it('counts a province’s people with its current owner', () => {
    const { state, country } = newGame();
    const before = ensurePopulationReport(state);
    const version = before.version;
    expect(before.countryPopulation[country('AAA')]).toBeCloseTo(2_000_000, 4);
    state.applyCommand({ type: 'debugSetProvinceOwner', province: 'alpha_east', country: 'BBB' });
    const after = ensurePopulationReport(state);
    expect(after.version).toBeGreaterThan(version);
    expect(after.countryPopulation[country('AAA')]).toBeCloseTo(1_200_000, 4);
    expect(after.countryPopulation[country('BBB')]).toBeCloseTo(1_300_000, 4);
    // Asking again without a change doesn't redo it.
    expect(ensurePopulationReport(state).version).toBe(after.version);
  });

  it('sends the population in the snapshot only when it changed', () => {
    const { state, province } = newGame();
    const first = createSnapshot(state);
    expect(first.population?.groupCount).toBe(6);
    expect(first.population?.provincePopulation[province('beta_main')]).toBeCloseTo(500_000, 4);
    expect(first.population?.popSize).toHaveLength(18);
    const second = createSnapshot(state, first);
    expect(second.populationVersion).toBe(first.populationVersion);
    expect(second.population).toBeUndefined();
    state.advanceDay();
    const third = createSnapshot(state, first);
    expect(third.populationVersion).toBeGreaterThan(first.populationVersion);
    expect(third.population?.provincePopulation[province('beta_main')]).toBeGreaterThan(500_000);
    // The snapshot holds copies: the sim's own arrays keep changing.
    const kept = third.population!.provincePopulation[0];
    run(state, 30);
    ensurePopulationReport(state);
    expect(third.population!.provincePopulation[0]).toBe(kept);
  });

  it('a loaded game continues exactly like the original', () => {
    const { data, state } = newGame();
    state.applyCommand({
      type: 'debugScaleJobs',
      province: 'alpha_west',
      group: 'laborers',
      factor: 0.7,
    });
    run(state, 100);
    const text = JSON.stringify(serializeGameState(state));
    const loaded = deserializeGameState(JSON.parse(text), { data });
    expect(hashGameState(loaded)).toBe(hashGameState(state));
    // The report is the state's own: the loaded game shows the same numbers.
    expect([...ensurePopulationReport(loaded).standardOfLiving]).toEqual([
      ...ensurePopulationReport(state).standardOfLiving,
    ]);
    run(state, 300);
    run(loaded, 300);
    expect(hashGameState(loaded)).toBe(hashGameState(state));
    expect(worldPopulation(loaded.population)).toBe(worldPopulation(state.population));
  });

  it('is deterministic, and different after a different history', () => {
    const a = newGame().state;
    const b = newGame().state;
    run(a, 200);
    run(b, 200);
    expect(hashGameState(a)).toBe(hashGameState(b));
    const c = newGame().state;
    c.applyCommand({ type: 'debugScaleJobs', province: 'beta_main', group: null, factor: 0.9 });
    run(c, 200);
    expect(hashGameState(c)).not.toBe(hashGameState(a));
  });

  it('loads a version 3 save (from before the population) with the starting population', () => {
    const { data, state } = newGame();
    const { population: _population, ...old } = serializeGameState(state);
    void _population;
    const loaded = deserializeGameState({ ...old, saveVersion: 3 }, { data });
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(4);
    expect(worldPopulation(loaded.population)).toBeCloseTo(2_500_000, 4);
    expect(hashGameState(loaded)).toBe(hashGameState(state));
  });

  it('rejects a save whose population does not fit the game', () => {
    const { data, state } = newGame();
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
    const { population } = good;
    expect(key({ ...good, population: { ...population, groups: ['a', 'b'] } })).toBe(
      'SAVE_ERROR_CORRUPT',
    );
    expect(key({ ...good, population: { ...population, size: population.size.slice(1) } })).toBe(
      'SAVE_ERROR_CORRUPT',
    );
    expect(key({ ...good, population: { ...population, dependents: [-1, 0, 0] } })).toBe(
      'SAVE_ERROR_CORRUPT',
    );
  });
});

describe('the game starts with the population system', () => {
  it('runs growth in the population slot by default', () => {
    const state = new GameState({ data: testData(), seed: 3 });
    const before = worldPopulation(state.population);
    state.advanceDay();
    expect(worldPopulation(state.population)).not.toBe(before);
    expect(state.getSystemTimings().map((timing) => timing.id)).toContain('population');
  });
});
