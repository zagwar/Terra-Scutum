import type { MultiPolygon, Polygon, Position } from 'geojson';
import { geoArea } from 'd3-geo';

/**
 * Planar geometry helpers for the map import. Coordinates are [longitude,
 * latitude] in degrees, treated as a flat map (the game's map is flat).
 * Areas in km² use the true spherical area.
 */

export type Ring = Position[];
/** A list of polygons; each polygon is an outer ring followed by its holes. */
export type Polygons = Ring[][];

export const EARTH_RADIUS_KM = 6371.0088;

export function toPolygons(geometry: Polygon | MultiPolygon): Polygons {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

export function toMultiPolygon(polygons: Polygons): MultiPolygon {
  return { type: 'MultiPolygon', coordinates: polygons };
}

/**
 * True spherical area in km². Works whichever way the rings wind (the spherical
 * formula would otherwise read a reversed ring as "the whole Earth except this").
 */
export function areaKm2(polygons: Polygons): number {
  let steradians = 0;
  for (const polygon of polygons) {
    const a = geoArea({ type: 'Polygon', coordinates: polygon });
    steradians += Math.min(a, 4 * Math.PI - a);
  }
  return steradians * EARTH_RADIUS_KM * EARTH_RADIUS_KM;
}

/** The same polygons with outer rings counter-clockwise and holes clockwise (GeoJSON's rule). */
export function normalizeWinding(polygons: Polygons): Polygons {
  return polygons.map((polygon) =>
    polygon.map((ring, index) => {
      const ccw = ringSignedArea(ring) > 0;
      return (index === 0) === ccw ? ring : [...ring].reverse();
    }),
  );
}

/** Signed planar area of a ring (positive = counter-clockwise). */
export function ringSignedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/** Planar area of one polygon (outer ring minus holes), in square degrees. */
export function polygonPlanarArea(polygon: Ring[]): number {
  let area = 0;
  polygon.forEach((ring, index) => {
    const a = Math.abs(ringSignedArea(ring));
    area += index === 0 ? a : -a;
  });
  return area;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bboxOf(polygons: Polygons): BBox {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0] ?? []) {
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
    }
  }
  return box;
}

function ringContains(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Planar point-in-polygon test (holes respected). */
export function polygonsContain(polygons: Polygons, x: number, y: number): boolean {
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer || !ringContains(outer, x, y)) continue;
    let inHole = false;
    for (let h = 1; h < polygon.length; h++) {
      if (ringContains(polygon[h], x, y)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/** Planar centroid of the largest polygon. */
export function largestPolygonCentroid(polygons: Polygons): [number, number] {
  let best: Ring[] | undefined;
  let bestArea = -1;
  for (const polygon of polygons) {
    const area = polygonPlanarArea(polygon);
    if (area > bestArea) {
      bestArea = area;
      best = polygon;
    }
  }
  const ring = best?.[0] ?? [];
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j] as [number, number];
    const [x1, y1] = ring[i] as [number, number];
    const f = x0 * y1 - x1 * y0;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-12) {
    const [x, y] = (ring[0] ?? [0, 0]) as [number, number];
    return [x, y];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/**
 * A point inside the polygons, near their visual middle: the centroid of the
 * largest polygon if it lies inside, otherwise the interior grid point closest
 * to it. Used for labels and distance calculations.
 */
export function labelPoint(polygons: Polygons): [number, number] {
  const centroid = largestPolygonCentroid(polygons);
  if (polygonsContain(polygons, centroid[0], centroid[1])) return centroid;
  const box = bboxOf(polygons);
  let best: [number, number] | null = null;
  let bestDistance = Infinity;
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = box.minX + ((box.maxX - box.minX) * (i + 0.5)) / (steps + 1);
      const y = box.minY + ((box.maxY - box.minY) * (j + 0.5)) / (steps + 1);
      if (!polygonsContain(polygons, x, y)) continue;
      const d = (x - centroid[0]) ** 2 + (y - centroid[1]) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = [x, y];
      }
    }
  }
  if (best) return best;
  const first = polygons[0]?.[0]?.[0] ?? [0, 0];
  return [first[0], first[1]];
}

