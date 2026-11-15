import {
  LAND_COVER_CLASSES,
  type TerrainLayout,
  type TerrainTileData,
  terrainCellRows,
  terrainCellSize,
  terrainTileSizes,
} from '@terra-scutum/sim';

/**
 * The terrain import's grids: the land mask, the heights and the land cover
 * of one level, and how a coarser level is made from a finer one. Pure code
 * on typed arrays (the finest level has about 140 million cells).
 *
 * A level has `cells` cells east to west (it wraps) and `cellRows` rows of
 * cells south to north. Heights and the land mask sit at the cells' corners
 * ("nodes"): `cells` × (`cellRows` + 1) of them, node (i, j) at index
 * j × cells + i. Land cover sits in the cells: cell (i, j) at j × cells + i.
 */
export interface LevelGrid {
  readonly level: number;
  readonly cells: number;
  readonly cellRows: number;
  /** In map units. */
  readonly cellSize: number;
}

export function levelGrid(layout: TerrainLayout, level: number): LevelGrid {
  return {
    level,
    cells: layout.baseCells * 2 ** level,
    cellRows: terrainCellRows(layout, level),
    cellSize: terrainCellSize(layout, level),
  };
}

export const CLASS_COUNT = LAND_COVER_CLASSES.length;
const WATER = LAND_COVER_CLASSES.indexOf('water');
const BARE = LAND_COVER_CLASSES.indexOf('bare');
const SNOW = LAND_COVER_CLASSES.indexOf('snow');

/**
 * Marks the nodes inside a polygon (even-odd rule, so holes stay empty).
 * `rings` are in grid coordinates: x in cells east of longitude −180, z in
 * cells north of the map's southern edge.
 */
export function fillLandNodes(
  mask: Uint8Array,
  grid: LevelGrid,
  rings: readonly Float64Array[],
): void {
  const { cells, cellRows } = grid;
  let first = Infinity;
  let last = -Infinity;
  for (const ring of rings)
    for (let i = 1; i < ring.length; i += 2) {
      first = Math.min(first, ring[i]);
      last = Math.max(last, ring[i]);
    }
  const firstRow = Math.max(0, Math.ceil(first));
  const lastRow = Math.min(cellRows, Math.ceil(last) - 1);
  if (lastRow < firstRow) return;
  const crossings: number[][] = Array.from({ length: lastRow - firstRow + 1 }, () => []);
  for (const ring of rings) {
    const count = ring.length / 2;
    for (let a = count - 1, b = 0; b < count; a = b++) {
      const ax = ring[a * 2];
      const az = ring[a * 2 + 1];
      const bx = ring[b * 2];
      const bz = ring[b * 2 + 1];
      if (az === bz) continue;
      const from = Math.max(firstRow, Math.ceil(Math.min(az, bz)));
      const to = Math.min(lastRow, Math.ceil(Math.max(az, bz)) - 1);
      for (let row = from; row <= to; row++)
        crossings[row - firstRow].push(ax + ((row - az) * (bx - ax)) / (bz - az));
    }
  }
  for (let row = firstRow; row <= lastRow; row++) {
    const xs = crossings[row - firstRow].sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const to = Math.ceil(xs[k + 1]) - 1;
      for (let i = Math.ceil(xs[k]); i <= to; i++)
        mask[row * cells + (((i % cells) + cells) % cells)] = 1;
    }
  }
}

/** The elevation tiles joined into one picture in the Web Mercator projection (top row = north). */
export interface ElevationMosaic {
  readonly width: number;
  readonly height: number;
  /** Metres, row by row. */
  readonly metres: Int16Array;
}

/** A latitude's row in a Web Mercator picture that is `worldPixels` wide (0 = the top edge, at 85.05°N). */
export function mercatorRow(latitude: number, worldPixels: number): number {
  const radians = (latitude * Math.PI) / 180;
  return (0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI)) * worldPixels;
}

/** Negative heights are only kept this many nodes away from the sea (real depressions, not sea floor at a coast). */
const DEPRESSION_MARGIN = 6;
const LOWEST_M = -500;

/**
 * The height of every node of the finest level: the elevation data at land
 * nodes, zero at sea. `latitudeOfRow` gives the latitude of a node row.
 */
