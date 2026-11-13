import polygonClipping from 'polygon-clipping';
import type { TinyProvincesConfig } from './config';
import { type Polygons, type Ring, bboxOf, roundCoordinate } from './geometry';
import type { ProvinceDraft } from './provinces';

/**
 * Provinces smaller than the map data's precision (Vatican City, Gibraltar…)
 * come out of the import with a shape that has no area, so they can't be seen
 * or clicked. `tiny-provinces.json` says what to do with each one:
 *
 * - `enlarge`: draw it as a small disc at its real place, big enough to click
 *   (as Paradox games do with microstates). The disc is cut out of whatever
 *   province lies under it, so borders stay shared. Its `areaKm2` in the data
 *   stays the real area.
 * - `leaveOut`: the province is not part of the game.
 */

const KM_PER_DEGREE = 111.195;

/** A disc on the ground (a regular polygon, counter-clockwise, closed) around [longitude, latitude]. */
export function discRing(
  center: readonly [number, number],
  radiusKm: number,
  points: number,
): Ring {
  const [lon, lat] = center;
  const dLat = radiusKm / KM_PER_DEGREE;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const ring: Ring = [];
  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    // Rounded (to about 0.1 m) so that cutting the disc out of other shapes reproduces its corners exactly.
    ring.push([
      roundCoordinate(lon + dLon * Math.cos(angle), 6),
      roundCoordinate(lat + dLat * Math.sin(angle), 6),
    ]);
  }
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/** `polygons` with the disc cut out of them. */
export function cutOut(polygons: Polygons, disc: Ring): Polygons {
  const pairs = (ring: Ring) => ring.map(([x, y]): [number, number] => [x, y]);
  return polygonClipping.difference(
    polygons.map((polygon) => polygon.map(pairs)),
    [[pairs(disc)]],
  );
}

/**
 * Adds to the disc every corner of `others` that lies on one of its sides
 * (the points where another province's border meets the disc), so both shapes
 * run through exactly the same points and their border is recognized as shared.
 */
export function addTouchingPoints(disc: Ring, others: readonly Polygons[]): Ring {
  const epsilon = 1e-9;
  const candidates: [number, number][] = [];
  const box = bboxOf([[disc]]);
  for (const polygons of others) {
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const [x, y] of ring) {
          if (
            x >= box.minX - epsilon &&
            x <= box.maxX + epsilon &&
            y >= box.minY - epsilon &&
            y <= box.maxY + epsilon
          )
            candidates.push([x, y]);
        }
      }
    }
  }
  const out: Ring = [];
  for (let i = 0; i < disc.length - 1; i++) {
    const [ax, ay] = disc[i] as [number, number];
    const [bx, by] = disc[i + 1] as [number, number];
    out.push([ax, ay]);
    const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2;
    const onSide: { t: number; point: [number, number] }[] = [];
    for (const [x, y] of candidates) {
      const t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / lengthSquared;
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      const distanceSquared = (ax + t * (bx - ax) - x) ** 2 + (ay + t * (by - ay) - y) ** 2;
      if (distanceSquared > epsilon * epsilon) continue;
      if (!onSide.some((o) => Math.abs(o.t - t) < 1e-6)) onSide.push({ t, point: [x, y] });
    }
    onSide.sort((p, q) => p.t - q.t);
    for (const o of onSide) out.push(o.point);
  }
  out.push([out[0][0], out[0][1]]);
  return out;
}

function boxesOverlap(a: ReturnType<typeof bboxOf>, b: ReturnType<typeof bboxOf>): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export interface TinyProvinceReport {
  /** Ids of the provinces drawn as a disc. */
  readonly enlarged: string[];
  /** Names of the provinces left out of the game. */
  readonly leftOut: string[];
}

/** Applies `tiny-provinces.json` to the provinces. Problems go to `warn`. */
export function applyTinyProvinces(
  provinces: readonly ProvinceDraft[],
  config: TinyProvincesConfig,
  warn: (line: string) => void,
): { provinces: ProvinceDraft[]; report: TinyProvinceReport } {
  const leaveOut = new Set(config.leaveOut);
  for (const id of leaveOut)
    if (!provinces.some((p) => p.id === id))
      warn(`tiny-provinces.json leaves out "${id}", but no province has that id`);
  const result = provinces.filter((p) => !leaveOut.has(p.id));
  const report: TinyProvinceReport = {
    enlarged: [],
    leftOut: provinces.filter((p) => leaveOut.has(p.id)).map((p) => p.name),
  };

  for (const entry of config.enlarge) {
    const index = result.findIndex((p) => p.id === entry.id);
    if (index < 0) {
      warn(`tiny-provinces.json enlarges "${entry.id}", but no province has that id`);
      continue;
    }
    let disc = discRing(entry.center, config.radiusKm, config.discPoints);
    const discBox = bboxOf([[disc]]);
    const cut: Polygons[] = [];
    result.forEach((other, i) => {
      if (i === index || !boxesOverlap(bboxOf(other.polygons), discBox)) return;
      const polygons = cutOut(other.polygons, disc);
      result[i] = { ...other, polygons };
      cut.push(polygons);
    });
    disc = addTouchingPoints(disc, cut);
    result[index] = {
      ...result[index],
      polygons: [[disc]],
      center: [entry.center[0], entry.center[1]],
      areaKm2: entry.areaKm2,
    };
    report.enlarged.push(entry.id);
  }
  return { provinces: result, report };
}
