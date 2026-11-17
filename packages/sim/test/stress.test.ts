import { describe, expect, it } from 'vitest';
import { GameState, createPlaceholderLoad, hashGameState } from '../src';
import { testData } from './helpers';

describe('the sim stress test’s placeholder load (F139)', () => {
  const data = testData();

  const run = (seed: number, days: number, scale?: number) => {
    const load = createPlaceholderLoad(data.stressTest.sim, scale);
    const state = new GameState({ data, seed, systems: load.systems });
    load.prepare(state);
    for (let day = 0; day < days; day++) state.advanceDay();
    return { state, load };
  };

  it('runs every day and week in the slots of the systems it stands in for', () => {
    const load = createPlaceholderLoad(data.stressTest.sim);
    expect(Object.keys(load.systems).sort()).toEqual([
      'budget',
      'combat',
      'diplomacyAi',
      'energy',
      'industry',
      'laserCoverage',
      'population',
      'resourceProduction',
      'supply',
      'swarmGrowth',
      'swarmSpread',
      'trade',
    ]);
    const { state } = run(42, 30);
    expect(state.day).toBe(30);
    // The real buildings (F07) run too: every type in every province, and they produce.
    const buildings = state.buildings;
    expect(buildings.cellCount).toBe(state.world.provinceIds.length * buildings.typeCount);
    expect(buildings.made.some((amount) => amount > 0)).toBe(true);
  });

  it('is deterministic: the same seed gives the same campaign, another seed another one', () => {
    const a = run(42, 40).state;
    const b = run(42, 40).state;
    const c = run(7, 40).state;
    expect(a.rng.getState()).toEqual(b.rng.getState());
    expect(hashGameState(a)).toBe(hashGameState(b));
    expect(a.rng.getState()).not.toEqual(c.rng.getState());
  });

  it('makes its arrays when prepared, and more of them at a bigger scale', () => {
    const load = createPlaceholderLoad(data.stressTest.sim);
    expect(load.bytes()).toBe(0);
    const state = new GameState({ data, seed: 1, systems: load.systems });
    load.prepare(state);
    const normal = load.bytes();
    expect(normal).toBeGreaterThan(0);
    const bigger = run(1, 0, 3).load.bytes();
    expect(bigger).toBeGreaterThan(normal * 2);
  });
});
