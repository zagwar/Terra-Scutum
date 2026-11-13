import { describe, expect, it } from 'vitest';
import { DATA_FILES, DataValidationError, formatDataIssue, parseGameData } from '../src';
import { testMapView, testWorld } from './helpers';

const validConfig = {
  startDate: '2025-01-01',
  performanceBudget: { dailyTickAverageMs: 30, weeklyTickAverageMs: 150 },
  gameSpeed: { daysPerSecond: [0.5, 1, 2, 5, 10], startSpeed: 2 },
};

const world = { ...testWorld(), mapView: testMapView() };

function issuesOf(raw: unknown): string[] {
  try {
    parseGameData(raw as Parameters<typeof parseGameData>[0]);
  } catch (error) {
    if (error instanceof DataValidationError) return error.issues.map(formatDataIssue);
    throw error;
  }
  throw new Error('expected a DataValidationError');
}

describe('game data validation', () => {
  it('accepts valid data and turns the start date into a calendar date', () => {
    const data = parseGameData({ gameConfig: validConfig, ...world });
    expect(data.gameConfig.startDate).toEqual({ year: 2025, month: 1, day: 1 });
    expect(data.gameConfig.performanceBudget.dailyTickAverageMs).toBe(30);
  });

  it('names the file and the field for every problem, not just the first', () => {
    const issues = issuesOf({
      ...world,
      gameConfig: {
        startDate: '2025-02-30',
        performanceBudget: { dailyTickAverageMs: 'fast', weeklyTickAverageMs: -1 },
        gameSpeed: validConfig.gameSpeed,
      },
    });
    expect(issues).toHaveLength(3);
    expect(issues[0]).toContain('data/game_config.json → startDate');
    expect(issues[0]).toContain('2025-02-30');
    expect(issues[1]).toContain('data/game_config.json → performanceBudget.dailyTickAverageMs');
    expect(issues[2]).toContain('data/game_config.json → performanceBudget.weeklyTickAverageMs');
  });

  it('rejects unknown fields (usually typos) and missing fields', () => {
    const typo = issuesOf({ ...world, gameConfig: { ...validConfig, startDay: '2025-01-01' } });
    expect(typo.join('\n')).toContain('startDay');
    const missing = issuesOf({ ...world, gameConfig: { startDate: '2025-01-01' } });
    expect(missing.join('\n')).toContain('performanceBudget');
  });

  it('checks the game speeds: five of them, each faster than the last', () => {
    const tooFew = issuesOf({
      ...world,
      gameConfig: { ...validConfig, gameSpeed: { daysPerSecond: [1, 2, 3], startSpeed: 2 } },
    });
    expect(tooFew.join('\n')).toContain('gameSpeed.daysPerSecond');
    const outOfOrder = issuesOf({
      ...world,
      gameConfig: { ...validConfig, gameSpeed: { daysPerSecond: [1, 2, 2, 5, 10], startSpeed: 2 } },
    });
    expect(outOfOrder.join('\n')).toContain('faster than the one before');
    const badStart = issuesOf({
      ...world,
      gameConfig: { ...validConfig, gameSpeed: { daysPerSecond: [1, 2, 3, 4, 5], startSpeed: 6 } },
    });
    expect(badStart.join('\n')).toContain('gameSpeed.startSpeed');
  });

  it('reports a missing file', () => {
    expect(issuesOf({ ...world })).toEqual(['data/game_config.json: file is missing']);
    expect(issuesOf({ gameConfig: validConfig })).toEqual([
      'data/countries.json: file is missing',
      'data/provinces.json: file is missing',
      'data/regions.json: file is missing',
      'data/sea_zones.json: file is missing',
      'data/government_types.json: file is missing',
      'data/country_start.json: file is missing',
      'data/map_view.json: file is missing',
    ]);
  });

  it('uses .json file names in snake_case for every data file', () => {
    for (const { file } of Object.values(DATA_FILES)) expect(file).toMatch(/^[a-z0-9_]+\.json$/);
  });
});
