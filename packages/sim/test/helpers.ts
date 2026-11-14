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
    governmentTypes: {
      governmentTypes: [
        { id: 'parliamentary_democracy', kind: 'democracy' },
        { id: 'military_junta', kind: 'autocracy' },
      ],
    },
    countryStart: {
      year: 2025,
      sources: { worldBank: { title: 'World Bank' }, imfWeo: { title: 'IMF' } },
      countries: [
        {
          id: 'AAA',
          population: 2_000_000,
          gdpMillionUsd: 50_000,
          governmentType: 'parliamentary_democracy',
          populationSource: 'worldBank',
          gdpSource: 'imfWeo',
        },
        {
          id: 'BBB',
          population: 500_000,
          gdpMillionUsd: 1_000,
          governmentType: 'military_junta',
          populationSource: 'worldBank',
          gdpSource: 'worldBank',
          gdpYear: 2022,
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
      tiltNearDegrees: 40,
      fieldOfViewDegrees: 40,
      fitMargin: 0.02,
      scrollDegreesPerSecond: 90,
      fastScrollFactor: 3,
      maxZoom: 50,
      wheelZoomStep: 1.2,
      focusMinProvincePx: 60,
      smoothSeconds: 0.1,
      edgeScrollPx: 8,
      rotateDegreesPerSecond: 90,
      rotateDegreesPerPixel: 0.3,
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
      playerCountry: 'AAA',
      performanceBudget: { dailyTickAverageMs: 30, weeklyTickAverageMs: 150 },
      gameSpeed: { daysPerSecond: [0.5, 1, 2, 5, 10], startSpeed: 2 },
    },
    ...testWorld(),
    mapView: testMapView(),
    notifications: testNotifications(),
    countryScreen: testCountryScreen(),
    countryFlags: testCountryFlags(),
  };
}

/** A valid `country_screen.json`: one entry per list. */
export function testCountryScreen() {
  const entry = (id: string) => ({ id, feature: 'F24', milestone: 'M6' });
  return {
    laws: [entry('conscription')],
    cabinetSeats: [entry('defense')],
    publicOpinion: { stances: ['denial', 'panic'], feature: 'F21', milestone: 'M5' },
    diplomaticActions: [entry('improve_relations'), entry('declare_war')],
  };
}

/** A valid `country_flags.json` for the two test countries. */
export function testCountryFlags() {
  return { flagSet: 'flag-icons', flags: { AAA: 'aa', BBB: 'bb' } };
}

/** A valid `notifications.json`: one message type and one alert type. */
export function testNotifications() {
  return {
    messageTypes: [{ id: 'province_owner_changed', defaultDelivery: 'toast', pauses: false }],
    alertTypes: [{ id: 'blackout', kind: 'problem', feature: 'F74' }],
  };
}

/** Minimal valid game data for tests. */
export function testData(overrides: { startDate?: string } = {}): GameData {
  return parseGameData(testRawData(overrides));
}
