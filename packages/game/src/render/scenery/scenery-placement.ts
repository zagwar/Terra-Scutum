import { CLIMATES, type DetailLevel, type SceneryConfig } from '@terra-scutum/sim';
import { mixSeed, seededRandom } from '../../generators/seeded-random';

/**
 * Where the scenery's models stand (F133), as pure code (no Babylon), so it
 * can be tested in Node. Map coordinates: x = degrees of longitude east (it
 * may run past ±180 near the world's edge, the map wraps), z = north.
 *
 * **Forests** are scattered on a fixed grid over the whole world, in levels:
 * level 0 has a cell every `BASE_CELL_DEGREES`, each next level cells half as
 * wide. Each cell has one candidate tree at a fixed spot (from a hash of the
 * cell), which grows where the land cover is forest. A level starts to
 * grow in once its cells are half `spacingPx` pixels apart and is full size
 * from `spacingPx`, so trees keep their place and new ones grow in between
 * as the view zooms in: the forest gets denser without anything jumping.
 */
export const BASE_CELL_DEGREES = 8;
/** Grid levels go no finer than this (about 3 m apart: far finer than any zoom needs). */
const MAX_GRID_LEVEL = 16;

/** The ground the screen shows, in map units (x may run past the world's edges). */
export interface ViewRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** What the forest needs to know about the land. */
export interface ForestGround {
  /** How much of the land at a place is forest: 0…1 (0 at sea). */
  forestShare(x: number, z: number): number;
  /** The height of the land in metres (at real scale). */
  heightM(x: number, z: number): number;
  /** True inside a province (the land cover data is coarser than the coasts: it doesn't know). */
  onLand(x: number, z: number): boolean;
  /** The latitude of a map z, in degrees. */
  latitude(z: number): number;
  /** The climate of the region at a place (its position in `CLIMATES`), or -1 if not known. */
  climate(x: number, z: number): number;
}

/** The trees found for a view, one entry per tree in each array. */
export interface ForestPlacement {
  count: number;
  readonly x: Float32Array;
  readonly z: Float32Array;
  /** The land's height under the tree, in metres. */
  readonly groundM: Float32Array;
  /** The grid level the tree belongs to (it grows in with its level). */
  readonly level: Uint8Array;
  /** The tree's grid cell as a number, the same every time (to know which trees are new). */
  readonly key: Uint32Array;
  /** Which entry of `forests.models` the tree is, and which variant of that model. */
  readonly model: Uint8Array;
  readonly variant: Uint8Array;
  /** Size (1 = normal), brightness (1 = normal) and turn (radians). */
  readonly size: Float32Array;
  readonly tint: Float32Array;
  readonly yaw: Float32Array;
}

export function createForestPlacement(capacity: number): ForestPlacement {
  return {
    count: 0,
    x: new Float32Array(capacity),
    z: new Float32Array(capacity),
    groundM: new Float32Array(capacity),
    level: new Uint8Array(capacity),
    key: new Uint32Array(capacity),
    model: new Uint8Array(capacity),
    variant: new Uint8Array(capacity),
    size: new Float32Array(capacity),
    tint: new Float32Array(capacity),
    yaw: new Float32Array(capacity),
  };
}

/** The cell width of a grid level, in degrees. */
export function gridCellDegrees(level: number): number {
  return BASE_CELL_DEGREES / 2 ** level;
}

/** How grown-in the trees of a grid level are at this many map units per pixel: 0 (not drawn) … 1. */
export function levelWeight(level: number, unitsPerPixel: number, spacingPx: number): number {
  const cellPx = gridCellDegrees(level) / unitsPerPixel;
  return smoothstep((cellPx - spacingPx * GROW_FROM) / (spacingPx * (1 - GROW_FROM)));
}

/** A grid level starts to grow in when its cells are this share of `spacingPx` apart. */
const GROW_FROM = 0.5;

/** The finest grid level drawn at this many map units per pixel. */
export function finestGridLevel(unitsPerPixel: number, spacingPx: number): number {
  const level = Math.floor(Math.log2(BASE_CELL_DEGREES / (spacingPx * GROW_FROM * unitsPerPixel)));
  return Math.min(MAX_GRID_LEVEL, Math.max(-1, level));
}

export function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * A search for the trees in a rectangle, done a slice at a time so it never
 * holds up a frame (`continueForestSearch`). It goes through every grid level
 * drawn at `unitsPerPixel`, coarsest first (so if `maxInstances` cuts the
 * list short, the trees that go are the newest fill-ins).
 */
