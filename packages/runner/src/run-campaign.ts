import {
  type CalendarDate,
  type GameData,
  GameState,
  type SystemId,
  type SystemRegistry,
  hashGameState,
} from '@terra-scutum/sim';

export interface CampaignOptions {
  readonly data: GameData;
  readonly seed: number;
  readonly days: number;
  /** A millisecond clock, for example `performance.now`. */
  readonly clock: () => number;
  /** Defaults to the game's systems. Tests pass their own. */
  readonly systems?: SystemRegistry;
}

export interface TickStats {
  readonly count: number;
  readonly averageMs: number;
  readonly worstMs: number;
  /** The performance budget's target average for this kind of tick. */
  readonly budgetMs: number;
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
}

function tickStats(count: number, totalMs: number, worstMs: number, budgetMs: number): TickStats {
  const averageMs = count === 0 ? 0 : totalMs / count;
  return { count, averageMs, worstMs, budgetMs, withinBudget: averageMs <= budgetMs };
}

/**
 * Simulates `days` days from a new game and measures every tick.
 * (Once country AI exists, it will control every country here, including the player's.)
 */
export function runCampaign(options: CampaignOptions): CampaignSummary {
  const { clock } = options;
  const state = new GameState({
    data: options.data,
    seed: options.seed,
    systems: options.systems,
  });
  state.enableProfiling(clock);
  const startDate = state.date;

  let dailyCount = 0;
  let dailyTotal = 0;
  let dailyWorst = 0;
  let weeklyCount = 0;
  let weeklyTotal = 0;
  let weeklyWorst = 0;

  const startedAt = clock();
  for (let i = 0; i < options.days; i++) {
    const weekly = state.isWeeklyTickDay;
    const tickStartedAt = clock();
    state.advanceDay();
    const elapsed = clock() - tickStartedAt;
    state.drainEvents();
    if (weekly) {
      weeklyCount += 1;
      weeklyTotal += elapsed;
      if (elapsed > weeklyWorst) weeklyWorst = elapsed;
    } else {
      dailyCount += 1;
      dailyTotal += elapsed;
      if (elapsed > dailyWorst) dailyWorst = elapsed;
    }
  }
  const totalMs = clock() - startedAt;

  const budget = options.data.gameConfig.performanceBudget;
  return {
    seed: state.seed,
    days: options.days,
    startDate,
    endDate: state.date,
    totalMs,
    dailyTicks: tickStats(dailyCount, dailyTotal, dailyWorst, budget.dailyTickAverageMs),
    weeklyTicks: tickStats(weeklyCount, weeklyTotal, weeklyWorst, budget.weeklyTickAverageMs),
    systemTimings: state.getSystemTimings().sort((a, b) => b.totalMs - a.totalMs),
    stateHash: hashGameState(state),
  };
}
