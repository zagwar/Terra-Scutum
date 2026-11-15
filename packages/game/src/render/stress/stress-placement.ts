import type { RenderStressConfig, WorldMap } from '@terra-scutum/sim';
import { hashUnit } from '../../generators/seeded-random';
import { LINE_COAST, LINE_OTHER_COUNTRY, LINE_PLAIN, type StyledLine } from '../map/map-geometry';

/**
 * Where the render stress test (F139, `?debug=stress`) puts its late-game
 * load on the map [DEFAULT]: pure code, unit tested in Node. Everything is
 * placed from a fixed seed, so every run (and the designer's preview) shows
 * the same picture.
 *
 * - **Buildings** in a city at each province's label point, more in
 *   countries with more people (population^0.6) and in bigger provinces
 *   (area^0.5), laid out in a sunflower spiral `buildingSpacingKm` apart.
 * - **Units** in small formations in the provinces at a country border,
 *   placed toward the neighbor and facing it.
 * - **The battle**: defenders in three rows facing east, bugs attacking from
 *   the east (denser toward the front).
 * - **Infrastructure lines** between the label points of neighboring
 *   provinces: a road on every link, a railway and a power line where both
 *   provinces belong to the same country.
 */

/** Kinds of placed models. */
export const STRESS_BUILDING = 0;
export const STRESS_UNIT = 1;
export const STRESS_BUG = 2;

export interface PlacedModels {
  count: number;
  readonly x: Float32Array;
  readonly z: Float32Array;
  /** Index into `StressPlacement.models`. */
  readonly model: Uint16Array;
  readonly variant: Uint8Array;
  readonly yaw: Float32Array;
  /** Size factor (1 = the usual size). */
  readonly size: Float32Array;
  readonly kind: Uint8Array;
  /** For animation: a number from 0 to 1, different for each model. */
  readonly phase: Float32Array;
}

export interface StressPlacement {
  /** The model ids the placed models use, by `model` index. */
  readonly models: readonly string[];
  /** Buildings and units (they stand still). */
  readonly statics: PlacedModels;
  /** The battle's bugs (animated every frame). */
  readonly bugs: PlacedModels;
  /** The battle's defenders (they stand still). */
  readonly defenders: PlacedModels;
  readonly lines: readonly StyledLine[];
  /** The battle's middle (map units) and half its size across (map units). */
  readonly battle: { readonly x: number; readonly z: number; readonly halfSize: number };
}

/** Line kinds of the infrastructure, mapped to the line shader's three styles. */
export const ROAD_KIND = LINE_PLAIN;
export const RAIL_KIND = LINE_OTHER_COUNTRY;
export const POWER_KIND = LINE_COAST;

export interface StressGround {
  /** Map position from longitude and latitude. */
  x(longitude: number): number;
  z(latitude: number): number;
  latitude(z: number): number;
  /** The province (index) at a map position, or -1 at sea. */
  provinceAt(x: number, z: number): number;
}

const KM_PER_DEGREE = 111.32;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SEED = 139;

function createPlaced(capacity: number): PlacedModels {
  return {
    count: 0,
    x: new Float32Array(capacity),
    z: new Float32Array(capacity),
    model: new Uint16Array(capacity),
    variant: new Uint8Array(capacity),
    yaw: new Float32Array(capacity),
    size: new Float32Array(capacity),
    kind: new Uint8Array(capacity),
    phase: new Float32Array(capacity),
  };
}

function add(
  placed: PlacedModels,
  x: number,
  z: number,
  model: number,
  variant: number,
  yaw: number,
  size: number,
  kind: number,
  phase: number,
): void {
  const i = placed.count++;
  placed.x[i] = x;
  placed.z[i] = z;
  placed.model[i] = model;
  placed.variant[i] = variant;
  placed.yaw[i] = yaw;
  placed.size[i] = size;
  placed.kind[i] = kind;
  placed.phase[i] = phase;
}

/**
 * Map units per kilometre at a map position, east–west and north–south. On
 * the projection a degree of longitude is always 1 map unit, but holds fewer
 * kilometres toward the poles; north–south follows the projection's stretch.
 */
function unitsPerKm(ground: StressGround, z: number): { x: number; z: number } {
  const latitude = ground.latitude(z);
  const perKmX = 1 / (KM_PER_DEGREE * Math.max(0.1, Math.cos((latitude * Math.PI) / 180)));
  const dz = ground.z(Math.min(89, latitude + 0.01)) - ground.z(Math.max(-89, latitude - 0.01));
  const perKmZ = dz / 0.02 / KM_PER_DEGREE;
  return { x: perKmX, z: perKmZ };
}