export interface ForestSearch {
  readonly out: ForestPlacement;
  readonly rect: ViewRect;
  readonly unitsPerPixel: number;
  /** The finest grid level searched. */
  readonly finest: number;
  level: number;
  row: number;
  column: number;
  done: boolean;
}

export function startForestSearch(
  out: ForestPlacement,
  rect: ViewRect,
  unitsPerPixel: number,
  forests: SceneryConfig['forests'],
): ForestSearch {
  out.count = 0;
  const finest = finestGridLevel(unitsPerPixel, forests.spacingPx);
  return {
    out,
    rect,
    unitsPerPixel,
    finest,
    level: 0,
    row: Math.floor(rect.minZ / gridCellDegrees(0)),
    column: Math.floor(rect.minX / gridCellDegrees(0)),
    done: finest < 0,
  };
}

/** How many cells are looked at between two looks at the clock. */
const CELLS_PER_CHECK = 512;

/**
 * Goes on with a search until it is done or `now()` reaches `deadline`
 * (milliseconds). Returns true once the search is done. `variants[m]` is how
 * many variants the m-th model of `forests.models` has.
 */
export function continueForestSearch(
  search: ForestSearch,
  forests: SceneryConfig['forests'],
  variants: readonly number[],
  ground: ForestGround,
  deadline = Infinity,
  now: () => number = () => performance.now(),
): boolean {
  const { out, rect } = search;
  const capacity = Math.min(out.x.length, forests.maxInstances);
  const fits: number[] = [];
  // The numbers of one cell, from its hash (mulberry32, inline: this loop runs tens of thousands of times).
  let state = 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let sinceCheck = 0;
  while (!search.done) {
    const { level } = search;
    const cell = gridCellDegrees(level);
    const cellsAround = Math.round(360 / cell);
    const lastColumn = Math.floor(rect.maxX / cell);
    const lastRow = Math.floor(rect.maxZ / cell);
    if (search.row > lastRow) {
      // This level is done: on to the next finer one.
      search.level += 1;
      if (search.level > search.finest) {
        search.done = true;
        break;
      }
      search.row = Math.floor(rect.minZ / gridCellDegrees(search.level));
      search.column = Math.floor(rect.minX / gridCellDegrees(search.level));
      continue;
    }
    if (search.column > lastColumn) {
      search.row += 1;
      search.column = Math.floor(rect.minX / cell);
      continue;
    }
    // Out of time: stop before this cell (the next slice starts with it).
    if (++sinceCheck >= CELLS_PER_CHECK) {
      sinceCheck = 0;
      if (now() >= deadline) return false;
    }
    const { row, column } = search;
    search.column += 1;
    // The same cell on every copy of the world gets the same tree.
    const wrapped = ((column % cellsAround) + cellsAround) % cellsAround;
    state = mixSeed(level, wrapped, row + 1_000_000);
    const key = state;
    const x = (column + next()) * cell;
    const z = (row + next()) * cell;
    if (x < rect.minX || x > rect.maxX || z < rect.minZ || z > rect.maxZ) continue;
    const grows = next();
    const share = ground.forestShare(x, z);
    if (share <= 0 || grows >= share || !ground.onLand(x, z)) continue;
    // Which tree models grow here: climate, latitude and height (weighted where several fit).
    const latitude = Math.abs(ground.latitude(z));
    const groundM = ground.heightM(x, z);
    const climate = ground.climate(x, z);
    fits.length = 0;
    let totalWeight = 0;
    for (let m = 0; m < forests.models.length; m++) {
      const rule = forests.models[m];
      if (rule.latitudes && (latitude < rule.latitudes[0] || latitude > rule.latitudes[1]))
        continue;
      if (rule.heightsM && (groundM < rule.heightsM[0] || groundM > rule.heightsM[1])) continue;
      if (rule.climates && (climate < 0 || !rule.climates.includes(CLIMATES[climate]))) continue;
      fits.push(m);
      totalWeight += rule.weight;
    }
    if (fits.length === 0) continue;
    let pick = next() * totalWeight;
    let model = fits[fits.length - 1];
    for (const m of fits) {
      pick -= forests.models[m].weight;
      if (pick < 0) {
        model = m;
        break;
      }
    }
    const i = out.count;
    out.x[i] = x;
    out.z[i] = z;
    out.groundM[i] = groundM;
    out.level[i] = level;
    out.key[i] = key;
    out.model[i] = model;
    out.variant[i] = Math.floor(next() * variants[model]);
    out.size[i] = 1 + (next() * 2 - 1) * forests.sizeVariation;
    out.tint[i] = 1 + (next() * 2 - 1) * forests.tintVariation;
    out.yaw[i] = next() * Math.PI * 2;
    out.count += 1;
    if (out.count >= capacity) search.done = true;
  }
  return true;
}

