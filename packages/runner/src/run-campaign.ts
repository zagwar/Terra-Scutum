import {
  type CalendarDate,
  type GameData,
  GameState,
  type SystemId,
  type SystemRegistry,
  BUILDING_LIMIT,
  createPlaceholderLoad,
  ensureBuildingsReport,
  ensurePopulationReport,
  foodReserveDays,
  hashGameState,
  worldPopulation,
} from '@terra-scutum/sim';

export interface CampaignOptions {
  readonly data: GameData;
  readonly seed: number;
  readonly days: number;
  /** A millisecond clock, for example `performance.now`. */
  readonly clock: () => number;
  /** Defaults to the game's systems. Tests pass their own; the stress test passes the placeholder load. */
  readonly systems?: SystemRegistry;
  /** Bytes of memory in use right now (for example the JavaScript heap); measured once a month and at the end. */
  readonly memory?: () => number;
  /** Called once the new campaign exists, before anything is measured. */
  readonly prepare?: (state: GameState) => void;
  /** Called after every tick with its time (Mondays: `weekly` true). */
  readonly onTick?: (elapsedMs: number, weekly: boolean) => void;
}

export interface TickStats {
  readonly count: number;
  readonly averageMs: number;
  readonly worstMs: number;
  /** 99 of 100 ticks were at most this long. */
  readonly p99Ms: number;
  /** The performance budget's target average for this kind of tick. */
  readonly budgetMs: number;
  /** The slowest this kind of tick may ever be (ordinary days only; none for weekly ticks). */
  readonly worstBudgetMs: number | null;
  readonly withinBudget: boolean;
}

/**
 * What a headless campaign run reports. Later features add their numbers
 * (Swarm control %, hive tiers, refugees, relations, nukes used).
 */
export interface CampaignSummary {
  readonly seed: number;
  readonly days: number;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  readonly totalMs: number;
  /** Ordinary days. */
  readonly dailyTicks: TickStats;
  /** Mondays: the daily tick plus the weekly calculations. */
  readonly weeklyTicks: TickStats;
  /** Time per system, slowest first. */
  readonly systemTimings: readonly { id: SystemId; totalMs: number }[];
  /** Everyone in the world on the first and on the last day (F06). */
  readonly startPopulation: number;
  readonly endPopulation: number;
  /**
   * The buildings on the last day (F07): how many there are, their levels,
   * the people at work in them, their average output (0–1, by level; power
   * plants that are only short of demand count as running fully), and how
   * many are held back by missing workers, inputs or electricity.
   */
  readonly buildings: {
    readonly count: number;
    readonly levels: number;
    readonly workers: number;
    readonly averageOutput: number;
    readonly heldBack: number;
  };
  /**
   * The markets on the last day (F65): the average price as a share of the
   * base price (over every country's market and good), the most expensive
   * and the cheapest market, the country whose pops were shortest of goods
   * last week, the buildings' average wage level, how many have laid
   * workers off, and the world's average standard of living (by people).
   */
  readonly markets: {
    readonly averagePrice: number;
    readonly highest: { readonly country: string; readonly good: string; readonly price: number };
    readonly lowest: { readonly country: string; readonly good: string; readonly price: number };
    readonly worstShortage: { readonly country: string; readonly share: number };
    readonly averageWage: number;
    readonly layingOff: number;
    readonly standardOfLiving: number;
  };
  /**
   * Trade on the last day (F19): the world's imports a day (US$, delivered),
   * the share the rest of the world sold (by value), the biggest exporter and
   * importer (by value), the cheapest and dearest world price (× base), and
   * the smallest share of planned imports that arrived.
   */
  readonly trade: {
    readonly value: number;
    readonly restOfWorldShare: number;
    readonly topExporter: { readonly country: string; readonly value: number };
    readonly topImporter: { readonly country: string; readonly value: number };
    readonly lowestWorld: { readonly good: string; readonly price: number };
    readonly highestWorld: { readonly good: string; readonly price: number };
    readonly leastDelivered: number;
  };
  /**
   * Food on the last day (F08): the world's food reserves (days, by people),
   * the shares of the world's people starving and severely starving, the
   * provinces in famine, deaths and lost births from starvation since the
   * start, the countries rationing (by level, from none), and the country
   * with the most people starving.
   */
  readonly food: {
    readonly reserveDays: number;
    readonly starving: number;
    readonly severe: number;
    readonly famines: number;
    readonly deaths: number;
    readonly lostBirths: number;
    readonly rationing: readonly number[];
    readonly worst: { readonly country: string; readonly starving: number };
  };
  /** Fingerprint of the final state; equal for two runs with the same seed. */
  readonly stateHash: string;
  /** The most memory seen during the run and at its end, in bytes (null without a `memory` option). */
  readonly peakMemoryBytes: number | null;
  readonly endMemoryBytes: number | null;
}