/** Squared distance from a point to a segment. */
function segmentDistanceSquared(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  let x = ax;
  let y = ay;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = bx;
      y = by;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  return (px - x) ** 2 + (py - y) ** 2;
}

/** Distance from a point to a polygon's outline: positive inside, negative outside (or in a hole). */
function signedDistanceToOutline(polygon: Ring[], x: number, y: number): number {
  let inside = false;
  let best = Infinity;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      best = Math.min(best, segmentDistanceSquared(x, y, xi, yi, xj, yj));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(best);
}

/**
 * The best place for a name: the point of the largest polygon that is farthest
 * from its outline (its "pole of inaccessibility"), so a label there sits well
 * inside the shape even when the shape is a crescent or has a hole. Found by
 * splitting the shape's box into ever smaller cells, keeping only cells that
 * could still hold a better point. `precision` is in degrees.
 */
export function innerLabelPoint(polygons: Polygons, precision = 0.01): [number, number] {
  let largest: Ring[] | undefined;
  let largestArea = -1;
  for (const polygon of polygons) {
    const area = polygonPlanarArea(polygon);
    if (area > largestArea) {
      largestArea = area;
      largest = polygon;
    }
  }
  if (!largest || largestArea <= 0) return labelPoint(polygons);
  const box = bboxOf([largest]);
  // Measure east–west distances as on the ground at the shape's latitude.
  const shrink = Math.max(0.05, Math.cos((((box.minY + box.maxY) / 2) * Math.PI) / 180));
  const polygon = largest.map((ring) => ring.map(([x, y]) => [x * shrink, y]));
  const minX = box.minX * shrink;
  const maxX = box.maxX * shrink;
  const size = Math.min(maxX - minX, box.maxY - box.minY);
  if (size <= 0) return labelPoint(polygons);

  interface Cell {
    x: number;
    y: number;
    half: number;
    distance: number;
    /** The best distance any point of the cell could have. */
    potential: number;
  }
  const cell = (x: number, y: number, half: number): Cell => {
    const distance = signedDistanceToOutline(polygon, x, y);
    return { x, y, half, distance, potential: distance + half * Math.SQRT2 };
  };
  const queue: Cell[] = [];
  const half = size / 2;
  for (let x = minX; x < maxX; x += size)
    for (let y = box.minY; y < box.maxY; y += size) queue.push(cell(x + half, y + half, half));
  const [cx, cy] = largestPolygonCentroid([largest]);
  let best = cell(cx * shrink, cy, 0);
  const tolerance = Math.min(precision, size / 20);
  while (queue.length > 0) {
    // Most promising cell first (ties: lowest x, then y, so the result is always the same).
    let top = 0;
    for (let i = 1; i < queue.length; i++) {
      const a = queue[i];
      const b = queue[top];
      if (
        a.potential > b.potential ||
        (a.potential === b.potential && (a.x < b.x || (a.x === b.x && a.y < b.y)))
      )
        top = i;
    }
    const current = queue[top];
    queue[top] = queue[queue.length - 1];
    queue.pop();
    if (current.distance > best.distance) best = current;
    if (current.potential - best.distance <= tolerance) continue;
    const h = current.half / 2;
    queue.push(
      cell(current.x - h, current.y - h, h),
      cell(current.x + h, current.y - h, h),
      cell(current.x - h, current.y + h, h),
      cell(current.x + h, current.y + h, h),
    );
  }
  if (best.distance <= 0) return labelPoint(polygons);
  return [best.x / shrink, best.y];
}

/** Great-circle distance in km. */
export function distanceKm(a: readonly [number, number], b: readonly [number, number]): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rounds coordinates for output (about 11 m at 4 decimals). */
export function roundCoordinate(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
