import { type GameData, type RawGameData, parseGameData } from '../src';

/**
 * A tiny, valid world for tests (independent of the real files in `data/`):
 *
 *   alpha_west ── alpha_east ── beta_main      (land borders)
 *        │             │            │
 *    west_sea ──────── east_sea ─────┘          (coasts and the sea border)
 */
export function testWorld() {
  return {
    countries: {
      countries: [
        { id: 'AAA', capitalProvince: 'alpha_west', mapColor: '#112233' },
        { id: 'BBB', capitalProvince: 'beta_main', mapColor: '#445566' },
      ],
    },
    provinces: {
      provinces: [
        {
          id: 'alpha_west',
          country: 'AAA',
          region: 'north',
          center: [0, 10],
          areaKm2: 1000,
          adjacentProvinces: ['alpha_east'],
          adjacentSeaZones: ['west_sea'],
        },
        {
          id: 'alpha_east',
          country: 'AAA',
          region: 'north',
          center: [1, 10],
          areaKm2: 2000,
          adjacentProvinces: ['alpha_west', 'beta_main'],
          adjacentSeaZones: ['east_sea', 'west_sea'],
        },
        {
          id: 'beta_main',
          country: 'BBB',
          region: 'south',
          center: [2, 10],
          areaKm2: 3000,
          adjacentProvinces: ['alpha_east'],
          adjacentSeaZones: ['east_sea'],
        },
      ],
    },
    regions: {
      regions: [
        { id: 'north', climate: 'temperate', center: [0, 10] },
        { id: 'south', climate: 'arid', center: [2, 10] },
      ],
    },
    seaZones: {
      seaZones: [
        { id: 'west_sea', depth: 'deep', center: [0, 5], adjacentSeaZones: ['east_sea'] },
        { id: 'east_sea', depth: 'shallow', center: [2, 5], adjacentSeaZones: ['west_sea'] },
      ],
    },
  };
}

/** Valid raw data (as if read from the JSON files); tests change parts of it. */
export function testRawData(
  overrides: { startDate?: string } = {},
): Record<keyof RawGameData, unknown> {
  return {
    gameConfig: {
      startDate: overrides.startDate ?? '2025-01-01',
      performanceBudget: { dailyTickAverageMs: 30, weeklyTickAverageMs: 150 },
    },
    ...testWorld(),
  };
}

/** Minimal valid game data for tests. */
export function testData(overrides: { startDate?: string } = {}): GameData {
  return parseGameData(testRawData(overrides));
}
