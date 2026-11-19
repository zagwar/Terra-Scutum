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
          birthsPerThousand: 10,
          deathsPerThousand: 9,
          laborForceShare: 0.5,
          unemploymentRate: 0.05,
          armedForcesShare: 0.01,
          demographicsSource: 'worldBank',
        },
        {
          id: 'BBB',
          population: 500_000,
          gdpMillionUsd: 1_000,
          governmentType: 'military_junta',
          populationSource: 'worldBank',
          gdpSource: 'worldBank',
          gdpYear: 2022,
          birthsPerThousand: 35,
          deathsPerThousand: 10,
          laborForceShare: 0.35,
          unemploymentRate: 0.1,
          armedForcesShare: 0.02,
          demographicsSource: 'worldBank',
        },
      ],
    },
    provinceStart: {
      year: 2025,
      source: { title: 'Test grid', url: '', licence: 'none', edition: 'test' },
      provinces: [
        { id: 'alpha_west', population: 1_200_000 },
        { id: 'alpha_east', population: 800_000 },
        { id: 'beta_main', population: 500_000 },
      ],
    },
  };
}

/** A valid `pops.json` (F06): the six pop groups with round numbers. */
export function testPops() {
  const shares = (laborers: number, skilled: number, professionals: number) => ({
    laborers,
    skilled_workers: skilled,
    professionals,
    owners: 0.02,
    officials: 0.08,
  });
  return {
    groups: [
      { id: 'laborers', wage: 1 },
      { id: 'skilled_workers', wage: 2 },
      { id: 'professionals', wage: 3 },
      { id: 'owners', wage: 6, alwaysEmployed: true },
      { id: 'officials', wage: 2 },
      { id: 'soldiers', wage: 1.5, alwaysEmployed: true, military: true },
    ],
    startingShares: [
      { gdpPerPerson: 1000, shares: shares(0.7, 0.15, 0.05) },
      { gdpPerPerson: 50000, shares: shares(0.4, 0.3, 0.2) },
    ],
    // F65: by default the pops buy no goods (heating costs nothing at every
    // wealth), so the building tests run as before; market tests give it a value.
    needs: [
      {
        id: 'heating',
        goods: [
          { good: 'coal', maxShare: 0.6 },
          { good: 'electricity', maxShare: 1 },
        ],
      },
      { id: 'services' },
    ],
    wealth: {
      dependentWeight: 0.5,
      rise: { threshold: 1.02, speed: 0.2 },
      fall: { threshold: 0.98, speed: 0.1 },
      shortagePenalty: 10,
      expectedBelowStart: 5,
      substitution: { maxShare: 0.8, otherBuyersWeight: 0.5 },
      packages: [
        { level: 1, needs: { heating: 0, services: 1 } },
        { level: 50, needs: { heating: 0, services: 20 } },
        { level: 99, needs: { heating: 0, services: 400 } },
      ],
    },
    growth: { workingYears: 45, dependentMortality: 4 },
    jobChanges: [
      { from: 'skilled_workers', to: 'laborers', weeklyShare: 0.05, training: false },
      { from: 'laborers', to: 'skilled_workers', weeklyShare: 0.01, training: true },
      { from: 'skilled_workers', to: 'professionals', weeklyShare: 0.005, training: true },
    ],
    placeholderEconomy: {
      incomeShareOfGdp: 0.6,
      priceLevelExponent: 0.35,
      priceReferenceGdpPerPerson: 85000,
      jobsFollowWeekly: 0.05,
    },
  };
}

/** A valid `market.json` (F65): Victoria 3's rules, as in the game's data. */
export function testMarket() {
  return {
    prices: { sensitivity: 0.75, min: 0.25, max: 1.75 },
    restOfEconomy: { priceElasticity: 1 },
    buildings: {
      reserveDays: 28,
      startingReserves: 0.5,
      depositWhenEmpty: 0.5,
      depositAtFull: 0.25,
      raiseMargin: 0.2,
      raiseBelowStaffing: 0.5,
      largeMargin: 0.4,
      lowReserves: 0.5,
      minimalMargin: 0.05,
      wellAbove: 1.33,
      wageStep: 0.05,
      raiseCooldownWeeks: 4,
      minWage: 0.1,
      maxWage: 5,
      firingRate: 0.1,
      hiringRate: 0.1,
      startingMargin: 0.1,
      switchForMorePay: 0.1,
    },
  };
}

/**
 * A valid `trade.json` (F19), with trade **off**: every good is local, so
 * countries trade nothing unless a test makes goods tradable
 * (`localGoods: ['electricity']`, as in the game's data).
 */
export function testTrade() {
  return {
    localGoods: ['ore', 'coal', 'steel', 'electricity'],
    shipping: { seaPerThousandKm: 1.5, landPerThousandKm: 20 },
    tariffs: { import: 0.05, export: 0 },
    volumes: { gapShare: 0.25, stockTargetDays: 15, stockRestoreWeeks: 4 },
    partners: { halvingShare: 0.1, rounds: 8 },
    worldPrice: { speed: 0.2 },
    restOfWorld: { shippingShare: 0.1 },
  };
}