export function sampleHeights(
  mosaic: ElevationMosaic,
  grid: LevelGrid,
  mask: Uint8Array,
  latitudeOfRow: (row: number) => number,
): Int16Array {
  const { cells, cellRows } = grid;
  const heights = new Int16Array(cells * (cellRows + 1));
  const { width, height, metres } = mosaic;
  const isLand = (i: number, j: number) =>
    j >= 0 && j <= cellRows && mask[j * cells + (((i % cells) + cells) % cells)] === 1;
  for (let j = 0; j <= cellRows; j++) {
    const v = mercatorRow(latitudeOfRow(j), width) - 0.5;
    const v0 = Math.min(height - 2, Math.max(0, Math.floor(v)));
    const fv = Math.min(1, Math.max(0, v - v0));
    for (let i = 0; i < cells; i++) {
      if (mask[j * cells + i] !== 1) continue;
      const u = (i / cells) * width - 0.5;
      const u0 = Math.floor(u);
      const fu = u - u0;
      const a = ((u0 % width) + width) % width;
      const b = (a + 1) % width;
      const top = metres[v0 * width + a] * (1 - fu) + metres[v0 * width + b] * fu;
      const bottom = metres[(v0 + 1) * width + a] * (1 - fu) + metres[(v0 + 1) * width + b] * fu;
      let value = Math.round(top * (1 - fv) + bottom * fv);
      if (value < 0) {
        const m = DEPRESSION_MARGIN;
        const inland =
          isLand(i - m, j) &&
          isLand(i + m, j) &&
          isLand(i, j - m) &&
          isLand(i, j + m) &&
          isLand(i - m, j - m) &&
          isLand(i + m, j - m) &&
          isLand(i - m, j + m) &&
          isLand(i + m, j + m);
        value = inland ? Math.max(LOWEST_M, value) : 0;
      }
      heights[j * cells + i] = value;
    }
  }
  return heights;
}

/** The heights of the next coarser level: each node is a weighted average of the nine finer nodes around it. */
export function coarserHeights(
  heights: Int16Array,
  fine: LevelGrid,
  coarse: LevelGrid,
): Int16Array {
  const result = new Int16Array(coarse.cells * (coarse.cellRows + 1));
  const weights = [1, 2, 1];
  for (let j = 0; j <= coarse.cellRows; j++) {
    for (let i = 0; i < coarse.cells; i++) {
      let sum = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const row = Math.min(fine.cellRows, Math.max(0, 2 * j + dj));
        for (let di = -1; di <= 1; di++) {
          const column = (2 * i + di + fine.cells) % fine.cells;
          sum += heights[row * fine.cells + column] * weights[di + 1] * weights[dj + 1];
        }
      }
      result[j * coarse.cells + i] = Math.round(sum / 16);
    }
  }
  return result;
}

/** The land mask of the next coarser level: the finer mask at the nodes both levels share. */
export function coarserMask(mask: Uint8Array, fine: LevelGrid, coarse: LevelGrid): Uint8Array {
  const result = new Uint8Array(coarse.cells * (coarse.cellRows + 1));
  for (let j = 0; j <= coarse.cellRows; j++) {
    const row = Math.min(fine.cellRows, 2 * j);
    for (let i = 0; i < coarse.cells; i++)
      result[j * coarse.cells + i] = mask[row * fine.cells + 2 * i];
  }
  return result;
}

/** The class counts of the next coarser level: each cell adds up its four finer cells. */
export function coarserCounts(
  counts: Uint8Array | Uint16Array,
  fine: LevelGrid,
  coarse: LevelGrid,
): Uint16Array {
  const result = new Uint16Array(coarse.cells * coarse.cellRows * CLASS_COUNT);
  for (let j = 0; j < fine.cellRows; j++) {
    const row = j >> 1;
    for (let i = 0; i < fine.cells; i++) {
      const from = (j * fine.cells + i) * CLASS_COUNT;
      const to = (row * coarse.cells + (i >> 1)) * CLASS_COUNT;
      for (let k = 1; k < CLASS_COUNT; k++) result[to + k] += counts[from + k];
    }
  }
  return result;
}

export interface CoverGrid {
  /** Main class (low four bits) and second class (high four bits) per cell. */
  readonly cover: Uint8Array;
  /** The second class's share of the two, 0…15. */
  readonly mix: Uint8Array;
}

/**
 * Turns class counts into the two commonest classes per cell. A cell is land
 * when at least two of its corners are; in sea cells water doesn't count, so
 * the coast's land cover runs up to the coastline instead of fading to blue.
 * Cells without data take a neighbor's cover (a few rounds), then a default.
 */
