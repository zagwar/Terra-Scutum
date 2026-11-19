import { economySystems } from '../economy/economy';
import { populationSystem } from '../economy/population';
import { foodSystem } from '../economy/food';
import { budgetSystem } from '../economy/budget';
import type { GameState } from './game-state';

/**
 * The fixed order in which the daily tick runs the sim's systems
 * (docs/13_technical.md, "A single daily tick"). The order is part of the
 * game's rules: changing it changes results, so it lives in exactly one place.
 */
export const TICK_ORDER = [
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
] as const;

export type SystemId = (typeof TICK_ORDER)[number];

/**
 * One system of the sim. Both hooks are optional:
 * - `daily` runs every day.
 * - `weekly` runs on Mondays only, for the heavier calculations (market prices,
 *   pop job changes, corporation decisions, AI planning). On a Monday a
 *   system's `weekly` runs just before its own `daily`. [DEFAULT]
 *
 * Systems must be deterministic: use `state.rng` for randomness, iterate in a
 * fixed order (sort by id), and avoid allocating in `daily`.
 */
export interface SimSystem {
  daily?(state: GameState): void;
  weekly?(state: GameState): void;
}

export type SystemRegistry = Readonly<Partial<Record<SystemId, SimSystem>>>;

/**
 * The game's systems. Each feature adds its system here under its slot, for
 * example `population: populationSystem`. Slots without a system are skipped.
 */
export const SYSTEMS: SystemRegistry = {
  population: populationSystem,
  // Buildings (F07) and markets (F65): energy, resourceProduction, industry and market.
  ...economySystems,
  // Food (F08): food security, starvation, famine, rationing.
  foodConsumption: foodSystem,
  // The budget (F09): taxes, spending, debt, inflation.
  budget: budgetSystem,
};