/** Splits `total` into whole parts by weight (largest remainders get the leftovers). */
export function apportion(weights: ArrayLike<number>, total: number): Int32Array {
  const counts = new Int32Array(weights.length);
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += weights[i];
  if (sum <= 0 || total <= 0) return counts;
  const remainders: { index: number; rest: number }[] = [];
  let given = 0;
  for (let i = 0; i < weights.length; i++) {
    const exact = (weights[i] / sum) * total;
    counts[i] = Math.floor(exact);
    given += counts[i];
    remainders.push({ index: i, rest: exact - counts[i] });
  }
  remainders.sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let k = 0; given < total; k++, given++) counts[remainders[k % remainders.length].index] += 1;
  return counts;
}

export function placeStressLoad(
  world: WorldMap,
  countryPopulation: ArrayLike<number>,
  config: RenderStressConfig,
  variantsOf: (modelId: string) => number,
  ground: StressGround,
): StressPlacement {
  const models: string[] = [];
  const modelIndex = (id: string) => {
    let index = models.indexOf(id);
    if (index < 0) index = models.push(id) - 1;
    return index;
  };
  const buildingModels = config.buildingModels.map(modelIndex);
  const unitModels = config.unitModels.map(modelIndex);
  const bugModels = config.battle.bugModels.map(modelIndex);
  const variants = models.map((id) => Math.max(1, variantsOf(id)));
  const provinces = world.provinceIds.length;
  const centerX = (p: number) => ground.x(world.provinceCenter[p * 2]);
  const centerZ = (p: number) => ground.z(world.provinceCenter[p * 2 + 1]);

  // ── Buildings: cities at the provinces' label points ────────────────────
  const countryWeight = new Float64Array(world.countryIds.length);
  const countryArea = new Float64Array(world.countryIds.length);
  for (let c = 0; c < countryWeight.length; c++)
    countryWeight[c] = Math.pow(Math.max(1, countryPopulation[c] ?? 1), 0.6);
  for (let p = 0; p < provinces; p++)
    countryArea[world.provinceCountry[p]] += Math.sqrt(world.provinceAreaKm2[p]);
  const provinceWeight = new Float64Array(provinces);
  for (let p = 0; p < provinces; p++) {
    const c = world.provinceCountry[p];
    provinceWeight[p] = (countryWeight[c] * Math.sqrt(world.provinceAreaKm2[p])) / countryArea[c];
  }
  const perProvince = apportion(provinceWeight, config.buildings);
  const statics = createPlaced(config.buildings + config.units);
  for (let p = 0; p < provinces; p++) {
    const wanted = perProvince[p];
    const cx = centerX(p);
    const cz = centerZ(p);
    const scale = unitsPerKm(ground, cz);
    let placed = 0;
    // A sunflower spiral: dense, even, the first building in the middle. Places
    // outside the province (the sea, a neighbor) are skipped.
    for (let k = 0; placed < wanted && k < wanted * 4; k++) {
      const radius = config.buildingSpacingKm * Math.sqrt(k) * 0.6;
      const angle = k * GOLDEN_ANGLE;
      const x = cx + Math.cos(angle) * radius * scale.x;
      const z = cz + Math.sin(angle) * radius * scale.z;
      if (ground.provinceAt(x, z) !== p) continue;
      const pick = hashUnit(SEED, p, k);
      const model = buildingModels[Math.floor(pick * buildingModels.length)];
      // The middle of a city is taller.
      const size =
        (1.25 - 0.5 * Math.min(1, k / Math.max(1, wanted))) *
        (0.85 + 0.3 * hashUnit(SEED, p, k, 1));
      add(
        statics,
        x,
        z,
        model,
        Math.floor(hashUnit(SEED, p, k, 2) * variants[model]),
        // City grid: buildings turned in steps of 90°, with a turn per city.
        hashUnit(SEED, p, 0, 3) * Math.PI * 0.5 +
          Math.floor(hashUnit(SEED, p, k, 4) * 4) * Math.PI * 0.5,
        size,
        STRESS_BUILDING,
        hashUnit(SEED, p, k, 5),
      );
      placed += 1;
    }
  }

  // ── Units: formations in the provinces at a country border ─────────────
  const border: { province: number; toward: number }[] = [];
  for (let p = 0; p < provinces; p++) {
    const from = world.provinceNeighbors.offsets[p];
    const to = world.provinceNeighbors.offsets[p + 1];
    for (let k = from; k < to; k++) {
      const q = world.provinceNeighbors.targets[k];
      if (world.provinceCountry[q] !== world.provinceCountry[p]) {
        border.push({ province: p, toward: q });
        break;
      }
    }
  }
  if (border.length === 0)
    for (let p = 0; p < provinces; p++) border.push({ province: p, toward: p });
  const unitsPer = apportion(new Float64Array(border.length).fill(1), config.units);
  border.forEach(({ province: p, toward: q }, b) => {
    const cx = centerX(p);
    const cz = centerZ(p);
    // Wrap-aware direction toward the neighbor's label point.
    let dx = centerX(q) - cx;
    dx -= Math.round(dx / 360) * 360;
    const dz = centerZ(q) - cz;
    const length = Math.hypot(dx, dz) || 1;
    const ux = dx / length;
    const uz = dz / length;
    const yaw = -Math.atan2(uz, ux);
    const scale = unitsPerKm(ground, cz);
    const spacing = config.unitSpacingKm;
    // The formation stands 40 % of the way to the neighbor, in rows of six across the direction.
    const baseX = cx + dx * 0.4;
    const baseZ = cz + dz * 0.4;
    for (let u = 0; u < unitsPer[b]; u++) {
      const row = Math.floor(u / 6);
      const column = (u % 6) - 2.5;
      const along = -row * spacing;
      const across = column * spacing;
      const x = baseX + (ux * along - uz * across) * scale.x;
      const z = baseZ + (uz * along + ux * across) * scale.z;
      const model = unitModels[u % unitModels.length];
      add(
        statics,
        x,
        z,
        model,
        Math.floor(hashUnit(SEED, b, u, 6) * variants[model]),
        yaw,
        1,
        STRESS_UNIT,
        hashUnit(SEED, b, u, 7),
      );
    }
  });

  // ── The battle ─────────────────────────────────────────────────────────
  const battleX = ground.x(config.battle.longitude);
  const battleZ = ground.z(config.battle.latitude);
  const battleScale = unitsPerKm(ground, battleZ);
  const halfKm = config.battle.sizeKm / 2;
  const defenders = createPlaced(config.battle.defenders);
  const rows = 3;
  const perRow = Math.ceil(config.battle.defenders / rows);
  for (let d = 0; d < config.battle.defenders; d++) {
    const row = Math.floor(d / perRow);
    const along = (((d % perRow) + 0.5) / perRow - 0.5) * 1.6 * halfKm;
    const x = battleX + (-0.3 * halfKm - row * config.unitSpacingKm) * battleScale.x;
    const z = battleZ + along * battleScale.z;
    const model = unitModels[d % unitModels.length];
    add(
      defenders,
      x,
      z,
      model,
      Math.floor(hashUnit(SEED, d, 0, 8) * variants[model]),
      0,
      1,
      STRESS_UNIT,
      hashUnit(SEED, d, 0, 9),
    );
  }
  const bugs = createPlaced(config.battle.bugs);
  for (let i = 0; i < config.battle.bugs; i++) {
    // Denser toward the front (the west edge of their side).
    const depth = Math.pow(hashUnit(SEED, i, 1, 10), 1.8);
    const across = hashUnit(SEED, i, 1, 11) - 0.5;
    const along = across * 1.8 * halfKm;
    // A ragged front: some stretches of it have pushed farther west.
    const front = -0.1 + 0.12 * Math.sin(across * 9 + 1) + 0.06 * Math.sin(across * 23);
    const x = battleX + (front + depth * 1.0) * halfKm * battleScale.x;
    const z = battleZ + along * battleScale.z;
    const model = bugModels[i % bugModels.length];
    add(
      bugs,
      x,
      z,
      model,
      Math.floor(hashUnit(SEED, i, 1, 12) * variants[model]),
      // Facing west, toward the defenders, give or take.
      Math.PI + (hashUnit(SEED, i, 1, 13) - 0.5) * 0.8,
      0.85 + 0.3 * hashUnit(SEED, i, 1, 14),
      STRESS_BUG,
      hashUnit(SEED, i, 1, 15),
    );
  }

  // ── Infrastructure lines ───────────────────────────────────────────────
  const lines: StyledLine[] = [];
  for (let p = 0; p < provinces; p++) {
    const from = world.provinceNeighbors.offsets[p];
    const to = world.provinceNeighbors.offsets[p + 1];
    for (let k = from; k < to; k++) {
      const q = world.provinceNeighbors.targets[k];
      if (q <= p) continue; // each link once
      const ax = centerX(p);
      const az = centerZ(p);
      let dx = centerX(q) - ax;
      dx -= Math.round(dx / 360) * 360;
      const bx = ax + dx;
      const bz = centerZ(q);
      // Links across a sea strait (a long way apart) get no road.
      if (Math.hypot(dx, bz - az) > 25) continue;
      const sameCountry = world.provinceCountry[p] === world.provinceCountry[q];
      const route = (offset: number, kind: number) => {
        // A gentle bend in the middle, to one side, so the three lines don't lie on top of each other.
        const mx = (ax + bx) / 2 - (bz - az) * offset;
        const mz = (az + bz) / 2 + dx * offset;
        lines.push({ points: Float32Array.of(ax, az, mx, mz, bx, bz), kind });
      };
      route(0.04, ROAD_KIND);
      if (sameCountry) {
        route(-0.05, RAIL_KIND);
        route(0.12, POWER_KIND);
      }
    }
  }

  return {
    models,
    statics,
    bugs,
    defenders,
    lines,
    battle: { x: battleX, z: battleZ, halfSize: halfKm * battleScale.x },
  };
}
