import { describe, expect, it } from 'vitest';
import {
  type ImfSnapshot,
  type StartingDataConfig,
  type WorldBankSnapshot,
  buildProvinceStart,
  buildStartingData,
} from '../src/starting-data/build-starting-data';
import {
  createProvinceGrid,
  geoPackagePolygonCenter,
  shareWholeNumbers,
  webMercatorToLonLat,
} from '../src/starting-data/province-population';
import { GameState, ensurePopulationReport, worldPopulation } from '@terra-scutum/sim';
import { loadGameDataFromDisk } from '../src/load-data';

const imf: ImfSnapshot = {
  edition: 'World Economic Outlook (test)',
  downloaded: '2026-01-01',
  values: {
    NGDPD: { AAA: { '2025': 50 }, BBB: { '2025': 2 }, HKX: { '2025': 4 }, UVX: { '2025': 1.5 } },
    LP: { AAA: { '2025': 2.1 }, TWX: { '2025': 23.3 } },
  },
};
const worldBank: WorldBankSnapshot = {
  lastUpdated: '2026-01-01',
  downloaded: '2026-01-01',
  populationYear: 2025,
  population: { AAA: 2_000_000, BBB: 500_000, CCC: 300_000, HKX: 7_000_000, XKZ: 1_600_000 },
  gdpLatest: { BBB: [2025, 2.5e9], CCC: [2019, 9e8], OLD: [2010, 1e9] },
  demographics: {
    birthRate: { AAA: [2024, 10.5], BBB: [2024, 30], CCC: [2024, 20], XKZ: [2024, 12] },
    deathRate: { AAA: [2024, 9], BBB: [2024, 8], CCC: [2024, 7], XKZ: [2024, 6] },
    laborForce: { AAA: [2025, 1_000_000], BBB: [2025, 200_000], CCC: [2025, 120_000] },
    unemployment: { AAA: [2025, 4.2], BBB: [2025, 10], CCC: [2025, 5] },
    armedForces: { AAA: [2020, 10_000], BBB: [2020, 4_000], CCC: [2020, 0] },
  },
};
const handWritten = {
  birthsPerThousand: 6,
  deathsPerThousand: 8,
  laborForceShare: 0.5,
  unemploymentRate: 0.03,
  armedForcesShare: 0.02,
  note: 'test estimate',
};
const config = (countries: StartingDataConfig['countries']): StartingDataConfig => ({
  year: 2025,
  sourceCodes: { KOS: { imf: 'UVX', worldBank: 'XKZ' } },
  territoryEstimates: { SAH: { population: 600_000, note: 'estimate' } },
  provinceEstimates: {},
  countries,
});
const democracy = { government: 'parliamentary_democracy' };

