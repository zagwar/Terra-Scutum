import type { SystemRegistry } from '@terra-scutum/sim';
import { loadGameDataFromDisk } from '@terra-scutum/tools';
import { describe, expect, it } from 'vitest';
import { runCampaign } from '../src';

describe('campaign runner', () => {
  const data = loadGameDataFromDisk();

  it('simulates the requested days and reports the dates', () => {
    const summary = runCampaign({ data, seed: 42, days: 730, clock: () => 0 });
    expect(summary.days).toBe(730);
    expect(summary.startDate).toEqual({ year: 2025, month: 1, day: 1 });
    expect(summary.endDate).toEqual({ year: 2027, month: 1, day: 1 });
    expect(summary.dailyTicks.count + summary.weeklyTicks.count).toBe(730);
    expect(summary.weeklyTicks.count).toBe(104);
  });

  it('gives the same state hash for the same seed and a different one for another seed', () => {
    const systems: SystemRegistry = { population: { daily: (s) => void s.rng.nextUint32() } };
    const run = (seed: number) =>
      runCampaign({ data, seed, days: 200, clock: () => 0, systems }).stateHash;
    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(7));
  });

  it('measures daily and weekly ticks separately against the performance budget', () => {
    let now = 0;
    const systems: SystemRegistry = {
      // 10 ms every day, plus 500 ms of weekly calculations on Mondays.
      industry: { daily: () => void (now += 10), weekly: () => void (now += 500) },
    };
    const summary = runCampaign({ data, seed: 1, days: 70, clock: () => now, systems });
    expect(summary.dailyTicks).toMatchObject({ count: 60, averageMs: 10, worstMs: 10 });
    expect(summary.dailyTicks.withinBudget).toBe(true);
    expect(summary.weeklyTicks).toMatchObject({ count: 10, averageMs: 510, worstMs: 510 });
    expect(summary.weeklyTicks.withinBudget).toBe(false);
    expect(summary.systemTimings).toEqual([{ id: 'industry', totalMs: 70 * 10 + 10 * 500 }]);
    expect(summary.totalMs).toBe(70 * 10 + 10 * 500);
  });
});
