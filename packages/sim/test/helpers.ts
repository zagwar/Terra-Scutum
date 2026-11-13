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
        { id: 'north', climate: 'temperate', center: [0, 10], mapColor: '#778899' },
        { id: 'south', climate: 'arid', center: [2, 10], mapColor: '#aa8844' },
      ],
    },
    seaZones: {
      seaZones: [
        {
          id: 'west_sea',
          depth: 'deep',
          kind: 'sea',
          center: [0, 5],
          adjacentSeaZones: ['east_sea'],
        },
        {
          id: 'east_sea',
          depth: 'shallow',
          kind: 'coast',
          center: [2, 5],
          adjacentSeaZones: ['west_sea'],
        },
      ],
    },
  };
}

/** Valid map drawing settings (`data/map_view.json`). */
export function testMapView() {
  const line = { color: '#000000', opacity: 1, widthPx: 1 };
  return {
    projection: { type: 'miller', southLatitude: -60, northLatitude: 85 },
    camera: {
      tiltDegrees: 20,
      fieldOfViewDegrees: 40,
      fitMargin: 0.02,
      scrollDegreesPerSecond: 90,
      maxZoom: 50,
      wheelZoomStep: 1.2,
      focusMinProvincePx: 60,
    },
    detail: {
      farSimplifyDegrees: 0.1,
      nearMaxDegreesPerPixel: 0.05,
      farChunkDegrees: 60,
      chunkDegrees: 30,
    },
    colors: {
      background: '#000000',
      land: '#808080',
      landVariation: 0.1,
      politicalVariation: 0.05,
      sea: '#000060',
      seaCoastal: '#1f3d58',
      seaOpen: '#132538',
      seaSelected: '#3f86c6',
      seaSelectedStrength: 0.6,
      regionVariation: 0.1,
      selected: '#ffff00',
      neighbor: '#c0c000',
      neighborStrength: 0.5,
      hoverBrighten: 0.2,
    },
    lines: {
      provinceBorder: line,
      countryBorder: line,
      regionBorder: line,
      coast: line,
      seaZoneBorder: line,
      seaZoneBorderEmphasis: line,
      selection: line,
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
    mapView: testMapView(),
  };
}

/** Minimal valid game data for tests. */
export function testData(overrides: { startDate?: string } = {}): GameData {
  return parseGameData(testRawData(overrides));
}
