import { METRES_PER_MAP_UNIT } from '@terra-scutum/sim';
import earcut from 'earcut';
import type { FillGeometry, LineGeometry, MapPolygon, StyledLine } from '../map/map-geometry';
import { type TileSurface, cellHeight, surfaceHeightLocal } from './terrain-surface';

/**
 * Lays the map's shapes on the terrain (F125). Pure code.
 *
 * The land of one tile is a grid of mesh cells, each two flat triangles
 * (terrain-surface.ts). Here every province polygon is cut along that grid:
 * a cell that lies wholly inside the polygon becomes its two triangles; a
 * cell the polygon's outline runs through is cut exactly along the outline.
 * So the provinces are the terrain: borders stay as sharp as on the flat
 * map, colors and highlights keep working per province, and nothing has to
 * be projected onto the land afterwards. Border lines are cut at the same
 * grid lines, so they lie exactly on the surface.
 *
 * Heights are stored in map units at real scale (metres ÷ 111,320); the
 * shaders multiply them by the exaggeration of the moment.
 */

/** Points as u0, v0, u1, v1, … in mesh cells from the tile's south-west corner. */
type Ring = number[];

/** Drops points that repeat the one before (and a last point that repeats the first). */
function clean(points: Ring): Ring {
  const result: Ring = [];
  for (let i = 0; i < points.length; i += 2) {
    const n = result.length;
    if (n >= 2 && result[n - 2] === points[i] && result[n - 1] === points[i + 1]) continue;
    result.push(points[i], points[i + 1]);
  }
  const n = result.length;
  if (n >= 4 && result[0] === result[n - 2] && result[1] === result[n - 1]) result.length = n - 2;
  return result;
}

/**
 * Keeps the part of a ring on one side of a grid line (Sutherland–Hodgman):
 * `axis` 0 cuts at u = `bound`, 1 at v = `bound`; `above` keeps the side
 * where the coordinate is larger. Crossing points are computed from the
 * edge's ends in a fixed order, so two provinces that share an edge get
 * exactly the same point.
 */
function clipAxis(points: Ring, axis: 0 | 1, bound: number, above: boolean): Ring {
  const count = points.length / 2;
  if (count < 3) return [];
  const other = 1 - axis;
  const result: Ring = [];
  let allInside = true;
  for (let i = 0; i < count; i++) {
    const value = points[i * 2 + axis];
    if (above ? value < bound : value > bound) {
      allInside = false;
      break;
    }
  }
  if (allInside) return points;
  const cross = (a: number, b: number) => {
    // From the end with the smaller (u, v), whichever way the ring runs.
    let from = a;
    let to = b;
    if (
      points[b * 2] < points[a * 2] ||
      (points[b * 2] === points[a * 2] && points[b * 2 + 1] < points[a * 2 + 1])
    ) {
      from = b;
      to = a;
    }
    const start = points[from * 2 + axis];
    const t = (bound - start) / (points[to * 2 + axis] - start);
    const along =
      points[from * 2 + other] + t * (points[to * 2 + other] - points[from * 2 + other]);
    if (axis === 0) result.push(bound, along);
    else result.push(along, bound);
  };
  for (let i = 0, previous = count - 1; i < count; previous = i++) {
    const value = points[i * 2 + axis];
    const before = points[previous * 2 + axis];
    const inside = above ? value >= bound : value <= bound;
    const wasInside = above ? before >= bound : before <= bound;
    if (inside) {
      if (!wasInside) cross(previous, i);
      result.push(points[i * 2], points[i * 2 + 1]);
    } else if (wasInside) cross(previous, i);
  }
  return clean(result);
}

