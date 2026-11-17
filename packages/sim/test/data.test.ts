import { describe, expect, it } from 'vitest';
import { DATA_FILES, DataValidationError, formatDataIssue, parseGameData } from '../src';
import {
  testBuildings,
  testCountryFlags,
  testCountryScreen,
  testGoods,
  testMapView,
  testModels,
  testNotifications,
  testPerformanceBudget,
  testPops,
  testStressTest,
  testTerrainTiles,
  testWorld,
} from './helpers';

const validConfig = {
  startDate: '2025-01-01',
  playerCountry: 'AAA',
  performanceBudget: testPerformanceBudget(),
  gameSpeed: { daysPerSecond: [0.5, 1, 2, 5, 10], startSpeed: 2 },
};

const world = {
  ...testWorld(),
  pops: testPops(),
  goods: testGoods(),
  buildings: testBuildings(),
  mapView: testMapView(),
  terrainTiles: testTerrainTiles(),
  notifications: testNotifications(),
  countryScreen: testCountryScreen(),
  countryFlags: testCountryFlags(),
  models: testModels(),
  stressTest: testStressTest(),
};

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
        playerCountry: 'AAA',
        performanceBudget: {
          ...testPerformanceBudget(),
          dailyTickAverageMs: 'fast',
          weeklyTickAverageMs: -1,
        },
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
      'data/province_start.json: file is missing',
      'data/pops.json: file is missing',
      'data/goods.json: file is missing',
      'data/buildings.json: file is missing',
      'data/map_view.json: file is missing',
      'data/terrain_tiles.json: file is missing',
      'data/notifications.json: file is missing',
      'data/country_screen.json: file is missing',
      'data/country_flags.json: file is missing',
      'data/models.json: file is missing',
      'data/stress_test.json: file is missing',
    ]);
  });

  it('checks the player country and the message and alert types (F122)', () => {
    const unknownCountry = issuesOf({
      ...world,
      gameConfig: { ...validConfig, playerCountry: 'ZZZ' },
    });
    expect(unknownCountry).toEqual([
      'data/game_config.json → playerCountry: "ZZZ" is not a country in countries.json',
    ]);
    const notifications = testNotifications();
    const duplicate = issuesOf({
      ...world,
      gameConfig: validConfig,
      notifications: {
        ...notifications,
        alertTypes: [...notifications.alertTypes, ...notifications.alertTypes],
      },
    });
    expect(duplicate).toEqual([
      'data/notifications.json → alertTypes.1.id: duplicate id "blackout" (also at alertTypes.0)',
    ]);
    const badDelivery = issuesOf({
      ...world,
      gameConfig: validConfig,
      notifications: {
        ...notifications,
        messageTypes: [{ id: 'x', defaultDelivery: 'shout', pauses: false }],
      },
    });
    expect(badDelivery.join('\n')).toContain('messageTypes.0.defaultDelivery');
    const data = parseGameData({ gameConfig: validConfig, ...world });
    expect(data.notifications.messageTypes[0].defaultDelivery).toBe('toast');
  });

  it('checks the country screen lists and the flags (F138)', () => {
    const screen = testCountryScreen();
    const duplicate = issuesOf({
      ...world,
      gameConfig: validConfig,
      countryScreen: {
        ...screen,
        diplomaticActions: [...screen.diplomaticActions, screen.diplomaticActions[0]],
        publicOpinion: { ...screen.publicOpinion, stances: ['denial', 'denial'] },
      },
    });
    expect(duplicate).toEqual([
      'data/country_screen.json → publicOpinion.stances.1: duplicate id "denial" (also at publicOpinion.stances.0)',
      'data/country_screen.json → diplomaticActions.2.id: duplicate id "improve_relations" (also at diplomaticActions.0)',
    ]);
    const badMilestone = issuesOf({
      ...world,
      gameConfig: validConfig,
      countryScreen: { ...screen, laws: [{ id: 'trade', feature: 'F16', milestone: 'three' }] },
    });
    expect(badMilestone.join('\n')).toContain('laws.0.milestone');
    const picks = issuesOf({
      ...world,
      gameConfig: validConfig,
      countryScreen: { ...screen, countrySelection: { quickPicks: ['BBB', 'ZZZ', 'BBB'] } },
    });
    expect(picks).toEqual([
      'data/country_screen.json → countrySelection.quickPicks.1: unknown country "ZZZ"',
      'data/country_screen.json → countrySelection.quickPicks.2: "BBB" is listed twice',
    ]);
    const flags = issuesOf({
      ...world,
      gameConfig: validConfig,
      countryFlags: { flagSet: 'flag-icons', flags: { AAA: 'aa', ZZZ: 'zz' } },
    });
    expect(flags).toEqual([
      'data/country_flags.json → flags: no flag for country "BBB"',
      'data/country_flags.json → flags.ZZZ: unknown country "ZZZ"',
    ]);
    const badCode = issuesOf({
      ...world,
      gameConfig: validConfig,
      countryFlags: { flagSet: 'flag-icons', flags: { AAA: 'AA', BBB: 'bb' } },
    });
    expect(badCode.join('\n')).toContain('flags.AAA');
  });

  it('checks that the terrain fits the map (F125)', () => {
    const raw = { ...world, gameConfig: validConfig };
    expect(() => parseGameData(raw as never)).not.toThrow();
    // Terrain made for another projection must be made again.
    const otherProjection = {
      ...testTerrainTiles(),
      projection: { type: 'miller', southLatitude: -56, northLatitude: 85 },
    };
    expect(issuesOf({ ...raw, terrainTiles: otherProjection })).toEqual([
      'data/terrain_tiles.json → projection: the terrain was made for another map projection than map_view.json: run `npm run import:terrain` again',
    ]);
    // The game can't ask for a finer level than the terrain has.
    const mapView = testMapView();
    mapView.terrain.maxLevel = 2;
    expect(issuesOf({ ...raw, mapView })).toEqual([
      'data/map_view.json → terrain.maxLevel: the terrain only has levels 0 to 1',
    ]);
    // The mesh must fit the tiles: a corner every 3 samples doesn't divide 256 cells.
    const unevenMesh = testMapView();
    unevenMesh.terrain.meshSteps = [8, 3];
    expect(issuesOf({ ...raw, mapView: unevenMesh })).toEqual([
      "data/map_view.json → terrain.meshSteps.1: a terrain tile has 256 cells along a side: 3 doesn't divide it evenly",
    ]);
    // Every land cover class needs its ground material; the color strengths go from far to close.
    const noForest = testMapView();
    delete (noForest.terrain.materials as Record<string, unknown>).forest;
    expect(issuesOf({ ...raw, mapView: noForest })[0]).toContain('terrain.materials.forest');
    const backwards = testMapView();
    backwards.terrain.colorStrength.reverse();
    expect(issuesOf({ ...raw, mapView: backwards })[0]).toContain('from the farthest zoom');
    expect(
      issuesOf({ ...raw, terrainTiles: { ...testTerrainTiles(), levels: [{ tiles: ['a'] }] } })[0],
    ).toContain('column_row');
  });

  it('checks the model library and the scenery and stress test that use it (F133, F139)', () => {
    const raw = { ...world, gameConfig: validConfig };
    expect(issuesOf({ ...raw, models: { materials: {}, models: {} } })).toEqual([
      'data/map_view.json → scenery.forests.models.0.model: unknown model "tree" (not in models.json)',
      'data/map_view.json → scenery.capitals.model: unknown model "building" (not in models.json)',
      'data/stress_test.json → render.buildingModels.0: unknown model "building" (not in models.json)',
      'data/stress_test.json → render.unitModels.0: unknown model "building" (not in models.json)',
      'data/stress_test.json → render.battle.bugModels.0: unknown model "tree" (not in models.json)',
    ]);
    // A model's materials must exist.
    const noBark = testModels();
    delete (noBark.materials as Record<string, unknown>).bark;
    expect(issuesOf({ ...raw, models: noBark })).toEqual([
      'data/models.json → models.tree.spec: unknown material "bark"',
    ]);
    // A generator's spec is checked by that generator's schema.
    const badSpec = testModels();
    (badSpec.models.tree.spec as Record<string, unknown>).height = [12, 8];
    expect(issuesOf({ ...raw, models: badSpec })[0]).toContain('models.tree');
    const unknownGenerator = testModels();
    (unknownGenerator.models.tree as Record<string, unknown>).generator = 'castle';
    expect(issuesOf({ ...raw, models: unknownGenerator })[0]).toContain('models.tree');
    // A model file lives under models/ and is a glTF file.
    const badFile = testModels();
    badFile.models.replaced.file = 'replaced.obj';
    expect(issuesOf({ ...raw, models: badFile })[0]).toContain('models.replaced');
    // Scenery sizes are listed from the farthest zoom to the closest.
    const backwards = testMapView();
    backwards.scenery.forests.sizePx = [
      { zoom: 10, px: 12 },
      { zoom: 4, px: 9 },
    ];
    expect(issuesOf({ ...raw, mapView: backwards })[0]).toContain('scenery.forests.sizePx');
    const data = parseGameData(raw);
    expect(Object.keys(data.models.models)).toEqual(['tree', 'building', 'replaced']);
  });

  it('uses .json file names in snake_case for every data file', () => {
    for (const { file } of Object.values(DATA_FILES)) expect(file).toMatch(/^[a-z0-9_]+\.json$/);
  });
});
