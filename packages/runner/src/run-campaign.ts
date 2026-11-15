import {
  type CalendarDate,
  type GameData,
  GameState,
  type SystemId,
  type SystemRegistry,
  createPlaceholderLoad,
  hashGameState,
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
 * (Swarm control %, population, hive tiers, refugees, relations, nukes used).
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
  /** Fingerprint of the final state; equal for two runs with the same seed. */
  readonly stateHash: string;
  /** The most memory seen during the run and at its end, in bytes (null without a `memory` option). */
  readonly peakMemoryBytes: number | null;
  readonly endMemoryBytes: number | null;
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