/** Keeps the part of a ring on one side of cell (i, j)'s diagonal: `lower` = the south-east triangle. */
function clipDiagonal(points: Ring, i: number, j: number, lower: boolean): Ring {
  const count = points.length / 2;
  if (count < 3) return [];
  const side = (index: number) => points[index * 2 + 1] - j - (points[index * 2] - i);
  const result: Ring = [];
  const cross = (a: number, b: number) => {
    let from = a;
    let to = b;
    if (
      points[b * 2] < points[a * 2] ||
      (points[b * 2] === points[a * 2] && points[b * 2 + 1] < points[a * 2 + 1])
    ) {
      from = b;
      to = a;
    }
    const start = side(from);
    const t = start / (start - side(to));
    result.push(
      points[from * 2] + t * (points[to * 2] - points[from * 2]),
      points[from * 2 + 1] + t * (points[to * 2 + 1] - points[from * 2 + 1]),
    );
  };
  for (let k = 0, previous = count - 1; k < count; previous = k++) {
    const inside = lower ? side(k) <= 0 : side(k) >= 0;
    const wasInside = lower ? side(previous) <= 0 : side(previous) >= 0;
    if (inside) {
      if (!wasInside) cross(previous, k);
      result.push(points[k * 2], points[k * 2 + 1]);
    } else if (wasInside) cross(previous, k);
  }
  return clean(result);
}

function ringArea(points: Ring): number {
  let sum = 0;
  const count = points.length / 2;
  for (let i = 0, previous = count - 1; i < count; previous = i++)
    sum += points[previous * 2] * points[i * 2 + 1] - points[i * 2] * points[previous * 2 + 1];
  return Math.abs(sum) / 2;
}

function extent(points: Ring, axis: 0 | 1): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = axis; i < points.length; i += 2) {
    if (points[i] < min) min = points[i];
    if (points[i] > max) max = points[i];
  }
  return [min, max];
}

/** A cell counts as wholly inside a polygon when less than this share of it is missing. */
const FULL_CELL = 1e-7;
/** Pieces smaller than this share of a cell are dropped. */
const EMPTY_CELL = 1e-9;

/**
 * The part of the polygons that lies in a tile, as triangles on the tile's
 * surface. Polygons that don't touch the tile are skipped.
 */