function marketSummary(state: GameState): CampaignSummary['markets'] {
  const { market, buildings, world } = state;
  const population = ensurePopulationReport(state);
  const goods = market.goodCount;
  let sum = 0;
  let highest = { country: '', good: '', price: 0 };
  let lowest = { country: '', good: '', price: Infinity };
  for (let m = 0; m < market.price.length; m++) {
    const factor = market.price[m] / market.basePrice[m % goods];
    sum += factor;
    const at = { country: world.countryIds[(m / goods) | 0], good: buildings.goodIds[m % goods] };
    if (factor > highest.price) highest = { ...at, price: factor };
    if (factor < lowest.price) lowest = { ...at, price: factor };
  }
  let worstShortage = { country: '', share: 0 };
  market.shortage.forEach((share, c) => {
    if (share > worstShortage.share) worstShortage = { country: world.countryIds[c], share };
  });
  let wages = 0;
  let layingOff = 0;
  for (let i = 0; i < buildings.cellCount; i++) {
    const cell = buildings.cells[i];
    wages += buildings.wageFactor[cell];
    if (buildings.open[cell] < 0.999) layingOff += 1;
  }
  let living = 0;
  let people = 0;
  for (let i = 0; i < population.size.length; i++) {
    living += population.standardOfLiving[i] * population.size[i];
    people += population.size[i];
  }
  return {
    averagePrice: sum / market.price.length,
    highest,
    lowest,
    worstShortage,
    averageWage: buildings.cellCount > 0 ? wages / buildings.cellCount : 0,
    layingOff,
    standardOfLiving: people > 0 ? living / people : 0,
  };
}

function tradeSummary(state: GameState): CampaignSummary['trade'] {
  const { trade, market, world, buildings } = state;
  const goods = trade.goodCount;
  let value = 0;
  let fromRest = 0;
  let topExporter = { country: '', value: 0 };
  let topImporter = { country: '', value: 0 };
  for (let c = 0; c < trade.countryCount; c++) {
    let exported = 0;
    let imported = 0;
    for (let g = 0; g < goods; g++) {
      exported += trade.exportValue[c * goods + g];
      imported += trade.importValue[c * goods + g];
    }
    value += imported;
    if (exported > topExporter.value)
      topExporter = { country: world.countryIds[c], value: exported };
    if (imported > topImporter.value)
      topImporter = { country: world.countryIds[c], value: imported };
  }
  let lowestWorld = { good: '', price: Infinity };
  let highestWorld = { good: '', price: 0 };
  let leastDelivered = 1;
  for (let g = 0; g < goods; g++) {
    if (!trade.tradable[g]) continue;
    const factor = trade.worldPrice[g] / market.basePrice[g];
    fromRest += trade.restOfWorld[g] * trade.worldPrice[g];
    if (factor < lowestWorld.price) lowestWorld = { good: buildings.goodIds[g], price: factor };
    if (factor > highestWorld.price) highestWorld = { good: buildings.goodIds[g], price: factor };
    if (trade.delivered[g] < leastDelivered) leastDelivered = trade.delivered[g];
  }
  return {
    value,
    restOfWorldShare: value > 0 ? fromRest / value : 0,
    topExporter,
    topImporter,
    lowestWorld,
    highestWorld,
    leastDelivered,
  };
}

