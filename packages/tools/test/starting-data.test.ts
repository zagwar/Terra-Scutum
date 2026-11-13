import { describe, expect, it } from 'vitest';
import {
  type ImfSnapshot,
  type StartingDataConfig,
  type WorldBankSnapshot,
  buildStartingData,
} from '../src/starting-data/build-starting-data';
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
};
const config = (countries: StartingDataConfig['countries']): StartingDataConfig => ({
  year: 2025,
  sourceCodes: { KOS: { imf: 'UVX', worldBank: 'XKZ' } },
  territoryEstimates: { SAH: { population: 600_000, note: 'estimate' } },
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
      },
    ]);
    expect(Object.keys(result.file.sources).sort()).toEqual(['estimate', 'imfWeo', 'worldBank']);
  });

  it('falls back: IMF population, World Bank GDP (with its year), then estimates', () => {
    const result = buildStartingData(
      config({
        TWX: { ...democracy, gdpMillionUsd: 900_000, gdpNote: 'test' },
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
      notes: ['GDP: test'],
    });
    expect(ccc).toMatchObject({ gdpMillionUsd: 900, gdpSource: 'worldBank', gdpYear: 2019 });
    // `"gdp": "worldBank"` picks the World Bank's figure over the IMF's.
    expect(bbb).toMatchObject({ gdpMillionUsd: 2_500, gdpSource: 'worldBank' });
    expect(bbb.gdpYear).toBeUndefined();
  });

  it('uses the sources’ own codes where they differ', () => {
    const result = buildStartingData(config({ KOS: democracy }), imf, worldBank, [{ id: 'KOS' }]);
    expect(result.file.countries[0]).toMatchObject({ population: 1_600_000, gdpMillionUsd: 1_500 });
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
});