export function buildTileFill(polygons: readonly MapPolygon[], surface: TileSurface): FillGeometry {
  const { minX, minZ, size, cells: n, cellSize } = surface;
  const positions: number[] = [];
  const vertexItems: number[] = [];
  const indices: number[] = [];
  const toUnits = 1 / METRES_PER_MAP_UNIT;
  const nodeVertex = new Map<number, number>();
  const addVertex = (u: number, v: number, metres: number, item: number): number => {
    positions.push(minX + u * cellSize, metres * toUnits, minZ + v * cellSize);
    vertexItems.push(item);
    return vertexItems.length - 1;
  };

  for (const polygon of polygons) {
    if (
      polygon.maxX <= minX ||
      polygon.minX >= minX + size ||
      polygon.maxZ <= minZ ||
      polygon.minZ >= minZ + size
    )
      continue;
    // The polygon's rings in the tile's mesh cells, cut to the tile.
    const rings: Ring[] = [];
    for (const [ringIndex, ring] of polygon.rings.entries()) {
      let points: Ring = new Array<number>(ring.length);
      for (let i = 0; i < ring.length; i += 2) {
        points[i] = (ring[i] - minX) / cellSize;
        points[i + 1] = (ring[i + 1] - minZ) / cellSize;
      }
      points = clipAxis(points, 0, 0, true);
      points = clipAxis(points, 0, n, false);
      points = clipAxis(points, 1, 0, true);
      points = clipAxis(points, 1, n, false);
      if (points.length >= 6) rings.push(points);
      else if (ringIndex === 0) break;
    }
    if (rings.length === 0) continue;
    nodeVertex.clear();
    const { item } = polygon;
    const vertexAtNode = (i: number, j: number): number => {
      const node = j * (n + 1) + i;
      let vertex = nodeVertex.get(node);
      if (vertex === undefined) {
        vertex = addVertex(i, j, surface.heights[node], item);
        nodeVertex.set(node, vertex);
      }
      return vertex;
    };

    const [vMin, vMax] = extent(rings[0], 1);
    for (let j = Math.max(0, Math.floor(vMin)); j < Math.min(n, Math.ceil(vMax)); j++) {
      const outer = clipAxis(clipAxis(rings[0], 1, j, true), 1, j + 1, false);
      if (outer.length < 6) continue;
      const holes: Ring[] = [];
      for (let h = 1; h < rings.length; h++) {
        const hole = clipAxis(clipAxis(rings[h], 1, j, true), 1, j + 1, false);
        if (hole.length >= 6) holes.push(hole);
      }
      const [uMin, uMax] = extent(outer, 0);
      for (let i = Math.max(0, Math.floor(uMin)); i < Math.min(n, Math.ceil(uMax)); i++) {
        const cellOuter = clipAxis(clipAxis(outer, 0, i, true), 0, i + 1, false);
        if (cellOuter.length < 6) continue;
        const cellHoles: Ring[] = [];
        let area = ringArea(cellOuter);
        for (const hole of holes) {
          const cellHole = clipAxis(clipAxis(hole, 0, i, true), 0, i + 1, false);
          if (cellHole.length < 6) continue;
          const holeArea = ringArea(cellHole);
          if (holeArea < EMPTY_CELL) continue;
          cellHoles.push(cellHole);
          area -= holeArea;
        }
        if (area < EMPTY_CELL) continue;
        if (cellHoles.length === 0 && area > 1 - FULL_CELL) {
          // Wholly inside: the cell's two triangles, sharing corners with its neighbors.
          const a = vertexAtNode(i, j);
          const b = vertexAtNode(i + 1, j);
          const c = vertexAtNode(i + 1, j + 1);
          const d = vertexAtNode(i, j + 1);
          indices.push(a, b, c, a, c, d);
          continue;
        }
        // The outline runs through this cell: cut each of its two triangles exactly.
        for (const lower of [true, false]) {
          const piece = clipDiagonal(cellOuter, i, j, lower);
          if (piece.length < 6 || ringArea(piece) < EMPTY_CELL) continue;
          const flat = piece.slice();
          const holeStarts: number[] = [];
          for (const hole of cellHoles) {
            const cut = clipDiagonal(hole, i, j, lower);
            if (cut.length < 6 || ringArea(cut) < EMPTY_CELL) continue;
            holeStarts.push(flat.length / 2);
            for (const value of cut) flat.push(value);
          }
          const first = vertexItems.length;
          for (let k = 0; k < flat.length; k += 2)
            addVertex(
              flat[k],
              flat[k + 1],
              cellHeight(surface, i, j, lower, flat[k] - i, flat[k + 1] - j),
              item,
            );
          for (const index of earcut(flat, holeStarts, 2)) indices.push(first + index);
        }
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    vertexItems: new Uint32Array(vertexItems),
    indices: new Uint32Array(indices),
  };
}

/** Line vertex data (see `LineGeometry`) for lines that follow the land. */
export interface DrapedLineGeometry extends LineGeometry {
  /** The heights of the previous and the next point, per vertex (map units at real scale). */
  readonly neighborHeights: Float32Array;
}

/** Collects line vertices: every point becomes two, pushed apart on screen by the line shader. */
class LineWriter {
  private readonly positions: number[] = [];
  private readonly neighbors: number[] = [];
  private readonly neighborHeights: number[] = [];
  private readonly sideAndKind: number[] = [];
  private readonly indices: number[] = [];
  private readonly borders: number[] = [];

  /**
   * One stretch of line. `points`: x, y, z per point (y at real scale);
   * `before` and `after`: the points the line continues to at its ends (x, y, z).
   */
  add(
    points: readonly number[],
    before: readonly [number, number, number],
    after: readonly [number, number, number],
    kind: number,
    sides: readonly [number, number] | null,
  ): void {
    const count = points.length / 3;
    if (count < 2) return;
    const firstVertex = this.sideAndKind.length / 2;
    if (sides) this.borders.push(firstVertex, count * 2, sides[0], sides[1]);
    for (let i = 0; i < count; i++) {
      const p = i * 3;
      const px = i > 0 ? points[p - 3] : before[0];
      const py = i > 0 ? points[p - 2] : before[1];
      const pz = i > 0 ? points[p - 1] : before[2];
      const nx = i < count - 1 ? points[p + 3] : after[0];
      const ny = i < count - 1 ? points[p + 4] : after[1];
      const nz = i < count - 1 ? points[p + 5] : after[2];
      for (const side of [-1, 1]) {
        this.positions.push(points[p], points[p + 1], points[p + 2]);
        this.neighbors.push(px, pz, nx, nz);
        this.neighborHeights.push(py, ny);
        this.sideAndKind.push(side, kind);
      }
      if (i < count - 1) {
        const a = firstVertex + i * 2;
        this.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }

  finish(): DrapedLineGeometry {
    return {
      positions: new Float32Array(this.positions),
      neighbors: new Float32Array(this.neighbors),
      neighborHeights: new Float32Array(this.neighborHeights),
      sideAndKind: new Float32Array(this.sideAndKind),
      indices: new Uint32Array(this.indices),
      borders: Int32Array.from(this.borders),
    };
  }
}

const CROSSING_TOLERANCE = 1e-9;

/**
 * The parts of the lines that lie in a tile, on the tile's surface. Every
 * segment is cut where it crosses the mesh's grid lines and diagonals, so it
 * runs exactly along the land's triangles. A piece belongs to the tile that
 * holds its middle, so neighboring tiles never draw a piece twice.
 */
export function buildTileLines(
  lines: readonly StyledLine[],
  surface: TileSurface,
): DrapedLineGeometry {
  const { minX, minZ, cells: n, cellSize } = surface;
  const toUnits = 1 / METRES_PER_MAP_UNIT;
  const writer = new LineWriter();
  const pointAt = (u: number, v: number): [number, number, number] => [
    minX + u * cellSize,
    surfaceHeightLocal(surface, u, v) * toUnits,
    minZ + v * cellSize,
  ];
  const cuts: number[] = [];

  for (const line of lines) {
    const { points, sides } = line;
    const last = points.length / 2 - 1;
    if (last < 1) continue;
    const loop = last > 2 && points[0] === points[last * 2] && points[1] === points[last * 2 + 1];
    const u = (index: number) => (points[index * 2] - minX) / cellSize;
    const v = (index: number) => (points[index * 2 + 1] - minZ) / cellSize;

    // The stretch being collected: its points (x, y, z), where it came from, and its sides.
    let run: number[] = [];
    let runBefore: [number, number, number] = [0, 0, 0];
    let runSides: [number, number] | null = null;
    const endRun = (after: [number, number, number] | null) => {
      if (run.length >= 6) {
        const end = run.length - 3;
        writer.add(
          run,
          runBefore,
          after ?? [run[end], run[end + 1], run[end + 2]],
          line.kind,
          runSides,
        );
      }
      run = [];
    };

    for (let k = 0; k < last; k++) {
      const u0 = u(k);
      const v0 = v(k);
      const u1 = u(k + 1);
      const v1 = v(k + 1);
      if (
        Math.max(u0, u1) < 0 ||
        Math.min(u0, u1) > n ||
        Math.max(v0, v1) < 0 ||
        Math.min(v0, v1) > n
      ) {
        endRun(null);
        continue;
      }
      // Where the segment crosses grid lines (u or v whole) and diagonals (v − u whole), inside the tile.
      cuts.length = 0;
      const addCuts = (from: number, to: number, low: number, high: number) => {
        if (from === to) return;
        const first = Math.max(low, Math.floor(Math.min(from, to)) + 1);
        const lastLine = Math.min(high, Math.ceil(Math.max(from, to)) - 1);
        for (let m = first; m <= lastLine; m++) cuts.push((m - from) / (to - from));
      };
      addCuts(u0, u1, 0, n);
      addCuts(v0, v1, 0, n);
      addCuts(v0 - u0, v1 - u1, -n, n);
      cuts.sort((a, b) => a - b);
      const segmentSides: [number, number] | null = sides ? [sides[k * 2], sides[k * 2 + 1]] : null;
      let from = 0;
      for (let c = 0; c <= cuts.length; c++) {
        const to = c < cuts.length ? cuts[c] : 1;
        if (to - from <= CROSSING_TOLERANCE && c < cuts.length) continue;
        const middle = (from + to) / 2;
        const mu = u0 + (u1 - u0) * middle;
        const mv = v0 + (v1 - v0) * middle;
        const owned = mu >= 0 && mu < n && mv >= 0 && mv < n;
        const end = pointAt(u0 + (u1 - u0) * to, v0 + (v1 - v0) * to);
        if (!owned) {
          endRun(end);
        } else {
          const sameSides =
            (runSides === null && segmentSides === null) ||
            (runSides !== null &&
              segmentSides !== null &&
              runSides[0] === segmentSides[0] &&
              runSides[1] === segmentSides[1]);
          if (run.length > 0 && !sameSides) endRun(end);
          if (run.length === 0) {
            const start = pointAt(u0 + (u1 - u0) * from, v0 + (v1 - v0) * from);
            // The point the line comes from: on this segment, the point before it, or (a loop) its far end.
            if (from > 0) runBefore = pointAt(u0, v0);
            else if (k > 0) runBefore = pointAt(u(k - 1), v(k - 1));
            else if (loop) runBefore = pointAt(u(last - 1), v(last - 1));
            else runBefore = start;
            runSides = segmentSides;
            run.push(start[0], start[1], start[2]);
          }
          run.push(end[0], end[1], end[2]);
        }
        from = to;
      }
    }
    endRun(loop ? pointAt(u(1), v(1)) : null);
  }
  return writer.finish();
}

/**
 * Lines laid on the land wherever it is known (`heightAt`, in metres), cut
 * into pieces no longer than `step`. Used for the few lines that don't
 * belong to a tile, such as the outline of the selected province.
 */
export function drapeLines(
  lines: readonly StyledLine[],
  heightAt: (x: number, z: number) => number,
  step: number,
): DrapedLineGeometry {
  const toUnits = 1 / METRES_PER_MAP_UNIT;
  const writer = new LineWriter();
  for (const line of lines) {
    const { points } = line;
    const last = points.length / 2 - 1;
    if (last < 1) continue;
    const run: number[] = [];
    const push = (x: number, z: number) => run.push(x, heightAt(x, z) * toUnits, z);
    push(points[0], points[1]);
    for (let k = 0; k < last; k++) {
      const x0 = points[k * 2];
      const z0 = points[k * 2 + 1];
      const x1 = points[k * 2 + 2];
      const z1 = points[k * 2 + 3];
      const pieces = Math.max(1, Math.min(512, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step)));
      for (let p = 1; p <= pieces; p++)
        push(x0 + ((x1 - x0) * p) / pieces, z0 + ((z1 - z0) * p) / pieces);
    }
    const loop = last > 2 && points[0] === points[last * 2] && points[1] === points[last * 2 + 1];
    const end = run.length - 3;
    writer.add(
      run,
      loop ? [run[end - 3], run[end - 2], run[end - 1]] : [run[0], run[1], run[2]],
      loop ? [run[3], run[4], run[5]] : [run[end], run[end + 1], run[end + 2]],
      line.kind,
      null,
    );
  }
  return writer.finish();
}
