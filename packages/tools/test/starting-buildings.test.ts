import {
  GameState,
  buildingsSchema,
  ensureBuildingsReport,
  ensurePopulationReport,
  popsSchema,
} from '@terra-scutum/sim';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type ProductionConfig,
  type StartProvince,
  buildStartingBuildings,
  levelsFor,
  methodMix,
  productionConfigSchema,
} from '../src/starting-data/build-starting-buildings';
import {
  type ProductionSnapshot,
  energyByCountry,
  splitCsvLine,
} from '../src/starting-data/snapshot-production';
import { DATA_DIR, REPO_ROOT, loadGameDataFromDisk } from '../src/load-data';

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const buildings = buildingsSchema.parse(readJson(join(DATA_DIR, 'buildings.json')));
const pops = popsSchema.parse(readJson(join(DATA_DIR, 'pops.json')));
const config = productionConfigSchema.parse(
  readJson(join(REPO_ROOT, 'packages/tools/starting-data/production.json')),
);

describe('the rules of the starting buildings (F85)', () => {
  it('splits levels between the two methods around a number of jobs', () => {
    expect(methodMix([1000, 10_000, 100_000], 500)).toEqual([1, 0, 0]);
    expect(methodMix([1000, 10_000, 100_000], 1000)).toEqual([1, 0, 0]);
    const mix = methodMix([1000, 10_000, 100_000], 5500);
    expect(mix[0]).toBeCloseTo(0.5, 9);
    expect(mix[1]).toBeCloseTo(0.5, 9);
    expect(mix[2]).toBe(0);
    expect(methodMix([1000, 10_000, 100_000], 1e9)).toEqual([0, 0, 1]);
    expect(methodMix([300], 5000)).toEqual([1]);
  });

  it('rounds what a country makes to levels, at least one from a quarter of a level', () => {
    expect(levelsFor(1499, 500, 0.25)).toBe(3);
    expect(levelsFor(100, 500, 0.25)).toBe(0);
    expect(levelsFor(130, 500, 0.25)).toBe(1);
    expect(levelsFor(0, 500, 0.25)).toBe(0);
    expect(levelsFor(1e12, 1, 0.25)).toBe(65535);
  });

  it('reads the energy dataset: quoted fields, each figure from its latest year, territories added', () => {
    expect(splitCsvLine('a,"b, c",,"d ""e"""')).toEqual(['a', 'b, c', '', 'd "e"']);
    const csv = [
      'country,year,iso_code,coal_production,oil_production,gas_production,oil_consumption,coal_electricity,gas_electricity,oil_electricity,nuclear_electricity,hydro_electricity,other_renewable_electricity,wind_electricity,solar_electricity',
      'Aland,2023,AAA,5,1,,,10,,,,,,,',
      'Aland,2024,AAA,,,,,12,1,,,3,,,',
      'Aland,2026,AAA,,,,,99,,,,,,,',
      'Isle,2024,TER,,,,,2,,,,,,,',
    ].join('\n');
    const energy = energyByCountry(csv, new Map([['AAA', ['AAA', 'TER']]]), 2025);
    expect(energy.AAA).toMatchObject({
      year: 2024,
      coal_production: 5,
      oil_production: 1,
      coal_electricity: 14,
      gas_electricity: 1,
      hydro_electricity: 3,
    });
  });

  it('builds a small world: real output, methods by productivity, placed in its provinces', () => {
    const snapshot: ProductionSnapshot = {
      downloaded: 'test',
      worldBank: {
        lastUpdated: 'test',
        values: {
          agricultureJobsPercent: { USA: [2025, 2], POR: [2025, 60] },
          industryJobsPercent: { USA: [2025, 20], POR: [2025, 10] },
          agricultureValuePercent: { USA: [2024, 1], POR: [2024, 30] },
          industryValuePercent: { USA: [2024, 20], POR: [2024, 15] },
          manufacturingValuePercent: { USA: [2024, 10], POR: [2024, 5] },
          cerealTonnes: { USA: [2024, 400e6], POR: [2024, 2e6] },
          fishTonnes: { USA: [2024, 5e6] },
        },
      },
      energy: {
        title: 'test',
        url: '',
        licence: 'test',
        values: {
          USA: { year: 2024, coal_production: 1000, coal_electricity: 500, oil_consumption: 9000 },
        },
      },
    };
    const testConfig: ProductionConfig = {
      ...config,
      handTables: { ...config.handTables, steel: { USA: 80_000 } },
      mainProvinces: { note: '', coal_mine: { USA: { usa_wyoming: 1 } } },
      // A world of two countries grows less.
      rules: {
        ...config.rules,
        farming: { worldGrainMt: 50, realCerealWeight: 0.5, worldLivestockMt: 20 },
      },
    };
    const provinces: StartProvince[] = [
      { id: 'usa_wyoming', country: 'USA', areaKm2: 250_000, coastal: false, population: 600_000 },
      { id: 'usa_texas', country: 'USA', areaKm2: 690_000, coastal: true, population: 30e6 },
      { id: 'usa_new_york', country: 'USA', areaKm2: 140_000, coastal: true, population: 20e6 },
      { id: 'por_north', country: 'POR', areaKm2: 50_000, coastal: true, population: 5e6 },
      { id: 'por_south', country: 'POR', areaKm2: 40_000, coastal: false, population: 3e6 },
    ];
    const country = (id: string, population: number, gdp: number) => ({
      id,
      population,
      gdpMillionUsd: gdp,
      governmentType: 'presidential_democracy',
      populationSource: 'test',
      gdpSource: 'test',
      birthsPerThousand: 10,
      deathsPerThousand: 8,
      laborForceShare: 0.5,
      unemploymentRate: 0.05,
      armedForcesShare: 0.01,
      demographicsSource: 'test',
    });
    const result = buildStartingBuildings({
      config: testConfig,
      snapshot,
      countries: [country('USA', 50.6e6, 5e6), country('POR', 8e6, 16_000)],
      provinces,
      buildings,
      pops,
      year: 2025,
    });
    expect(result.errors).toEqual([]);
    const at = (province: string, building: string) =>
      result.file.provinces
        .find((p) => p.id === province)
        ?.buildings.find(([id]) => id === building);
    // Coal: 1,000 TWh ÷ 6 MWh a tonne = 456,621 t a day = 76 mines, all in Wyoming.
    expect(at('usa_wyoming', 'coal_mine')).toEqual(['coal_mine', 'mechanized_mining', 76]);
    expect(at('usa_texas', 'coal_mine')).toBeUndefined();
    // Steel: 80 Mt a year = 44 levels, by population.
    const steel = ['usa_wyoming', 'usa_texas', 'usa_new_york'].reduce(
      (sum, id) => sum + (at(id, 'steel_mill')?.[2] ?? 0),
      0,
    );
    expect(steel).toBe(44);
    // Refineries go to the coast.
    expect(at('usa_wyoming', 'oil_refinery')).toBeUndefined();
    // The poor country farms by hand, and its farms employ its farm workers.
    const farm = at('por_north', 'farm')!;
    expect(farm[1]).not.toBe('mechanized_farming');
    const row = result.rows.find((r) => r.id === 'POR')!;
    expect(row.agricultureFactor).toBeGreaterThan(5);
    expect(row.buildingAgricultureJobs / row.agricultureJobs).toBeGreaterThan(0.8);
    expect(row.buildingAgricultureJobs / row.agricultureJobs).toBeLessThan(1.2);
    // Its few power plants are topped up for what its buildings need.
    expect(result.warnings.some((w) => w.startsWith('POR:') && w.includes('gas_power_plant'))).toBe(
      true,
    );
  });

  it('reports unknown buildings and provinces in the hand-written config', () => {
    const result = buildStartingBuildings({
      config: { ...config, mainProvinces: { note: '', castle: { USA: { atlantis: 1 } } } },
      snapshot: {
        downloaded: '',
        worldBank: { lastUpdated: '', values: {} },
        energy: { title: '', url: '', licence: '', values: {} },
      },
      countries: [],
      provinces: [],
      buildings,
      pops,
      year: 2025,
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'mainProvinces: unknown building "castle"',
        'mainProvinces.castle.USA: unknown province "atlantis"',
      ]),
    );
  });
});

