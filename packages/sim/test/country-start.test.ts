import { describe, expect, it } from 'vitest';
import {
  DataValidationError,
  GameState,
  buildCountryStartTable,
  buildWorldMap,
  formatDataIssue,
  governmentTypeNameKey,
  parseGameData,
} from '../src';
import { testData, testRawData, type testWorld } from './helpers';

type Raw = ReturnType<typeof testRawData>;
type CountryStart = ReturnType<typeof testWorld>['countryStart'];

/** Valid test data with the country start file changed by `change`. */
function issuesWith(change: (start: CountryStart, raw: Raw) => void): string[] {
  const raw = structuredClone(testRawData());
  change(raw.countryStart as CountryStart, raw);
  try {
    parseGameData(raw);
  } catch (error) {
    if (error instanceof DataValidationError) return error.issues.map(formatDataIssue);
    throw error;
  }
  return [];
}

describe('country starting data (F71)', () => {
  it('accepts valid data', () => {
    expect(issuesWith(() => {})).toEqual([]);
  });

  it('needs exactly one entry for every country', () => {
    const missing = issuesWith((start) => start.countries.pop());
    expect(missing).toEqual([
      'data/country_start.json → countries: no starting data for country "BBB"',
    ]);
    const duplicate = issuesWith((start) => start.countries.push({ ...start.countries[0] }));
    expect(duplicate.join('\n')).toContain('duplicate country "AAA"');
    const unknown = issuesWith((start) => (start.countries[1].id = 'ZZZ'));
    expect(unknown.join('\n')).toContain('unknown country "ZZZ"');
    expect(unknown.join('\n')).toContain('no starting data for country "BBB"');
  });

  it('checks government types, sources and the start year', () => {
    const issues = issuesWith((start) => {
      start.year = 2024;
      start.countries[0].governmentType = 'empire';
      start.countries[1].gdpSource = 'rumour';
    });
    expect(issues).toEqual([
      'data/country_start.json → year: the starting data is for 2024, but the campaign starts in 2025 (game_config.json)',
      'data/country_start.json → countries.0.governmentType: unknown government type "empire" (not in government_types.json)',
      'data/country_start.json → countries.1.gdpSource: unknown source "rumour"',
    ]);
  });

  it('catches a GDP in the wrong unit (implausible GDP per person)', () => {
    // 50,000 million US$ for 2 million people is 25,000 US$ each; in billions it would be 25 US$.
    const issues = issuesWith((start) => (start.countries[0].gdpMillionUsd = 50));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('countries.0: GDP per person of 25 US$');
  });

  it('rejects broken values in the file itself', () => {
    const issues = issuesWith((start) => {
      start.countries[0].population = -5;
      (start.countries[1] as { population: number }).population = 1.5;
    });
    expect(issues.join('\n')).toContain('countries.0.population');
    expect(issues.join('\n')).toContain('countries.1.population');
  });

  it('rejects duplicate government types', () => {
    const issues = issuesWith((_, raw) => {
      const file = raw.governmentTypes as { governmentTypes: { id: string; kind: string }[] };
      file.governmentTypes.push({ id: 'military_junta', kind: 'autocracy' });
    });
    expect(issues).toEqual([
      'data/government_types.json → governmentTypes.2.id: duplicate id "military_junta" (also at governmentTypes.1)',
    ]);
  });

  it('builds a table in the world’s country order', () => {
    const data = testData();
    const world = buildWorldMap(data);
    const table = buildCountryStartTable(data.countryStart, world);
    const bbb = world.countryIndex.get('BBB')!;
    expect(table.year).toBe(2025);
    expect(table.population[bbb]).toBe(500_000);
    expect(table.gdpMillionUsd[bbb]).toBe(1_000);
    expect(table.governmentType[bbb]).toBe('military_junta');
    expect(new GameState({ data, seed: 1 }).countryStart.population[bbb]).toBe(500_000);
  });

  it('names government types with a translation key', () => {
    expect(governmentTypeNameKey('military_junta')).toBe('GOVERNMENT_TYPE_MILITARY_JUNTA');
  });
});
