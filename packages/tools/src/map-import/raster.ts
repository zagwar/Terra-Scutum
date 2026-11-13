import type { Polygons } from './geometry';

/**
 * A world grid in equirectangular projection (longitude → x, latitude → y,
 * top row = 90°N). The map import draws provinces into it to find coastlines,
 * grow sea zones through the water, and find which areas touch.
 */
export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly degreesPerPixel: number;
  /** One label per pixel (0 = nothing). */
  readonly labels: Uint16Array;
}

export function createGrid(degreesPerPixel: number): Grid {
  const width = Math.round(360 / degreesPerPixel);
  const height = Math.round(180 / degreesPerPixel);
  return { width, height, degreesPerPixel, labels: new Uint16Array(width * height) };
}

export function lonToX(grid: Grid, lon: number): number {
  return (lon + 180) / grid.degreesPerPixel;
}

export function latToY(grid: Grid, lat: number): number {
  return (90 - lat) / grid.degreesPerPixel;
}

/** The pixel index containing a point. */
export function pixelAt(grid: Grid, lon: number, lat: number): number {
  const x = Math.min(grid.width - 1, Math.max(0, Math.floor(lonToX(grid, lon))));
  const y = Math.min(grid.height - 1, Math.max(0, Math.floor(latToY(grid, lat))));
  return y * grid.width + x;
}

/**
 * Fills the pixels whose centers lie inside the polygons (even-odd rule, so
 * holes stay empty) with `label`. Returns how many pixels were filled.
 */
export function fillPolygons(grid: Grid, polygons: Polygons, label: number): number {
  const { width, height, labels } = grid;
  const rows = new Map<number, number[]>();
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const x0 = lonToX(grid, ring[j][0]);
        const y0 = latToY(grid, ring[j][1]);
        const x1 = lonToX(grid, ring[i][0]);
        const y1 = latToY(grid, ring[i][1]);
        if (y0 === y1) continue;
        const top = Math.min(y0, y1);
        const bottom = Math.max(y0, y1);
        const first = Math.max(0, Math.ceil(top - 0.5));
        const last = Math.min(height - 1, Math.ceil(bottom - 0.5) - 1);
        for (let row = first; row <= last; row++) {
          const yc = row + 0.5;
          const x = x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0);
          let list = rows.get(row);
          if (!list) rows.set(row, (list = []));
          list.push(x);
        }
      }
    }
  }
  let filled = 0;
  for (const [row, xs] of rows) {
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(width - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
      const base = row * width;
      for (let x = from; x <= to; x++) {
        labels[base + x] = label;
        filled += 1;
      }
    }
  }
  return filled;
}

/**
 * Grows labels from seed pixels into every pixel `canEnter` allows. Each pixel
 * gets the label of the seed it is closest to, measured along a path that
 * stays inside enterable pixels (so sea zones follow the water instead of
 * jumping over land). Distances use 8 directions and shrink east–west steps
 * toward the poles, like real distances on the globe. Wraps around east–west.
 */
