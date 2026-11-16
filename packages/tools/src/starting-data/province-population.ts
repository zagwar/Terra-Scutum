import { z } from 'zod';
import type { Polygons } from '../map-import/geometry';
import { type Grid, createGrid, fillPolygons, pixelAt } from '../map-import/raster';

/**
 * Where the people of each country live (F06): the pure parts of
 * `npm run import:province-population`, which counts the people of a gridded
 * world population dataset inside every province. The result is saved as
 * `packages/tools/starting-data/sources/province-population.json`; the
 * starting-data import then shares each country's population (World Bank)
 * among its provinces in those proportions.
 */

/** `sources/province-population.json`: the people counted in every province. */
export const provincePopulationSnapshotSchema = z.strictObject({
  title: z.string(),
  url: z.string(),
  licence: z.string(),
  /** The dataset's edition (its file name) and when it was downloaded. */
  edition: z.string(),
  downloaded: z.string(),
  /** People of the dataset that fell in no province (open sea, places the game leaves out). */
  unassigned: z.number().nonnegative(),
  /** People counted in each province, by province id. */
  provinces: z.record(z.string(), z.number().nonnegative()),
});
export type ProvincePopulationSnapshot = z.infer<typeof provincePopulationSnapshotSchema>;

const WEB_MERCATOR_RADIUS = 6378137;
const WEB_MERCATOR_WORLD = 2 * Math.PI * WEB_MERCATOR_RADIUS;

/** Web Mercator metres (EPSG:3857) to longitude and latitude in degrees. */
export function webMercatorToLonLat(x: number, y: number): [number, number] {
  const lon = (x / WEB_MERCATOR_RADIUS) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / WEB_MERCATOR_RADIUS)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
}

/**
 * The middle of a GeoPackage polygon (a hexagon of the population grid), in
 * the geometry's own coordinates. A GeoPackage geometry is a small header
 * ("GP", version, flags, coordinate system, optional envelope) followed by
 * well-known binary. A hexagon across the date line has corners on both
 * edges of the world: they are brought next to the first corner before averaging.
 */
export function geoPackagePolygonCenter(blob: Uint8Array, worldWidth: number): [number, number] {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  if (blob[0] !== 0x47 || blob[1] !== 0x50) throw new Error('not a GeoPackage geometry');
  const flags = blob[3];
  const envelopeBytes = [0, 32, 48, 48, 64][(flags >> 1) & 7];
  if (envelopeBytes === undefined) throw new Error('unknown GeoPackage envelope type');
  let at = 8 + envelopeBytes;
  const little = blob[at] === 1;
  const type = view.getUint32(at + 1, little) % 1000;
  at += 5;
  if (type === 6) {
    // A multi-polygon: use its first polygon.
    at += 4;
    at += 5;
  } else if (type !== 3) throw new Error(`expected a polygon, found geometry type ${type}`);
  at += 4; // the number of rings; the first ring is the outline
  const points = view.getUint32(at, little);
  at += 4;
  // The last point repeats the first.
  const count = Math.max(1, points - 1);
  const firstX = view.getFloat64(at, little);
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < count; i++) {
    let x = view.getFloat64(at + i * 16, little);
    if (x - firstX > worldWidth / 2) x -= worldWidth;
    else if (firstX - x > worldWidth / 2) x += worldWidth;
    sumX += x;
    sumY += view.getFloat64(at + i * 16 + 8, little);
  }
  let x = sumX / count;
  if (x > worldWidth / 2) x -= worldWidth;
  else if (x < -worldWidth / 2) x += worldWidth;
  return [x, sumY / count];
}

/** The middle of a population hexagon stored in Web Mercator, as longitude and latitude. */
export function hexagonLonLat(blob: Uint8Array): [number, number] {
  const [x, y] = geoPackagePolygonCenter(blob, WEB_MERCATOR_WORLD);
  return webMercatorToLonLat(x, y);
}

/** Answers "which province is here?" quickly for millions of points. */
export interface ProvinceGrid {
  readonly grid: Grid;
  /** The province (index into the list given to `createProvinceGrid`) at a place, or -1. */
  provinceAt(lon: number, lat: number): number;
}

/**
 * Draws every province into a world grid. A point just off the coast (the
 * population grid and the map's coastlines never agree exactly) belongs to
 * the nearest province within `reachPixels` pixels.
 */
export function createProvinceGrid(
  shapes: readonly Polygons[],
  degreesPerPixel: number,
  reachPixels: number,
): ProvinceGrid {
  const grid = createGrid(degreesPerPixel);
  shapes.forEach((polygons, index) => fillPolygons(grid, polygons, index + 1));
  const { width, height, labels } = grid;
  return {
    grid,
    provinceAt(lon, lat) {
      const pixel = pixelAt(grid, lon, lat);
      if (labels[pixel] !== 0) return labels[pixel] - 1;
      const x0 = pixel % width;
      const y0 = (pixel / width) | 0;
      let best = -1;
      let bestDistance = Infinity;
      for (let dy = -reachPixels; dy <= reachPixels; dy++) {
        const y = y0 + dy;
        if (y < 0 || y >= height) continue;
        for (let dx = -reachPixels; dx <= reachPixels; dx++) {
          const distance = dx * dx + dy * dy;
          if (distance >= bestDistance || distance > reachPixels * reachPixels) continue;
          const x = (((x0 + dx) % width) + width) % width;
          const label = labels[y * width + x];
          if (label !== 0) {
            best = label - 1;
            bestDistance = distance;
          }
        }
      }
      return best;
    },
  };
}

/**
 * Shares `total` people among parts in proportion to `weights`, as whole
 * numbers that add up to exactly `total` (largest remainders get the last
 * people). With no weight at all, everything goes to the part with the
 * biggest `fallback` (a country whose provinces the dataset has no people for).
 */
export function shareWholeNumbers(
  total: number,
  weights: readonly number[],
  fallback: readonly number[],
): number[] {
  let sum = weights.reduce((a, b) => a + b, 0);
  let used = weights;
  if (sum <= 0) {
    used = fallback;
    sum = fallback.reduce((a, b) => a + b, 0);
  }
  if (sum <= 0) {
    used = weights.map(() => 1);
    sum = used.length;
  }
  const exact = used.map((weight) => (total * weight) / sum);
  const shares = exact.map(Math.floor);
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; left > 0; i = (i + 1) % order.length, left--) shares[order[i].index] += 1;
  return shares;
}