/** Finds all the trees in `rect` at once (tests; the game searches a slice per frame). */
export function placeForest(
  out: ForestPlacement,
  rect: ViewRect,
  unitsPerPixel: number,
  forests: SceneryConfig['forests'],
  variants: readonly number[],
  ground: ForestGround,
): void {
  continueForestSearch(
    startForestSearch(out, rect, unitsPerPixel, forests),
    forests,
    variants,
    ground,
  );
}

/** A value given at some zoom levels (`stops`), in between changing evenly per zoom step. */
export function valueAtZoom(
  stops: readonly { readonly zoom: number; readonly px: number }[],
  zoom: number,
): number {
  if (zoom <= stops[0].zoom) return stops[0].px;
  for (let i = 1; i < stops.length; i++) {
    if (zoom > stops[i].zoom) continue;
    const share = Math.log(zoom / stops[i - 1].zoom) / Math.log(stops[i].zoom / stops[i - 1].zoom);
    return stops[i - 1].px + (stops[i].px - stops[i - 1].px) * share;
  }
  return stops[stops.length - 1].px;
}

/** How grown-in a kind of scenery is at a zoom level: 0 before `fromZoom`, 1 from `fullZoom`. */
export function zoomFade(fromZoom: number, fullZoom: number, zoom: number): number {
  if (fullZoom <= fromZoom) return zoom >= fromZoom ? 1 : 0;
  return smoothstep(Math.log(zoom / fromZoom) / Math.log(fullZoom / fromZoom));
}

/** Which detail level models of this height on screen (pixels) are drawn with. */
export function detailForPixels(
  pixels: number,
  scenery: Pick<SceneryConfig, 'simplePx' | 'detailedPx'>,
): DetailLevel {
  if (pixels >= scenery.detailedPx) return 'detailed';
  if (pixels >= scenery.simplePx) return 'simple';
  return 'icon';
}

/**
 * Writes one instance's matrix (Babylon's layout: turned by `yaw` about the
 * vertical, scaled by `scale`, standing at x, y, z) at `slot`.
 */
export function writeInstanceMatrix(
  matrices: Float32Array,
  slot: number,
  x: number,
  y: number,
  z: number,
  scale: number,
  yaw: number,
): void {
  const c = Math.cos(yaw) * scale;
  const s = Math.sin(yaw) * scale;
  const o = slot * 16;
  matrices[o] = c;
  matrices[o + 1] = 0;
  matrices[o + 2] = -s;
  matrices[o + 3] = 0;
  matrices[o + 4] = 0;
  matrices[o + 5] = scale;
  matrices[o + 6] = 0;
  matrices[o + 7] = 0;
  matrices[o + 8] = s;
  matrices[o + 9] = 0;
  matrices[o + 10] = c;
  matrices[o + 11] = 0;
  matrices[o + 12] = x;
  matrices[o + 13] = y;
  matrices[o + 14] = z;
  matrices[o + 15] = 1;
}

/**
 * The placeholder capital markers [DEFAULT]: `buildings` buildings around
 * each capital, laid out in a spiral (the first in the middle). Offsets are
 * in pixels on screen (the cluster keeps its size on screen at every zoom);
 * each building gets a variant, a size (the middle ones taller) and a turn
 * on a city grid. The same country always gets the same cluster.
 */
export interface ClusterBuilding {
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly variant: number;
  readonly size: number;
  readonly yaw: number;
}

export function capitalCluster(
  countryIndex: number,
  buildings: number,
  clusterPx: number,
  variants: number,
): ClusterBuilding[] {
  const random = seededRandom(mixSeed(0xc0ffee, countryIndex));
  const gridTurn = random.next() * (Math.PI / 2);
  const start = random.next() * Math.PI * 2;
  return Array.from({ length: buildings }, (_, k) => {
    const distance = k === 0 ? 0 : clusterPx * Math.sqrt(k / Math.max(1, buildings - 1));
    // The golden angle spreads the buildings evenly around the middle.
    const angle = start + k * 2.39996;
    return {
      offsetX: Math.cos(angle) * distance,
      offsetZ: Math.sin(angle) * distance,
      variant: Math.floor(random.next() * variants),
      size: (1.25 - (0.5 * distance) / Math.max(1, clusterPx)) * (0.9 + random.next() * 0.2),
      yaw: gridTurn + Math.floor(random.next() * 4) * (Math.PI / 2),
    };
  });
}