function foodSummary(state: GameState): CampaignSummary['food'] {
  const { food, market, buildings, world } = state;
  let people = 0;
  let days = 0;
  let counted = 0;
  let starving = 0;
  let severe = 0;
  let famines = 0;
  let deaths = 0;
  let lostBirths = 0;
  const rationing = food.levelIds.map(() => 0);
  let worst = { country: '', starving: 0 };
  for (let c = 0; c < food.countryCount; c++) {
    const here = market.countryPeople[c];
    people += here;
    const reserve = foodReserveDays(food, market, buildings.stock, market.buy, c);
    if (Number.isFinite(reserve)) {
      days += reserve * here;
      counted += here;
    }
    starving += here * food.countryStarving[c];
    severe += here * food.countrySevere[c];
    famines += food.famineCount[c];
    deaths += food.starvationDeaths[c];
    lostBirths += food.lostBirths[c];
    rationing[food.rationing[c]] += 1;
    if (food.countryStarving[c] > worst.starving)
      worst = { country: world.countryIds[c], starving: food.countryStarving[c] };
  }
  return {
    reserveDays: counted > 0 ? days / counted : 0,
    starving: people > 0 ? starving / people : 0,
    severe: people > 0 ? severe / people : 0,
    famines,
    deaths,
    lostBirths,
    rationing,
    worst,
  };
}

/** The value `share` (0…1) of the way through the sorted values. */
function percentile(sorted: Float64Array, share: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
}

function tickStats(times: Float64Array, budgetMs: number, worstBudgetMs: number | null): TickStats {
  const count = times.length;
  let total = 0;
  let worst = 0;
  for (const time of times) {
    total += time;
    if (time > worst) worst = time;
  }
  const averageMs = count === 0 ? 0 : total / count;
  const sorted = times.slice().sort();
  return {
    count,
    averageMs,
    worstMs: worst,
    p99Ms: percentile(sorted, 0.99),
    budgetMs,
    worstBudgetMs,
    withinBudget: averageMs <= budgetMs && (worstBudgetMs === null || worst <= worstBudgetMs),
  };
}

/**
 * Simulates `days` days from a new game and measures every tick.
 * (Once country AI exists, it will control every country here, including the player's.)
 */
export function runCampaign(options: CampaignOptions): CampaignSummary {
  const { clock, memory } = options;
  const state = new GameState({
    data: options.data,
    seed: options.seed,
    systems: options.systems,
  });
  options.prepare?.(state);
  state.enableProfiling(clock);
  const startDate = state.date;
  const startPopulation = worldPopulation(state.population);

  const daily = new Float64Array(options.days);
  const weekly = new Float64Array(options.days);
  let dailyCount = 0;
  let weeklyCount = 0;
  let peakMemory = memory ? memory() : 0;

  const startedAt = clock();
  for (let i = 0; i < options.days; i++) {
    const isWeekly = state.isWeeklyTickDay;
    const tickStartedAt = clock();
    state.advanceDay();
    const elapsed = clock() - tickStartedAt;
    state.drainEvents();
    if (isWeekly) weekly[weeklyCount++] = elapsed;
    else daily[dailyCount++] = elapsed;
    options.onTick?.(elapsed, isWeekly);
    if (memory && i % 30 === 29) peakMemory = Math.max(peakMemory, memory());
  }
  const totalMs = clock() - startedAt;
  const endMemory = memory ? memory() : null;
  if (endMemory !== null) peakMemory = Math.max(peakMemory, endMemory);

  const budget = options.data.gameConfig.performanceBudget;
  const report = ensureBuildingsReport(state);
  const buildings = {
    count: report.cellCount,
    levels: 0,
    workers: 0,
    averageOutput: 0,
    heldBack: 0,
  };
  for (let i = 0; i < report.cellCount; i++) {
    const cell = report.cells[i];
    const fine =
      report.limitKind[cell] === BUILDING_LIMIT.none ||
      report.limitKind[cell] === BUILDING_LIMIT.demand;
    buildings.levels += report.level[cell];
    buildings.workers += report.workers[cell];
    buildings.averageOutput += report.level[cell] * (fine ? 1 : report.output[cell]);
    if (!fine) buildings.heldBack += 1;
  }
  buildings.averageOutput = buildings.levels > 0 ? buildings.averageOutput / buildings.levels : 0;
  const markets = marketSummary(state);
  return {
    seed: state.seed,
    days: options.days,
    startDate,
    endDate: state.date,
    totalMs,
    dailyTicks: tickStats(
      daily.subarray(0, dailyCount),
      budget.dailyTickAverageMs,
      budget.worstDayMs,
    ),
    weeklyTicks: tickStats(weekly.subarray(0, weeklyCount), budget.weeklyTickAverageMs, null),
    systemTimings: state.getSystemTimings().sort((a, b) => b.totalMs - a.totalMs),
    startPopulation,
    endPopulation: worldPopulation(state.population),
    buildings,
    markets,
    trade: tradeSummary(state),
    food: foodSummary(state),
    stateHash: hashGameState(state),
    peakMemoryBytes: memory ? peakMemory : null,
    endMemoryBytes: endMemory,
  };
}

