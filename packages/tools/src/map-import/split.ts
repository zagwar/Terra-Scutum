import polygonClipping, {
  type MultiPolygon as ClipMultiPolygon,
  type Pair,
} from 'polygon-clipping';
import { type Polygons, bboxOf, polygonPlanarArea, polygonsContain } from './geometry';

/**
 * Splits a province in two with one straight cut, so that each half carries
 * about half of its "weight" (area plus people). The cut runs across the
 * province's long axis, which keeps the halves compact.
 */
export interface WeightedPoint {
  readonly lon: number;
  readonly lat: number;
  readonly weight: number;
}

export interface SplitInput {
  readonly polygons: Polygons;
  /** Weight spread evenly over the province's area. */
  readonly areaWeight: number;
  /** Weights at points (cities). */
  readonly points: readonly WeightedPoint[];
}

const TARGET_SAMPLES = 900;

/** Evenly spaced points inside the polygons (in [lon, lat]). */
export function samplePoints(polygons: Polygons, target = TARGET_SAMPLES): [number, number][] {
  const box = bboxOf(polygons);
  const k = Math.cos((((box.minY + box.maxY) / 2) * Math.PI) / 180);
  const planar = polygons.reduce((sum, polygon) => sum + polygonPlanarArea(polygon), 0) * k;
  let step = Math.sqrt(Math.max(planar, 1e-9) / target);
  for (let attempt = 0; attempt < 6; attempt++) {
    const out: [number, number][] = [];
    const lonStep = step / k;
    for (let lat = box.minY + step / 2; lat < box.maxY; lat += step) {
      for (let lon = box.minX + lonStep / 2; lon < box.maxX; lon += lonStep) {
        if (polygonsContain(polygons, lon, lat)) out.push([lon, lat]);
      }
    }
    if (out.length >= target / 4) return out;
    step /= 2;
  }
  const first = polygons[0]?.[0]?.[0];
  return first ? [[first[0], first[1]]] : [];
}

function toClip(polygons: Polygons): ClipMultiPolygon {
  return polygons.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [x, y] as Pair)));
}

/** Returns the two halves, or null if the shape can't be split sensibly. */
export function splitInTwo(input: SplitInput): [Polygons, Polygons] | null {
  const samples = samplePoints(input.polygons);
  if (samples.length < 2) return null;
  const box = bboxOf(input.polygons);
  const lat0 = (box.minY + box.maxY) / 2;
  const k = Math.max(0.05, Math.cos((lat0 * Math.PI) / 180));
  const each = input.areaWeight / samples.length;
  const points = [
    ...samples.map(([lon, lat]) => ({ x: lon * k, y: lat, w: each })),
    ...input.points.map((p) => ({ x: p.lon * k, y: p.lat, w: p.weight })),
  ].filter((p) => p.w > 0);
  const total = points.reduce((sum, p) => sum + p.w, 0);
  if (total <= 0) return null;

  // Principal axis of the weighted points.
  const mx = points.reduce((s, p) => s + p.x * p.w, 0) / total;
  const my = points.reduce((s, p) => s + p.y * p.w, 0) / total;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += p.w * (p.x - mx) ** 2;
    syy += p.w * (p.y - my) ** 2;
    sxy += p.w * (p.x - mx) * (p.y - my);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);

  // Cut at the weighted median along the axis.
  const projected = points
    .map((p) => ({ t: (p.x - mx) * ux + (p.y - my) * uy, w: p.w }))
    .sort((a, b) => a.t - b.t);
  let cumulative = 0;
  let cut = 0;
  for (let i = 0; i < projected.length; i++) {
    cumulative += projected[i].w;
    if (cumulative >= total / 2) {
      const next = projected[i + 1];
      cut = next ? (projected[i].t + next.t) / 2 : projected[i].t;
      break;
    }
  }

  // Two large half-plane quads on either side of the cut line, converted back to lon/lat.
  const big = 2000;
  const cx = mx + ux * cut;
  const cy = my + uy * cut;
  const vx = -uy;
  const vy = ux;
  const toLonLat = (x: number, y: number): Pair => [x / k, y];
  const quad = (sign: number): Pair[] => {
    const ring = [
      toLonLat(cx + vx * big, cy + vy * big),
      toLonLat(cx + vx * big + sign * ux * big, cy + vy * big + sign * uy * big),
      toLonLat(cx - vx * big + sign * ux * big, cy - vy * big + sign * uy * big),
      toLonLat(cx - vx * big, cy - vy * big),
    ];
    ring.push(ring[0]);
    return ring;
  };
  const subject = toClip(input.polygons);
  const a = polygonClipping.intersection(subject, [quad(-1)]);
  const b = polygonClipping.intersection(subject, [quad(1)]);
  if (a.length === 0 || b.length === 0) return null;
  return [a, b];
}