describe('the real starting buildings (F85)', () => {
  const data = loadGameDataFromDisk();
  const state = new GameState({ data, seed: 1 });
  const report = ensureBuildingsReport(state);
  const yearly = (good: string) => {
    const g = report.goodIds.indexOf(good);
    let total = 0;
    for (let c = 0; c < state.world.countryIds.length; c++)
      total += report.capacityMake[c * report.goodCount + g];
    return total * 365;
  };

  it('make about what the world really made in 2024', () => {
    expect(yearly('steel') / 1e6).toBeGreaterThan(1800);
    expect(yearly('steel') / 1e6).toBeLessThan(1950);
    expect(yearly('coal') / 1e6).toBeGreaterThan(8000);
    expect(yearly('crude_oil') / 1e6).toBeGreaterThan(4200);
    expect(yearly('aluminum') / 1e6).toBeGreaterThan(65);
    expect(yearly('grain') / 1e6).toBeGreaterThan(2900);
    expect(yearly('electricity') / 1e6).toBeGreaterThan(29_000);
  });

  it('are where they really are, and run as the countries really do', () => {
    const levels = (provinceId: string, building: string) =>
      report.level[
        state.world.provinceIndex.get(provinceId)! * report.typeCount +
          report.typeIds.indexOf(building)
      ];
    expect(levels('aus_western_australia', 'iron_mine')).toBeGreaterThan(200);
    expect(levels('chl_antofagasta', 'copper_mine')).toBeGreaterThan(20);
    expect(levels('sau_eastern', 'oil_field')).toBeGreaterThan(200);
    expect(levels('fra_ile_de_france', 'nuclear_power_plant') ?? 0).toBeGreaterThanOrEqual(0);
    const method = (provinceId: string, building: string) => {
      const t = report.typeIds.indexOf(building);
      return report.methodIds[t][
        report.method[state.world.provinceIndex.get(provinceId)! * report.typeCount + t]
      ];
    };
    expect(method('usa_iowa', 'farm')).toBe('mechanized_farming');
    expect(method('ind_uttar_pradesh', 'farm')).not.toBe('mechanized_farming');
  });

  it('give about a third of the world’s jobs, and the rest of the economy keeps the real unemployment', () => {
    const population = ensurePopulationReport(state);
    let jobs = 0;
    let buildingJobs = 0;
    for (let i = 0; i < population.jobs.length; i++) {
      jobs += population.jobs[i];
      buildingJobs += population.buildingJobs[i];
    }
    expect(buildingJobs / jobs).toBeGreaterThan(0.27);
    expect(buildingJobs / jobs).toBeLessThan(0.36);
    const usa = state.world.countryIndex.get('USA')!;
    let people = 0;
    let employed = 0;
    for (let g = 0; g < population.groupCount; g++) {
      people += population.countryGroupSize[usa * population.groupCount + g];
      employed += population.countryGroupEmployed[usa * population.groupCount + g];
    }
    expect(1 - employed / people).toBeCloseTo(state.countryStart.unemploymentRate[usa], 2);
  });
});