/**
 * A valid `food.json` (F08) that changes nothing in older tests: coal stands
 * in for food (heating for basic food; the test pops buy none), its
 * reserves follow the test stockpile's rules, and there is no rationing to
 * choose. Food tests build their own (`packages/sim/test/food.test.ts`).
 */
export function testFood() {
  return {
    goods: ['coal'],
    basicNeed: 'heating',
    betterNeed: 'heating',
    security: { shortageWeight: 1.5, weeklyChange: 0.5, mild: 0.4, severe: 0.2 },
    starvation: {
      mild: { births: 0.35, deaths: 0.3, living: 5 },
      severe: { births: 0.9, deaths: 1, extraDeathsPerYear: 0.05, living: 15 },
    },
    famine: { starvingShare: 0.35, severeShare: 0.15 },
    reserves: { startingDays: 10, targetDays: 15, maxDays: 30, lowDays: 7 },
    rationing: [{ id: 'none', restCut: 0, betterCut: 0, stopExports: false, living: 0 }],
  };
}

/**
 * A valid `budget.json` (F09) that changes nothing in older tests: no taxes,
 * no benefits, the government pays the going wage. Budget tests build their
 * own from the real file's rules (`packages/sim/test/budget.test.ts`).
 */
export function testBudget() {
  const flat = [1, 1, 1, 1, 1];
  return {
    levels: ['very_low', 'low', 'medium', 'high', 'very_high'],
    taxes: {
      strata: {
        laborers: 'lower',
        skilled_workers: 'middle',
        professionals: 'middle',
        owners: 'upper',
        officials: 'middle',
        soldiers: 'lower',
      },
      incomeTax: { lower: 0, middle: 0, upper: 0 },
      dividendsTax: 0,
      consumptionTax: 0,
      levelFactor: [0.5, 0.75, 1, 1.25, 1.5],
      startLevelRevenueAbove: [0.15, 0.25, 0.35, 0.45],
      maxPopShareOfRevenue: 0.85,
    },
    administration: { payFactor: flat, collection: flat },
    military: { payFactor: flat },
    welfare: { benefitShare: [0, 0, 0, 0, 0] },
    education: { shareOfSpending: 0.12, costFactor: flat, trainingFactor: flat },
    placeholderLines: [{ id: 'research', comesWith: 'F83' }],
    treasury: { startingWeeks: 4, keepWeeks: 4, maxStartingDeficitShareOfGdp: 0.1 },
    credit: {
      headroomShareOfGdp: 0.5,
      minShareOfGdp: 0.6,
      premiumFrom: 0.7,
      premiumAtLimit: 0.06,
      ratings: [
        { id: 'AAA', below: 0.6 },
        { id: 'BBB', below: 0.9 },
        { id: 'CCC', below: 100 },
      ],
    },
    interest: {
      min: 0.005,
      max: 0.15,
      fallback: [{ gdpPerPerson: 10000, rate: 0.04 }],
      inflationShare: 0.5,
      inflationPremiumMax: 0.1,
    },
    default: {
      writeOff: 0.5,
      noBorrowingYears: 2,
      premium: 0.05,
      premiumYears: 5,
      living: 5,
      livingYears: 1,
    },
    inflation: {
      normal: 0.025,
      halfLifeWeeks: 26,
      printing: [
        { id: 'none', shareOfGdpPerYear: 0 },
        { id: 'some', shareOfGdpPerYear: 0.01 },
      ],
      pointsPerPrintedShare: 4,
      livingFrom: 0.1,
      livingAt: 1,
      livingMax: 10,
      high: 0.1,
    },
    fallback: { revenueShare: 0.25, spendingShare: 0.28, debtShare: 0.5, inflationRate: 0.025 },
    auto: {
      cooldownWeeks: 26,
      tightenAbove: 0.85,
      tightenDeficitShareOfGdp: 0.03,
      loosenBelow: 0.4,
      loosenSurplusShareOfGdp: 0.01,
    },
    alerts: { nearLimit: 0.9 },
  };
}

/** A valid `goods.json` (F07, F65): the goods of the test buildings, with base prices. */
export function testGoods() {
  return {
    goods: [
      { id: 'ore', unit: 't', basePrice: 100 },
      { id: 'coal', unit: 't', basePrice: 50 },
      { id: 'steel', unit: 't', basePrice: 1500 },
      { id: 'electricity', unit: 'MWh', basePrice: 50 },
    ],
    electricity: 'electricity',
  };
}

/**
 * A valid `buildings.json` (F07, F85) with round numbers: a mine, a coal
 * mine, a power plant that burns coal, one that burns nothing (a dam) and a
 * mill with two production methods. The stand-ins (the rest of the
 * economy's buying and electricity) are off unless a test turns them on.
 */