describe('building the starting data (F71)', () => {
  it('takes population from the World Bank and GDP from the IMF', () => {
    const result = buildStartingData(config({ AAA: democracy }), imf, worldBank, [{ id: 'AAA' }]);
    expect(result.errors).toEqual([]);
    expect(result.file.countries).toEqual([
      {
        id: 'AAA',
        population: 2_000_000,
        gdpMillionUsd: 50_000,
        governmentType: 'parliamentary_democracy',
        populationSource: 'worldBank',
        gdpSource: 'imfWeo',
        birthsPerThousand: 10.5,
        deathsPerThousand: 9,
        laborForceShare: 0.5,
        unemploymentRate: 0.042,
        armedForcesShare: 0.01,
        demographicsSource: 'worldBank',
      },
    ]);
    expect(Object.keys(result.file.sources).sort()).toEqual(['estimate', 'imfWeo', 'worldBank']);
  });

  it('falls back: IMF population, World Bank GDP (with its year), then estimates', () => {
    const result = buildStartingData(
      config({
        TWX: { ...democracy, gdpMillionUsd: 900_000, gdpNote: 'test', demographics: handWritten },
        CCC: democracy,
        BBB: { ...democracy, gdp: 'worldBank' },
      }),
      imf,
      worldBank,
      [{ id: 'TWX' }, { id: 'CCC' }, { id: 'BBB' }],
    );
    expect(result.errors).toEqual([]);
    const [bbb, ccc, twx] = result.file.countries;
    expect(twx).toMatchObject({ population: 23_300_000, populationSource: 'imfWeo' });
    expect(twx).toMatchObject({
      gdpMillionUsd: 900_000,
      gdpSource: 'estimate',
      notes: ['GDP: test', 'Demographics: test estimate'],
      birthsPerThousand: 6,
      laborForceShare: 0.5,
      demographicsSource: 'estimate',
    });
    expect(ccc).toMatchObject({ gdpMillionUsd: 900, gdpSource: 'worldBank', gdpYear: 2019 });
    // `"gdp": "worldBank"` picks the World Bank's figure over the IMF's.
    expect(bbb).toMatchObject({ gdpMillionUsd: 2_500, gdpSource: 'worldBank' });
    expect(bbb.gdpYear).toBeUndefined();
  });

  it('uses the sources’ own codes where they differ', () => {
    // The World Bank has birth and death rates for it, but no labor figures: those are hand-written.
    const result = buildStartingData(
      config({ KOS: { ...democracy, demographics: handWritten } }),
      imf,
      worldBank,
      [{ id: 'KOS' }],
    );
    expect(result.errors).toEqual([]);
    expect(result.file.countries[0]).toMatchObject({
      population: 1_600_000,
      gdpMillionUsd: 1_500,
      birthsPerThousand: 12,
      deathsPerThousand: 6,
      unemploymentRate: 0.03,
      demographicsSource: 'estimate',
    });
    // Without them the import says what is missing.
    const missing = buildStartingData(config({ KOS: democracy }), imf, worldBank, [{ id: 'KOS' }]);
    expect(missing.errors).toEqual([
      'KOS: no laborForceShare, unemploymentRate, armedForcesShare in the World Bank\'s figures; add them under "demographics" in starting-data/countries.json',
    ]);
  });

  it('adds merged territories and lists the ones with no figures', () => {
    const result = buildStartingData(config({ AAA: democracy }), imf, worldBank, [
      { id: 'AAA', includes: ['HKX', 'SAH', 'NOPE', 'OLD'] },
    ]);
    const aaa = result.file.countries[0];
    // HKX from the sources (population and GDP), SAH from the estimate (population only).
    expect(aaa.population).toBe(2_000_000 + 7_000_000 + 600_000);
    expect(aaa.gdpMillionUsd).toBe(50_000 + 4_000);
    expect(aaa.notes).toEqual([
      'Includes SAH: estimate',
      'Includes the figures of HKX (merged territories)',
    ]);
    expect(result.skippedTerritories).toEqual(['NOPE (in AAA)', 'OLD (in AAA)']);
  });

  it('reports countries it cannot fill and config entries for unknown countries', () => {
    const result = buildStartingData(config({ ZZZ: democracy, DDD: democracy }), imf, worldBank, [
      { id: 'DDD' },
      { id: 'EEE' },
    ]);
    expect(result.errors).toEqual([
      'countries.json lists "ZZZ", which is not a game country',
      'DDD: no population in any source; add an estimate to starting-data/countries.json',
      'EEE: no entry in starting-data/countries.json (government type)',
    ]);
  });
});