export function growLabels(
  grid: Grid,
  labels: Uint16Array,
  canEnter: (pixel: number) => boolean,
): void {
  const { width, height, degreesPerPixel } = grid;
  const UNIT = 10;
  // Step costs per row: east–west, north–south, diagonal.
  const horizontal = new Int32Array(height);
  const diagonal = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    const lat = 90 - (y + 0.5) * degreesPerPixel;
    const h = Math.max(1, Math.round(UNIT * Math.cos((lat * Math.PI) / 180)));
    horizontal[y] = h;
    diagonal[y] = Math.round(Math.hypot(h, UNIT));
  }
  const maxCost = Math.round(Math.hypot(UNIT, UNIT)) + 1;
  const distance = new Int32Array(labels.length).fill(-1);
  // Dial's algorithm: a ring of buckets, one per distance value.
  const buckets: number[][] = Array.from({ length: maxCost + 1 }, () => []);
  let pending = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== 0) {
      distance[i] = 0;
      buckets[0].push(i);
      pending += 1;
    }
  }
  const settled = new Uint8Array(labels.length);
  for (let d = 0; pending > 0; d++) {
    const bucket = buckets[d % buckets.length];
    buckets[d % buckets.length] = [];
    for (const pixel of bucket) {
      pending -= 1;
      if (settled[pixel] || distance[pixel] !== d) continue;
      settled[pixel] = 1;
      const label = labels[pixel];
      const x = pixel % width;
      const y = (pixel - x) / width;
      const east = (x + 1) % width;
      const west = (x - 1 + width) % width;
      const visit = (nx: number, ny: number, cost: number, via1: number, via2: number) => {
        if (ny < 0 || ny >= height) return;
        const next = ny * width + nx;
        if (settled[next] || !canEnter(next)) return;
        // A diagonal step may not squeeze between two blocked pixels.
        if (via1 >= 0 && !canEnter(via1) && !canEnter(via2)) return;
        const nd = d + cost;
        const current = distance[next];
        if (current >= 0 && (current < nd || (current === nd && labels[next] <= label))) return;
        distance[next] = nd;
        labels[next] = label;
        buckets[nd % buckets.length].push(next);
        pending += 1;
      };
      const h = horizontal[y];
      visit(east, y, h, -1, -1);
      visit(west, y, h, -1, -1);
      visit(x, y - 1, UNIT, -1, -1);
      visit(x, y + 1, UNIT, -1, -1);
      if (y > 0) {
        const dg = diagonal[y - 1];
        visit(east, y - 1, dg, y * width + east, pixel - width);
        visit(west, y - 1, dg, y * width + west, pixel - width);
      }
      if (y < height - 1) {
        const dg = diagonal[y + 1];
        visit(east, y + 1, dg, y * width + east, pixel + width);
        visit(west, y + 1, dg, y * width + west, pixel + width);
      }
    }
  }
}

/**
 * Pairs of labels whose pixels touch (4 directions, wrapping east–west), with
 * how many pixel edges they share. `a` and `b` may come from different layers.
 */
