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
    detail: { farSimplifyDegrees: 0.1 },
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
      selectedStrength: 0.6,
      neighbor: '#c0c000',
      neighborStrength: 0.5,
      hoverBrighten: 0.2,
      countryHighlight: '#ffffff',
      countryHighlightStrength: 0.4,
    },
    lines: {
      provinceBorder: line,
      countryBorder: line,
      regionBorder: line,
      coast: line,
      seaZoneBorder: line,
      seaZoneBorderEmphasis: line,
      selection: line,
      river: line,
      riverMajor: line,
      riverGreat: line,
    },
    terrain: {
      maxLevel: 1,
      pixelsPerSample: 1.6,
      meshSteps: [4],
      simplifiedShapesMaxLevel: 0,
      exaggeration: 20,
      exaggerationNear: 5,
      lightAzimuthDegrees: 315,
      lightElevationDegrees: 45,
      shadingStrength: 1,
      shadeMin: 0.4,
      shadeMax: 1.5,
      colorStrength: [
        { zoom: 1, strength: 0.8 },
        { zoom: 10, strength: 0.2 },
      ],
      naturalModes: ['provinces'],
      detailStrength: 0.05,
      detailWander: 1,
      cacheTiles: 64,
      buildMsPerFrame: 8,
      materials: Object.fromEntries(
        [
          ...['none', 'forest', 'shrubland', 'grassland', 'farmland', 'urban'],
          ...['bare', 'snow', 'water', 'wetland', 'mangrove', 'tundra'],
        ].map((name) => [name, { color: '#808080', roughness: 0.5 }]),
      ),
      rivers: { minWeightByLevel: [null, 0.3], majorWeight: 0.4, greatWeight: 1 },
    },
    scenery: {
      simplePx: 9,
      detailedPx: 13,
      ambientLight: 0.5,
      sunLight: 0.7,
      forests: {
        enabled: true,
        landCover: ['forest'],
        minShare: 0.5,
        regionKm: 10,
        models: [{ model: 'tree', weight: 1, latitudes: [0, 90] }],
        fromZoom: 4,
        fullZoom: 6,
        sizePx: [{ zoom: 4, px: 9 }],
        referenceHeight: 10,
        spacingPx: 9,
        sizeVariation: 0.2,
        tintVariation: 0.1,
        placeMsPerFrame: 6,
        growSeconds: 0.5,
        maxInstances: 1000,
      },
      capitals: {
        enabled: true,
        model: 'building',
        buildings: 5,
        clusterPx: 8,
        fromZoom: 2,
        fullZoom: 3,
        sizePx: [{ zoom: 2, px: 9 }],
        referenceHeight: 20,
      },
    },
  };
}

/** A valid `models.json`: one tree and one building with their materials. */
export function testModels() {
  const material = (kind: string) => ({
    color: '#556677',
    roughness: 0.8,
    metallic: 0,
    pattern: { kind, size: 2, strength: 0.3 },
  });
  return {
    materials: {
      bark: material('bark'),
      leaves: material('foliage'),
      wall: material('windows'),
      roof: material('tiles'),
    },
    models: {
      tree: {
        source: 'generator',
        generator: 'tree',
        variants: 2,
        spec: {
          kind: 'conifer',
          trunkMaterial: 'bark',
          crownMaterial: 'leaves',
          height: [8, 12],
          trunkShare: [0.1, 0.2],
          trunkRadius: [0.02, 0.04],
          crownRadius: [0.2, 0.3],
          crownParts: [2, 4],
          leanDegrees: 3,
        },
      },
      building: {
        source: 'generator',
        generator: 'boxBuilding',
        variants: 3,
        spec: {
          wallMaterial: 'wall',
          roofMaterial: 'roof',
          detailMaterial: 'roof',
          floors: [2, 10],
          floorHeight: 3,
          width: [10, 20],
          depth: [10, 20],
          gabledShare: 0.3,
          gabledMaxFloors: 4,
          setbackShare: 0.5,
          rooftopUnits: [0, 2],
        },
      },
      replaced: { source: 'file', file: 'models/replaced.glb', scale: 1 },
    },
  };
}

/** A valid `data/terrain_tiles.json`: two levels, one tile each, made for `testMapView`'s projection. */
export function testTerrainTiles() {
  return {
    version: 'test',
    projection: { type: 'miller', southLatitude: -60, northLatitude: 85 },
    baseCells: 1024,
    tileCells: 256,
    minHeightM: -100,
    maxHeightM: 8000,
    levels: [{ tiles: ['0_0'] }, { tiles: ['1_2'] }],
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
    terrainTiles: testTerrainTiles(),
    notifications: testNotifications(),
    countryScreen: testCountryScreen(),
    countryFlags: testCountryFlags(),
    models: testModels(),
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
    countrySelection: { quickPicks: ['BBB'] },
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