describe('where the people of a country live (F06)', () => {
  const countryStart = buildStartingData(
    config({ AAA: democracy, BBB: democracy }),
    imf,
    worldBank,
    [{ id: 'AAA' }, { id: 'BBB' }],
  ).file;
  const provinces = [
    { id: 'a_north', country: 'AAA', areaKm2: 100 },
    { id: 'a_south', country: 'AAA', areaKm2: 300 },
    { id: 'a_rock', country: 'AAA', areaKm2: 1 },
    { id: 'b_one', country: 'BBB', areaKm2: 50 },
    { id: 'b_two', country: 'BBB', areaKm2: 150 },
  ];
  const counted = {
    title: 'Test grid',
    url: '',
    licence: 'test',
    edition: 'test',
    downloaded: '2026-01-01',
    unassigned: 0,
    provinces: { a_north: 3_000, a_south: 1_000, a_rock: 9_000, b_one: 0, b_two: 0 },
  };

  it('shares whole numbers that add up exactly', () => {
    expect(shareWholeNumbers(10, [1, 1, 1], [1, 1, 1])).toEqual([4, 3, 3]);
    expect(shareWholeNumbers(100, [3, 1], [0, 0])).toEqual([75, 25]);
    expect(shareWholeNumbers(7, [0, 0], [1, 3])).toEqual([2, 5]);
    expect(shareWholeNumbers(5, [0, 0], [0, 0])).toEqual([3, 2]);
    expect(shareWholeNumbers(0, [1, 2], [1, 1])).toEqual([0, 0]);
  });

  it("shares each country's population by the people counted, hand-written provinces first", () => {
    const result = buildProvinceStart(countryStart, counted, provinces, {
      a_rock: { population: 400, note: 'drawn bigger than it is' },
    });
    expect(result.errors).toEqual([]);
    const people = Object.fromEntries(result.file.provinces.map((p) => [p.id, p.population]));
    expect(people.a_rock).toBe(400);
    expect(people.a_north).toBe((2_000_000 - 400) * 0.75);
    expect(people.a_north + people.a_south + people.a_rock).toBe(2_000_000);
    // Nobody counted in BBB: shared by area.
    expect(people.b_one).toBe(125_000);
    expect(people.b_two).toBe(375_000);
    expect(result.file.year).toBe(2025);
  });

  it('reports counts that do not fit the map', () => {
    const { a_south: _gone, ...fewer } = counted.provinces;
    void _gone;
    const result = buildProvinceStart(
      countryStart,
      { ...counted, provinces: { ...fewer, atlantis: 5 } },
      provinces,
      { nowhere: { population: 1, note: '' }, a_rock: { population: 3_000_000, note: '' } },
    );
    expect(result.errors.join('\n')).toContain('"nowhere", which is not a province');
    expect(result.errors.join('\n')).toContain('"atlantis", which is not a province');
    expect(result.errors.join('\n')).toContain('no count for "a_south"');
    expect(result.errors.join('\n')).toContain('AAA: its provinceEstimates hold 3000000 people');
  });

  it('reads the middle of a population hexagon, also across the date line', () => {
    const polygon = (xs: number[]) => {
      const blob = new Uint8Array(8 + 32 + 1 + 4 + 4 + 4 + xs.length * 16);
      const view = new DataView(blob.buffer);
      blob.set([0x47, 0x50, 0, 0x03]); // "GP", version 0, little-endian with an x/y envelope
      let at = 8 + 32;
      view.setUint8(at, 1);
      view.setUint32(at + 1, 3, true);
      view.setUint32(at + 5, 1, true);
      view.setUint32(at + 9, xs.length, true);
      at += 13;
      xs.forEach((x, i) => {
        view.setFloat64(at + i * 16, x, true);
        view.setFloat64(at + i * 16 + 8, i % 2 === 0 ? 10 : 30, true);
      });
      return blob;
    };
    expect(geoPackagePolygonCenter(polygon([0, 10, 20, 30, 0]), 360)).toEqual([15, 20]);
    // Corners at 178° and −178°: the middle is at 180°, not at 0°.
    const [x] = geoPackagePolygonCenter(polygon([178, -178, 178, -178, 178]), 360);
    expect(Math.abs(x)).toBe(180);
    const [lon, lat] = webMercatorToLonLat(1113194.9079327357, 6446275.841017158);
    expect(lon).toBeCloseTo(10, 6);
    expect(lat).toBeCloseTo(50, 6);
  });

  it('finds the province of a point, and the nearest one just off the coast', () => {
    const square = (west: number, south: number, size: number) => [
      [
        [
          [west, south],
          [west + size, south],
          [west + size, south + size],
          [west, south + size],
          [west, south],
        ] as [number, number][],
      ],
    ];
    const lookup = createProvinceGrid([square(0, 0, 10), square(10, 0, 10)], 0.5, 4);
    expect(lookup.provinceAt(5, 5)).toBe(0);
    expect(lookup.provinceAt(15, 5)).toBe(1);
    expect(lookup.provinceAt(21, 5)).toBe(1); // 1° off the coast
    expect(lookup.provinceAt(-1.2, 5)).toBe(0);
    expect(lookup.provinceAt(40, 5)).toBe(-1);
  });
});

