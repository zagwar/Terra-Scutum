import { z } from 'zod';

/**
 * `data/stress_test.json` (F139): the sizes of the performance stress tests
 * (docs/13_technical.md, "Performance plan and engine checkpoints"). Every
 * value is a [DEFAULT].
 *
 * - `sim`: the **placeholder load** the campaign runner (`--stress`) and the
 *   render stress test's sim worker run instead of the real systems, which
 *   don't exist yet: about the work the late-game economy, Swarm and war will
 *   do every day and every week, with every country simulated. It is not the
 *   game's rules, only work of a similar size and shape (typed arrays, loops
 *   over provinces, pops, buildings, markets, units and the adjacency graph).
 *   F140 replaces it with the real economy.
 * - `render`: what `?debug=stress` puts on the map (used by the game, not by the sim).
 */
const count = z.int().min(0).max(1_000_000);

export const simStressSchema = z.strictObject({
  /** Every count below is multiplied by this (the runner's `--scale` overrides it). */
  scale: z.number().positive().max(20),
  /** Kinds of goods traded on every country's market. */
  goods: z.int().min(2).max(500),
  /** Pop groups in each province (pop types × cultures × religions…). */
  popGroupsPerProvince: count,
  /** Goods each pop group buys every day. */
  needsPerPop: z.int().min(1).max(50),
  /** Buildings in each province (each with a level and a recipe). */
  buildingsPerProvince: count,
  inputsPerBuilding: z.int().min(0).max(10),
  outputsPerBuilding: z.int().min(1).max(10),
  /** Trade routes between two countries' markets, each moving every good. */
  tradeRoutes: count,
  /** Military units (divisions, fleets, air wings) drawing supply every day. */
  units: count,
  /** Battles fought at the same time, and the units on each side of one. */
  battles: count,
  unitsPerBattleSide: count,
  /** Times the supply network is relaxed over the province graph each day. */
  supplyPasses: z.int().min(0).max(50),
  /** Corporations and the investments each one weighs every week. */
  corporations: count,
  investmentsPerCorporation: count,
  /** Options every country's AI scores every week, each over all its provinces. */
  aiOptionsPerCountry: count,
});

const zoomView = z.strictObject({
  /** A translation key for the view's name. */
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  zoom: z.number().min(1).max(200),
});

export const renderStressSchema = z.strictObject({
  /** Buildings across the world: placed in clusters around province centers, more in bigger countries. */
  buildings: count,
  /** The models the buildings are drawn with (ids from `data/models.json`), picked in turn. */
  buildingModels: z.array(z.string()).min(1),
  /** How far apart buildings and units stand, in kilometres (they are drawn as symbols a few pixels tall). */
  buildingSpacingKm: z.number().positive().max(100),
  unitSpacingKm: z.number().positive().max(100),
  /** Military unit models standing in provinces (not counting the battle). */
  units: count,
  unitModels: z.array(z.string()).min(1),
  /** The battle: where, how many bugs attack, how many units hold the line. */
  battle: z.strictObject({
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
    bugs: count,
    bugModels: z.array(z.string()).min(1),
    defenders: count,
    /** Laser beams fired from the bugs into the sky at any moment, and explosions burning at once. */
    lasers: count,
    explosions: count,
    /** The size of the battlefield, in kilometres across. */
    sizeKm: z.number().positive().max(2000),
  }),
  /** Infrastructure lines: roads, rail and power lines between neighboring provinces on land. */
  infrastructure: z.strictObject({
    road: z.strictObject({ color: z.string(), widthPx: z.number().positive().max(8) }),
    rail: z.strictObject({ color: z.string(), widthPx: z.number().positive().max(8) }),
    power: z.strictObject({ color: z.string(), widthPx: z.number().positive().max(8) }),
  }),
  /** Weather and effects. */
  weather: z.strictObject({
    /** Rain particles falling around the view at once. */
    rainParticles: count,
    /** Cloud sprites drifting over the whole world. */
    clouds: count,
    /** Smoke and fire particles at the battle. */
    smokeParticles: count,
    fireParticles: count,
  }),
  /** Models are drawn this many pixels tall, by zoom (like the scenery's `sizePx`). */
  sizePx: z
    .array(z.strictObject({ zoom: z.number().positive(), px: z.number().positive() }))
    .min(1),
  /** Views the benchmark visits in turn, and how long it measures each one. */
  views: z.array(zoomView).min(1),
  measureSeconds: z.number().positive().max(60),
  /** The most it waits for a view's terrain and trees before measuring anyway. */
  settleSeconds: z.number().positive().max(120),
});

export const stressTestSchema = z.strictObject({
  sim: simStressSchema,
  render: renderStressSchema,
});

export type SimStressConfig = z.infer<typeof simStressSchema>;
export type RenderStressConfig = z.infer<typeof renderStressSchema>;
export type StressTestConfig = z.infer<typeof stressTestSchema>;