export function touchingPairs(grid: Grid, a: Uint16Array, b: Uint16Array): Map<string, number> {
  const { width, height } = grid;
  const pairs = new Map<string, number>();
  const add = (la: number, lb: number) => {
    const key = `${la}|${lb}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const right = y * width + ((x + 1) % width);
      const down = y < height - 1 ? i + width : -1;
      for (const j of down < 0 ? [right] : [right, down]) {
        const la = a[i];
        const lb = b[j];
        if (la !== 0 && lb !== 0 && (a !== b || la !== lb)) add(la, lb);
        const la2 = a[j];
        const lb2 = b[i];
        if (a !== b && la2 !== 0 && lb2 !== 0) add(la2, lb2);
      }
    }
  }
  return pairs;
}

/**
 * Turns a fully labelled grid into polygons: one set per label, following the
 * pixel edges. Neighboring areas share exactly the same border points, so the
 * result can be simplified without gaps. Rings are counter-clockwise for
 * outer edges and clockwise for holes (in longitude/latitude).
 */
export function traceLabels(grid: Grid, labels: Uint16Array): Map<number, Polygons> {
  const { width, height, degreesPerPixel: res } = grid;
  const stride = width + 1;
  const label = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : labels[y * width + x];

  // Directed boundary edges with the area on their left (screen coordinates, y down).
  const from: number[] = [];
  const to: number[] = [];
  const owner: number[] = [];
  /** The label on the other side of each edge. */
  const across: number[] = [];
  const outgoing = new Map<number, number[]>();
  const addEdge = (x0: number, y0: number, x1: number, y1: number, l: number, other: number) => {
    const id = from.length;
    const start = y0 * stride + x0;
    from.push(start);
    to.push(y1 * stride + x1);
    owner.push(l);
    across.push(other);
    const list = outgoing.get(start);
    if (list) list.push(id);
    else outgoing.set(start, [id]);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = labels[y * width + x];
      if (l === 0) continue;
      const up = label(x, y - 1);
      const left = label(x - 1, y);
      const down = label(x, y + 1);
      const right = label(x + 1, y);
      if (up !== l) addEdge(x + 1, y, x, y, l, up);
      if (left !== l) addEdge(x, y, x, y + 1, l, left);
      if (down !== l) addEdge(x, y + 1, x + 1, y + 1, l, down);
      if (right !== l) addEdge(x + 1, y + 1, x + 1, y, l, right);
    }
  }

  const direction = (edge: number) => {
    const dx = (to[edge] % stride) - (from[edge] % stride);
    const dy = Math.floor(to[edge] / stride) - Math.floor(from[edge] / stride);
    return [dx, dy] as const;
  };
  const visited = new Uint8Array(from.length);
  const rings = new Map<number, [number, number][][]>();
  for (let startEdge = 0; startEdge < from.length; startEdge++) {
    if (visited[startEdge]) continue;
    const l = owner[startEdge];
    const points: [number, number][] = [];
    const edges: number[] = [];
    let edge = startEdge;
    for (;;) {
      visited[edge] = 1;
      points.push([from[edge] % stride, Math.floor(from[edge] / stride)]);
      edges.push(edge);
      const [dx, dy] = direction(edge);
      const options = (outgoing.get(to[edge]) ?? []).filter(
        (e) => owner[e] === l && (!visited[e] || e === startEdge),
      );
      if (options.length === 0) break;
      // Prefer turning left (hugs the area: diagonal touches stay separate), then straight, then right.
      const turn = (e: number) => {
        const [ex, ey] = direction(e);
        const cross = dx * ey - dy * ex; // y down: negative = left turn
        return cross < 0 ? 0 : cross === 0 ? 1 : 2;
      };
      options.sort((a, b) => turn(a) - turn(b));
      const next = options[0];
      if (next === startEdge) break;
      edge = next;
    }
    // Keep only the corners, and the points where the neighbor on the other side changes: a
    // neighboring shape has a corner there, and both shapes need that point to share their border
    // (otherwise the shared border can't be found and its line goes missing).
    const corners = points.filter((p, i) => {
      const before = (i - 1 + points.length) % points.length;
      const prev = points[before];
      const next = points[(i + 1) % points.length];
      if (across[edges[before]] !== across[edges[i]]) return true;
      return (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]) !== 0;
    });
    const list = rings.get(l) ?? [];
    list.push(corners);
    rings.set(l, list);
  }

  // Convert to lon/lat. All outer rings wind one way and all holes the other; the largest ring
  // is always an outer ring, which tells which way is which. Output: outer rings
  // counter-clockwise, holes clockwise.
  const signed = (ring: number[][]) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return sum / 2;
  };
  const result = new Map<number, Polygons>();
  const all = [...rings.values()].flat().filter((ring) => ring.length >= 4);
  const convert = (ring: [number, number][]) =>
    ring.map(([x, y]) => [-180 + x * res, 90 - y * res]);
  let largest = 0;
  for (const ring of all) {
    const a = signed(convert(ring));
    if (Math.abs(a) > Math.abs(largest)) largest = a;
  }
  const outerSign = Math.sign(largest) || 1;
  for (const [l, list] of rings) {
    const outers: number[][][] = [];
    const holes: number[][][] = [];
    for (const ring of list) {
      if (ring.length < 4) continue;
      const out = convert(ring);
      const isOuter = Math.sign(signed(out)) === outerSign;
      if (signed(out) > 0 !== isOuter) out.reverse();
      out.push([...out[0]]);
      (isOuter ? outers : holes).push(out);
    }
    const polygons: number[][][][] = outers.map((ring) => [ring]);
    for (const hole of holes) {
      // Test a point just inside the hole's first edge.
      const [x0, y0] = hole[0] as [number, number];
      const [x1, y1] = hole[1] as [number, number];
      const px = (x0 + x1) / 2 + (y1 - y0) * 0.01;
      const py = (y0 + y1) / 2 - (x1 - x0) * 0.01;
      let best = -1;
      let bestArea = Infinity;
      outers.forEach((ring, index) => {
        if (!ringContainsPoint(ring, px, py)) return;
        const area = Math.abs(signed(ring));
        if (area < bestArea) {
          bestArea = area;
          best = index;
        }
      });
      if (best >= 0) polygons[best].push(hole);
    }
    result.set(l, polygons);
  }
  return result;
}

function ringContainsPoint(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