export function coverFromCounts(
  counts: Uint8Array | Uint16Array,
  grid: LevelGrid,
  mask: Uint8Array,
  latitudeOfRow: (row: number) => number,
): CoverGrid {
  const { cells, cellRows } = grid;
  const cover = new Uint8Array(cells * cellRows);
  const mix = new Uint8Array(cells * cellRows);
  for (let j = 0; j < cellRows; j++) {
    for (let i = 0; i < cells; i++) {
      const east = (i + 1) % cells;
      const corners =
        mask[j * cells + i] +
        mask[j * cells + east] +
        mask[(j + 1) * cells + i] +
        mask[(j + 1) * cells + east];
      const base = (j * cells + i) * CLASS_COUNT;
      let best = 0;
      let bestCount = 0;
      let second = 0;
      let secondCount = 0;
      for (let k = 1; k < CLASS_COUNT; k++) {
        if (k === WATER && corners < 2) continue;
        const count = counts[base + k];
        if (count > bestCount) {
          second = best;
          secondCount = bestCount;
          best = k;
          bestCount = count;
        } else if (count > secondCount) {
          second = k;
          secondCount = count;
        }
      }
      if (bestCount === 0) continue;
      if (secondCount === 0) second = best;
      cover[j * cells + i] = best | (second << 4);
      mix[j * cells + i] = Math.round((15 * secondCount) / (bestCount + secondCount));
    }
  }
  // Cells without data: take over a neighbor's cover, a ring at a time.
  const rounds = 4 + grid.level * 2;
  let frontier: number[] = [];
  for (let index = 0; index < cover.length; index++) if (cover[index] === 0) frontier.push(index);
  for (let round = 0; round < rounds && frontier.length > 0; round++) {
    const filled: [number, number][] = [];
    const still: number[] = [];
    for (const index of frontier) {
      const i = index % cells;
      const j = (index - i) / cells;
      const candidates = [
        j * cells + ((i + 1) % cells),
        j * cells + ((i + cells - 1) % cells),
        j + 1 < cellRows ? index + cells : -1,
        j > 0 ? index - cells : -1,
      ];
      let source = -1;
      for (const candidate of candidates)
        if (candidate >= 0 && cover[candidate] !== 0) {
          source = candidate;
          break;
        }
      if (source >= 0) filled.push([index, source]);
      else still.push(index);
    }
    for (const [index, source] of filled) {
      cover[index] = cover[source];
      mix[index] = mix[source];
    }
    frontier = still;
  }
  // Whatever is left (far from any data): ice near the poles, bare ground elsewhere.
  for (const index of frontier) {
    const row = Math.floor(index / cells);
    const fallback = Math.abs(latitudeOfRow(row)) > 75 ? SNOW : BARE;
    cover[index] = fallback | (fallback << 4);
  }
  return { cover, mix };
}

export interface LevelData {
  readonly grid: LevelGrid;
  readonly heights: Int16Array;
  readonly cover: Uint8Array;
  readonly mix: Uint8Array;
}

/** Cuts one tile out of a level (with its extra ring of nodes and its two extra rings of cells). */
export function cutTile(
  data: LevelData,
  tileCells: number,
  column: number,
  row: number,
): TerrainTileData {
  const { cells, cellRows } = data.grid;
  const { nodes, cells: coverCells } = terrainTileSizes(tileCells);
  const heights = new Int16Array(nodes);
  const nodeSide = tileCells + 3;
  for (let jj = 0; jj < nodeSide; jj++) {
    const j = row * tileCells + jj - 1;
    if (j < 0 || j > cellRows) continue;
    for (let ii = 0; ii < nodeSide; ii++) {
      const i = (column * tileCells + ii - 1 + cells) % cells;
      heights[jj * nodeSide + ii] = data.heights[j * cells + i];
    }
  }
  const cover = new Uint8Array(coverCells);
  const coverMix = new Uint8Array(coverCells);
  const cellSide = tileCells + 4;
  for (let jj = 0; jj < cellSide; jj++) {
    const j = Math.min(cellRows - 1, Math.max(0, row * tileCells + jj - 2));
    for (let ii = 0; ii < cellSide; ii++) {
      const i = (column * tileCells + ii - 2 + cells) % cells;
      cover[jj * cellSide + ii] = data.cover[j * cells + i];
      coverMix[jj * cellSide + ii] = data.mix[j * cells + i];
    }
  }
  return { heights, cover, coverMix };
}

/** Bends smaller than `tolerance` are dropped from a line (Douglas–Peucker). `points`: x, y pairs. */
export function simplifyLine(points: readonly number[], tolerance: number): number[] {
  const count = points.length / 2;
  if (count <= 2 || tolerance <= 0) return [...points];
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack: [number, number][] = [[0, count - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    const ax = points[from * 2];
    const ay = points[from * 2 + 1];
    const dx = points[to * 2] - ax;
    const dy = points[to * 2 + 1] - ay;
    const length = Math.hypot(dx, dy);
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = from + 1; i < to; i++) {
      const px = points[i * 2] - ax;
      const py = points[i * 2 + 1] - ay;
      const distance = length > 0 ? Math.abs(px * dy - py * dx) / length : Math.hypot(px, py);
      if (distance > worstDistance) {
        worst = i;
        worstDistance = distance;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([from, worst], [worst, to]);
    }
  }
  const result: number[] = [];
  for (let i = 0; i < count; i++) if (keep[i]) result.push(points[i * 2], points[i * 2 + 1]);
  return result;
}