export interface StressTestOptions {
  readonly data: GameData;
  /** The seeds to run, one campaign each. */
  readonly seeds: readonly number[];
  readonly days: number;
  readonly clock: () => number;
  readonly memory?: () => number;
  /** Multiplies the placeholder load's sizes (`data/stress_test.json` → `sim.scale` otherwise). */
  readonly scale?: number;
}

export interface StressTestSummary {
  readonly runs: readonly CampaignSummary[];
  /** Over every run: the average, the worst and the 99th percentile of every tick. */
  readonly dailyTicks: TickStats;
  readonly weeklyTicks: TickStats;
  readonly peakMemoryBytes: number | null;
  /** Bytes the placeholder load keeps in typed arrays (the sim's own data, without the map). */
  readonly loadBytes: number;
  /** Time per system over every run, slowest first. */
  readonly systemTimings: readonly { id: SystemId; totalMs: number }[];
}

/**
 * The sim stress test (F139): campaigns on the full map, every country,
 * with the placeholder load of `data/stress_test.json` in place of the
 * systems still to be built, one per seed.
 */
export function runStressTest(options: StressTestOptions): StressTestSummary {
  const runs: CampaignSummary[] = [];
  const daily: number[] = [];
  const weekly: number[] = [];
  let loadBytes = 0;
  const systemTotals = new Map<SystemId, number>();
  for (const seed of options.seeds) {
    const load = createPlaceholderLoad(options.data.stressTest.sim, options.scale);
    const summary = runCampaign({
      data: options.data,
      seed,
      days: options.days,
      clock: options.clock,
      memory: options.memory,
      systems: load.systems,
      prepare: (state) => load.prepare(state),
      // Every tick of every run counts in the combined numbers.
      onTick: (elapsed, isWeekly) => (isWeekly ? weekly : daily).push(elapsed),
    });
    loadBytes = Math.max(loadBytes, load.bytes());
    for (const { id, totalMs } of summary.systemTimings)
      systemTotals.set(id, (systemTotals.get(id) ?? 0) + totalMs);
    runs.push(summary);
  }
  const budget = options.data.gameConfig.performanceBudget;
  const peaks = runs.map((run) => run.peakMemoryBytes ?? 0);
  return {
    runs,
    dailyTicks: tickStats(Float64Array.from(daily), budget.dailyTickAverageMs, budget.worstDayMs),
    weeklyTicks: tickStats(Float64Array.from(weekly), budget.weeklyTickAverageMs, null),
    peakMemoryBytes: options.memory ? Math.max(...peaks) : null,
    loadBytes,
    systemTimings: [...systemTotals]
      .map(([id, totalMs]) => ({ id, totalMs }))
      .sort((a, b) => b.totalMs - a.totalMs),
  };
}
