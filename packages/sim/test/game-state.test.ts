import { describe, expect, it } from 'vitest';
import {
  GameState,
  SYSTEMS,
  type SimSystem,
  type SystemId,
  type SystemRegistry,
  TICK_ORDER,
  createSnapshot,
  formatIsoDate,
  hashGameState,
} from '../src';
import { testData } from './helpers';

describe('tick order', () => {
  it('matches the design (docs/13_technical.md, "A single daily tick")', () => {
    // If this fails because the order was changed on purpose, update the design doc too.
    expect(TICK_ORDER).toEqual([
      'weather',
      'population',
      'energy',
      'resourceProduction',
      'industry',
      'market',
      'trade',
      'foodConsumption',
      'budget',
      'powerGrid',
      'militaryProduction',
      'supply',
      'publicOpinion',
      'diplomacyAi',
      'swarmGrowth',
      'swarmSpread',
      'laserCoverage',
      'disruptionDecay',
      'jointOperations',
      'combat',
      'refugees',
      'falloutPollution',
      'stability',
      'research',
      'events',
      'news',
      'winLoseCheck',
    ]);
    expect(new Set(TICK_ORDER).size).toBe(TICK_ORDER.length);
  });

  it('only registers systems under known slots', () => {
    for (const id of Object.keys(SYSTEMS)) expect(TICK_ORDER).toContain(id);
  });
});

describe('GameState.advanceDay', () => {
  it('starts on the start date and moves one calendar day per tick', () => {
    const state = new GameState({ data: testData(), seed: 1 });
    expect(state.day).toBe(0);
    expect(formatIsoDate(state.date)).toBe('2025-01-01');
    state.advanceDay();
    expect(state.day).toBe(1);
    expect(formatIsoDate(state.date)).toBe('2025-01-02');
    for (let i = 0; i < 730; i++) state.advanceDay();
    expect(formatIsoDate(state.date)).toBe('2027-01-02');
    expect(createSnapshot(state)).toMatchObject({
      day: 731,
      date: { year: 2027, month: 1, day: 2 },
    });
  });

  it('runs systems in tick order, whatever order they were registered in', () => {
    const log: string[] = [];
    const record = (id: SystemId): SimSystem => ({ daily: () => void log.push(id) });
    const systems: SystemRegistry = {
      winLoseCheck: record('winLoseCheck'),
      combat: record('combat'),
      weather: record('weather'),
      population: record('population'),
      swarmGrowth: record('swarmGrowth'),
    };
    const state = new GameState({ data: testData(), seed: 1, systems });
    state.advanceDay();
    expect(log).toEqual(['weather', 'population', 'swarmGrowth', 'combat', 'winLoseCheck']);
  });

  it('runs weekly calculations on Mondays only, just before that system’s daily step', () => {
    const log: string[] = [];
    const systems: SystemRegistry = {
      population: {
        daily: (state) => void log.push(`${formatIsoDate(state.date)} population daily`),
      },
      trade: {
        weekly: (state) => void log.push(`${formatIsoDate(state.date)} trade weekly`),
        daily: (state) => void log.push(`${formatIsoDate(state.date)} trade daily`),
      },
    };
    const state = new GameState({ data: testData(), seed: 1, systems });
    for (let i = 0; i < 14; i++) state.advanceDay(); // 1 Jan (Wed) … 14 Jan (Tue)
    const weeklyRuns = log.filter((line) => line.endsWith('weekly'));
    expect(weeklyRuns).toEqual(['2025-01-06 trade weekly', '2025-01-13 trade weekly']);
    const monday = log.filter((line) => line.startsWith('2025-01-06'));
    expect(monday).toEqual([
      '2025-01-06 population daily',
      '2025-01-06 trade weekly',
      '2025-01-06 trade daily',
    ]);
    expect(log.filter((line) => line.endsWith('daily'))).toHaveLength(28);
  });

  it('times each system when profiling is on', () => {
    let now = 0;
    const systems: SystemRegistry = {
      weather: { daily: () => void (now += 2) },
      combat: { daily: () => void (now += 5) },
    };
    const state = new GameState({ data: testData(), seed: 1, systems });
    state.enableProfiling(() => now);
    for (let i = 0; i < 10; i++) state.advanceDay();
    expect(state.getSystemTimings()).toEqual([
      { id: 'weather', totalMs: 20 },
      { id: 'combat', totalMs: 50 },
    ]);
  });
});

describe('determinism', () => {
  /** A stand-in system that uses randomness the way real systems will. */
  const randomWalk: SystemRegistry = {
    population: {
      daily: (state) => {
        const rolls = state.rng.nextInt(1, 6);
        for (let i = 0; i < rolls; i++) state.rng.nextFloat();
      },
      weekly: (state) => void state.rng.nextUint32(),
    },
  };

  const run = (seed: number, days: number) => {
    const state = new GameState({ data: testData(), seed, systems: randomWalk });
    for (let i = 0; i < days; i++) state.advanceDay();
    return hashGameState(state);
  };

  it('gives the same result for the same seed', () => {
    expect(run(42, 500)).toBe(run(42, 500));
  });

  it('gives different results for different seeds or lengths', () => {
    expect(run(42, 500)).not.toBe(run(43, 500));
    expect(run(42, 500)).not.toBe(run(42, 501));
  });
});