export function testBuildings() {
  return {
    buildings: [
      {
        id: 'mine',
        category: 'extraction',
        methods: [
          {
            id: 'machines',
            workers: { laborers: 100 },
            electricity: 10,
            outputs: { ore: 200 },
          },
        ],
      },
      {
        id: 'coal_mine',
        category: 'extraction',
        methods: [
          {
            id: 'machines',
            workers: { laborers: 100 },
            electricity: 10,
            outputs: { coal: 300 },
          },
        ],
      },
      {
        id: 'power_plant',
        category: 'energy',
        methods: [
          {
            id: 'turbines',
            workers: { skilled_workers: 20 },
            inputs: { coal: 100 },
            outputs: { electricity: 200 },
          },
        ],
      },
      {
        id: 'mill',
        category: 'processing',
        methods: [
          {
            id: 'modern',
            workers: { laborers: 200, skilled_workers: 100 },
            electricity: 50,
            inputs: { ore: 100, coal: 50 },
            outputs: { steel: 60 },
          },
          {
            id: 'old',
            workers: { laborers: 900, skilled_workers: 100 },
            electricity: 20,
            inputs: { ore: 100, coal: 80 },
            outputs: { steel: 60 },
          },
        ],
      },
      {
        id: 'dam',
        category: 'energy',
        methods: [
          { id: 'turbines', workers: { skilled_workers: 10 }, outputs: { electricity: 100 } },
        ],
      },
    ],
    stockpile: { startingDays: 10, maxDays: 30 },
    standIns: {
      otherElectricityShare: 0,
      restOfEconomyShare: 0,
    },
  };
}

/** A building a province starts with: `[building, method, level]` (F85). */
export type TestStartingBuilding = [string, string, number];

/** A valid `building_start.json` (F85): no starting buildings unless a test gives some. */
export function testBuildingStart(provinces: Record<string, TestStartingBuilding[]> = {}) {
  return {
    year: 2025,
    sources: [],
    provinces: Object.entries(provinces).map(([id, buildings]) => ({ id, buildings })),
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
      populationDensity: [
        { perKm2: 1, color: '#ffffff' },
        { perKm2: 100, color: '#ff0000' },
        { perKm2: 10000, color: '#000000' },
      ],
      industry: [
        { workers: 100, color: '#ffffff' },
        { workers: 10000, color: '#0000ff' },
      ],
      food: {
        steps: [
          { security: 0, color: '#ff0000' },
          { security: 1, color: '#00ff00' },
        ],
        famine: '#000000',
      },
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

/** A valid performance budget (`game_config.json`). */
export function testPerformanceBudget() {
  return {
    dailyTickAverageMs: 30,
    weeklyTickAverageMs: 150,
    worstDayMs: 100,
    strategicFps: 60,
    closeFps: 30,
    tabMemoryMb: 2048,
    loadSeconds: 20,
  };
}

/** A valid, small `stress_test.json` (F139), using the models of `testModels`. */
export function testStressTest() {
  return {
    sim: {
      scale: 1,
      goods: 5,
      needsPerPop: 2,
      buildingsPerProvince: 2,
      inputsPerBuilding: 2,
      outputsPerBuilding: 1,
      units: 10,
      battles: 2,
      unitsPerBattleSide: 3,
      supplyPasses: 2,
      corporations: 3,
      investmentsPerCorporation: 2,
      aiOptionsPerCountry: 3,
    },
    render: {
      buildings: 10,
      buildingModels: ['building'],
      buildingSpacingKm: 3,
      unitSpacingKm: 4,
      units: 5,
      unitModels: ['building'],
      battle: {
        longitude: 5,
        latitude: 5,
        bugs: 10,
        bugModels: ['tree'],
        defenders: 3,
        lasers: 2,
        explosions: 2,
        sizeKm: 50,
      },
      infrastructure: {
        road: { color: '#aaaaaa', widthPx: 1 },
        rail: { color: '#444444', widthPx: 1 },
        power: { color: '#dddddd', widthPx: 1 },
      },
      weather: { rainParticles: 10, clouds: 2, smokeParticles: 10, fireParticles: 10 },
      sizePx: [{ zoom: 1, px: 4 }],
      views: [{ name: 'STRESS_VIEW_WORLD', longitude: 0, latitude: 0, zoom: 1 }],
      measureSeconds: 1,
      settleSeconds: 1,
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
      performanceBudget: testPerformanceBudget(),
      gameSpeed: { daysPerSecond: [0.5, 1, 2, 5, 10], startSpeed: 2 },
    },
    ...testWorld(),
    pops: testPops(),
    goods: testGoods(),
    buildings: testBuildings(),
    buildingStart: testBuildingStart(),
    market: testMarket(),
    trade: testTrade(),
    food: testFood(),
    budget: testBudget(),
    mapView: testMapView(),
    terrainTiles: testTerrainTiles(),
    notifications: testNotifications(),
    countryScreen: testCountryScreen(),
    countryFlags: testCountryFlags(),
    models: testModels(),
    stressTest: testStressTest(),
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