describe('the real starting data', () => {
  const data = loadGameDataFromDisk();
  const byId = new Map(data.countryStart.countries.map((c) => [c.id, c]));

  it('covers the world: about 8.2 billion people and a GDP of about US$110–125 trillion', () => {
    const population = data.countryStart.countries.reduce((sum, c) => sum + c.population, 0);
    const gdp = data.countryStart.countries.reduce((sum, c) => sum + c.gdpMillionUsd, 0);
    expect(population).toBeGreaterThan(8.0e9);
    expect(population).toBeLessThan(8.4e9);
    expect(gdp / 1e6).toBeGreaterThan(110);
    expect(gdp / 1e6).toBeLessThan(125);
  });

  it('has plausible numbers for well-known countries', () => {
    // China includes Hong Kong and Macau; the USA includes Puerto Rico.
    expect(byId.get('CHN')!.population).toBeGreaterThan(1.41e9);
    expect(byId.get('USA')!.population).toBeGreaterThan(3.42e8);
    expect(byId.get('USA')!.gdpMillionUsd / 1e6).toBeGreaterThan(29);
    expect(byId.get('DEU')!.population / 1e6).toBeCloseTo(83.5, 0);
    expect(byId.get('IND')!.governmentType).toBe('parliamentary_democracy');
    expect(byId.get('SAU')!.governmentType).toBe('absolute_monarchy');
    expect(byId.get('MMR')!.governmentType).toBe('military_junta');
  });

  it('has demographics for every country (F06)', () => {
    for (const c of data.countryStart.countries) {
      expect(c.laborForceShare, c.id).toBeGreaterThan(0.15);
      expect(c.deathsPerThousand, c.id).toBeGreaterThan(0.5);
    }
    // Japan shrinks, Nigeria grows; North Korea has a huge army; South Africa many unemployed.
    expect(byId.get('JPN')!.birthsPerThousand).toBeLessThan(byId.get('JPN')!.deathsPerThousand);
    expect(byId.get('NGA')!.birthsPerThousand).toBeGreaterThan(30);
    expect(byId.get('PRK')!.armedForcesShare).toBeGreaterThan(0.05);
    expect(byId.get('ZAF')!.unemploymentRate).toBeGreaterThan(0.25);
  });

  it('puts every country’s people in its provinces, where they really live (F06)', () => {
    const people = new Map(data.provinceStart.provinces.map((p) => [p.id, p.population]));
    expect(people.size).toBe(data.provinces.provinces.length);
    const million = (id: string) => people.get(id)! / 1e6;
    expect(million('usa_california')).toBeGreaterThan(36);
    expect(million('usa_california')).toBeLessThan(44);
    expect(million('usa_wyoming')).toBeLessThan(1);
    expect(million('deu_bavaria')).toBeCloseTo(13.2, 0);
    expect(million('deu_berlin')).toBeCloseTo(3.7, 0);
    expect(million('ind_uttar_pradesh')).toBeGreaterThan(200);
    expect(million('gbr_gibraltar')).toBeLessThan(0.05);
  });

  it('starts a campaign with the real world’s people, jobs and living standards (F06)', () => {
    const state = new GameState({ data, seed: 1 });
    const report = ensurePopulationReport(state);
    const groups = report.groupCount;
    expect(worldPopulation(report) / 1e9).toBeCloseTo(8.21, 1);
    const country = (id: string) => state.world.countryIndex.get(id)!;
    const living = (id: string) => {
      let people = 0;
      let total = 0;
      for (let g = 0; g < groups; g++) {
        const size = report.countryGroupSize[country(id) * groups + g];
        people += size;
        total += size * report.countryGroupStandardOfLiving[country(id) * groups + g];
      }
      return total / people;
    };
    const unemployment = (id: string) => {
      const row = country(id) * groups;
      let people = 0;
      let working = 0;
      for (let g = 0; g < groups; g++) {
        people += report.countryGroupSize[row + g];
        working += report.countryGroupEmployed[row + g];
      }
      return 1 - working / people;
    };
    expect(report.countryPopulation[country('DEU')]).toBeCloseTo(byId.get('DEU')!.population, 0);
    expect(unemployment('ZAF')).toBeCloseTo(byId.get('ZAF')!.unemploymentRate, 6);
    expect(unemployment('USA')).toBeCloseTo(byId.get('USA')!.unemploymentRate, 6);
    expect(living('USA')).toBeGreaterThan(living('CHN'));
    expect(living('CHN')).toBeGreaterThan(living('IND'));
    expect(living('IND')).toBeGreaterThan(living('BDI'));
    expect(living('BDI')).toBeGreaterThan(30);

    // Ten years on: the world has grown, Japan has shrunk, nothing has run away.
    for (let day = 0; day < 3650; day++) state.advanceDay();
    const later = ensurePopulationReport(state);
    expect(worldPopulation(later) / 1e9).toBeGreaterThan(8.6);
    expect(worldPopulation(later) / 1e9).toBeLessThan(9.4);
    expect(later.countryPopulation[country('JPN')]).toBeLessThan(
      byId.get('JPN')!.population * 0.96,
    );
    expect(later.countryPopulation[country('NGA')]).toBeGreaterThan(
      byId.get('NGA')!.population * 1.15,
    );
    expect(unemployment('USA')).toBeLessThan(0.06);
    for (const value of later.standardOfLiving) expect(Number.isFinite(value)).toBe(true);
  });
});
