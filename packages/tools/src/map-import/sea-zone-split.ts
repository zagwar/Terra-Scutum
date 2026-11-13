import type { Grid } from './raster';

/**
 * Splits sea zones into coast zones and open-sea zones (F70, designer decision).
 *
 * Every sea zone that touches a real coast is cut in two: a coast part (the
 * water within `coastBandKm` of land) and a sea part (the rest). Islands
 * smaller than `minIslandKm2` don't count as land here, so the water around
 * them stays open sea. A zone whose open part would be small (a narrow sea:
 * the Baltic, the English Channel) becomes a coast zone as a whole. A part
 * that falls into separate pieces (the coasts on two sides of a sea) keeps
 * each big piece as a zone of its own; small pieces join the zone's other
 * part. So all land bigger than a tiny island has coast zones along it.
 *
 * Everything works on the import's pixel grid (wrapping east–west).
 */

/** A sea zone as the config lists it. */
export interface SeaZoneSource {
  readonly id: string;
  readonly name: string;
  readonly depth: 'shallow' | 'deep';
}

/** A sea zone after the split. */
export interface SplitSeaZone {
  readonly id: string;
  readonly name: string;
  readonly depth: 'shallow' | 'deep';
  readonly kind: 'coast' | 'sea';
  /** The config zone it was cut from (its index in the config list). */
  readonly source: number;
}

export interface SeaZoneSplitSettings {
  /** How far out from the shore a coast zone reaches, in km. */
  readonly coastBandKm: number;
  /** Islands smaller than this (km²) don't count as a coast. */
  readonly minIslandKm2: number;
  /** A zone whose open part is less than this share of its water becomes a coast zone as a whole. */
  readonly minOpenShare: number;
  /** A separate piece of coast or open sea smaller than this (km²) joins the zone's other part. */
  readonly minPieceKm2: number;
}

export interface SeaZoneSplit {
  /** New sea zone label per pixel (index + 1 into `zones`; 0 = not sea). */
  readonly labels: Uint16Array;
  readonly zones: readonly SplitSeaZone[];
  /** Islands left out as too small to be a coast. */
  readonly tinyIslands: number;
}

const KM_PER_DEGREE = 111.32;

/** The area of one pixel in each row, in km² (pixels get narrower towards the poles). */
function pixelAreas(grid: Grid): Float64Array {
  const side = grid.degreesPerPixel * KM_PER_DEGREE;
  return Float64Array.from({ length: grid.height }, (_, y) => {
    const latitude = 90 - (y + 0.5) * grid.degreesPerPixel;
    return side * side * Math.cos((latitude * Math.PI) / 180);
  });
}

/** Neighbors of a pixel in 4 directions, wrapping east–west. */
function forEachNeighbor(grid: Grid, pixel: number, visit: (next: number) => void): void {
  const { width, height } = grid;
  const x = pixel % width;
  const y = (pixel - x) / width;
  visit(y * width + ((x + 1) % width));
  visit(y * width + ((x - 1 + width) % width));
  if (y > 0) visit(pixel - width);
  if (y < height - 1) visit(pixel + width);
}

/**
 * Connected pieces of the pixels for which `group` gives the same number
 * (0 = not in any group). Returns a piece number per pixel (0 = none) and
 * each piece's group and area.
 */
export function findPieces(
  grid: Grid,
  group: (pixel: number) => number,
): { piece: Int32Array; pieceGroup: number[]; pieceArea: number[] } {
  const areas = pixelAreas(grid);
  const piece = new Int32Array(grid.width * grid.height);
  const pieceGroup: number[] = [0];
  const pieceArea: number[] = [0];
  const stack: number[] = [];
  for (let start = 0; start < piece.length; start++) {
    const g = group(start);
    if (g === 0 || piece[start] !== 0) continue;
    const id = pieceGroup.length;
    pieceGroup.push(g);
    let area = 0;
    piece[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const pixel = stack.pop()!;
      area += areas[Math.floor(pixel / grid.width)];
      forEachNeighbor(grid, pixel, (next) => {
        if (piece[next] === 0 && group(next) === g) {
          piece[next] = id;
          stack.push(next);
        }
      });
    }
    pieceArea.push(area);
  }
  return { piece, pieceGroup, pieceArea };
}

/**
 * Distance from the nearest source pixel, in km (Infinity beyond `maxKm`).
 * Steps cost their real length (east–west steps shrink towards the poles).
 */
export function distanceKm(
  grid: Grid,
  isSource: (pixel: number) => boolean,
  maxKm: number,
): Float64Array {
  const { width, height, degreesPerPixel } = grid;
  const unitKm = degreesPerPixel * KM_PER_DEGREE;
  const horizontal = Float64Array.from({ length: height }, (_, y) => {
    const latitude = 90 - (y + 0.5) * degreesPerPixel;
    return unitKm * Math.max(0.01, Math.cos((latitude * Math.PI) / 180));
  });
  const distance = new Float64Array(width * height).fill(Infinity);
  // Dial-style buckets of 1 km.
  const buckets: number[][] = [];
  const push = (pixel: number, km: number) => {
    const bucket = Math.floor(km);
    (buckets[bucket] ??= []).push(pixel);
  };
  for (let i = 0; i < distance.length; i++)
    if (isSource(i)) {
      distance[i] = 0;
      push(i, 0);
    }
  for (let b = 0; b < buckets.length; b++) {
    const bucket = buckets[b];
    if (!bucket) continue;
    for (let k = 0; k < bucket.length; k++) {
      const pixel = bucket[k];
      const here = distance[pixel];
      if (Math.floor(here) !== b) continue; // a shorter way was found later
      const x = pixel % width;
      const y = (pixel - x) / width;
      const step = (nx: number, ny: number, cost: number) => {
        if (ny < 0 || ny >= height) return;
        const next = ny * width + ((nx + width) % width);
        const km = here + cost;
        if (km > maxKm || km >= distance[next]) return;
        distance[next] = km;
        push(next, km);
      };
      const h = horizontal[y];
      step(x + 1, y, h);
      step(x - 1, y, h);
      step(x, y - 1, unitKm);
      step(x, y + 1, unitKm);
      for (const dy of [-1, 1]) {
        const row = y + dy;
        if (row < 0 || row >= height) continue;
        const diagonal = Math.hypot((h + horizontal[row]) / 2, unitKm);
        step(x + 1, row, diagonal);
        step(x - 1, row, diagonal);
      }
    }
    buckets[b] = [];
  }
  return distance;
}

const DIRECTIONS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
];

/**
 * Cuts the sea zones (`sea`: config zone index + 1 per water pixel) into
 * coast and open-sea zones. `isLand` tells which pixels are land of the game
 * (provinces); land outside the game (Antarctica) never makes a coast.
 */
export function splitSeaZones(
  grid: Grid,
  sea: Uint16Array,
  isLand: (pixel: number) => boolean,
  sources: readonly SeaZoneSource[],
  settings: SeaZoneSplitSettings,
): SeaZoneSplit {
  const { width } = grid;
  const areas = pixelAreas(grid);
  const areaOf = (pixel: number) => areas[Math.floor(pixel / width)];

  // Land that counts as a coast: every piece of land except tiny islands.
  const land = findPieces(grid, (pixel) => (isLand(pixel) ? 1 : 0));
  const bigLand = land.pieceArea.map((area) => area >= settings.minIslandKm2);
  const tinyIslands = bigLand.filter((big, i) => i > 0 && !big).length;
  const fromCoast = distanceKm(
    grid,
    (pixel) => land.piece[pixel] !== 0 && bigLand[land.piece[pixel]],
    settings.coastBandKm,
  );
  const isCoastWater = (pixel: number) => fromCoast[pixel] <= settings.coastBandKm;

  // Per config zone: how much of its water is coast.
  const coastArea = new Float64Array(sources.length + 1);
  const totalArea = new Float64Array(sources.length + 1);
  for (let pixel = 0; pixel < sea.length; pixel++) {
    const zone = sea[pixel];
    if (zone === 0) continue;
    totalArea[zone] += areaOf(pixel);
    if (isCoastWater(pixel)) coastArea[zone] += areaOf(pixel);
  }
  /** What each config zone becomes: all coast, all open sea, or both. */
  const plan = sources.map((_, i) => {
    const total = totalArea[i + 1];
    if (total > 0 && 1 - coastArea[i + 1] / total < settings.minOpenShare) return 'coast' as const;
    if (coastArea[i + 1] < settings.minPieceKm2) return 'sea' as const;
    return 'split' as const;
  });
  // Part per pixel: 2 × config zone + (1 for coast, 0 for open sea), so each part is its own group.
  const partOf = (pixel: number): number => {
    const zone = sea[pixel];
    if (zone === 0) return 0;
    const what = plan[zone - 1];
    const coast = what === 'coast' || (what === 'split' && isCoastWater(pixel));
    return zone * 2 + (coast ? 1 : 0);
  };
  const parts = findPieces(grid, partOf);

  // Small pieces of a part join the zone's other part; big pieces become zones.
  const bigPieces = new Map<number, number[]>(); // part → its big pieces, biggest first
  parts.pieceGroup.forEach((group, piece) => {
    if (piece === 0) return;
    if (parts.pieceArea[piece] >= settings.minPieceKm2) {
      const list = bigPieces.get(group) ?? [];
      list.push(piece);
      bigPieces.set(group, list);
    }
  });
  // A small zone (the Sea of Marmara) still stays a zone: its biggest piece.
  sources.forEach((_, i) => {
    const own = [(i + 1) * 2, (i + 1) * 2 + 1];
    if (own.some((part) => bigPieces.has(part))) return;
    let biggest = 0;
    parts.pieceGroup.forEach((group, piece) => {
      if (own.includes(group) && parts.pieceArea[piece] > parts.pieceArea[biggest]) biggest = piece;
    });
    if (biggest > 0) bigPieces.set(parts.pieceGroup[biggest], [biggest]);
  });
  for (const list of bigPieces.values())
    list.sort((a, b) => parts.pieceArea[b] - parts.pieceArea[a]);

  // Where each big piece lies (its middle), to name pieces of the same part by direction.
  const pieceSum = new Map<number, { x: number; y: number; n: number }>();
  for (let pixel = 0; pixel < sea.length; pixel++) {
    const piece = parts.piece[pixel];
    if (piece === 0) continue;
    const sum = pieceSum.get(piece) ?? { x: 0, y: 0, n: 0 };
    sum.x += pixel % width;
    sum.y += Math.floor(pixel / width);
    sum.n += 1;
    pieceSum.set(piece, sum);
  }

  const zones: SplitSeaZone[] = [];
  const zoneOfPiece = new Map<number, number>(); // big piece → new zone label
  sources.forEach((source, i) => {
    for (const coast of [false, true]) {
      const part = (i + 1) * 2 + (coast ? 1 : 0);
      const pieces = bigPieces.get(part) ?? [];
      const split = plan[i] === 'split';
      pieces.forEach((piece, k) => {
        let id = coast && split ? `${source.id}_coast` : source.id;
        let name = coast && split ? `${source.name} Coast` : source.name;
        if (k > 0) {
          // A second big piece of the same part: named by where it lies from the first.
          const first = pieceSum.get(pieces[0])!;
          const here = pieceSum.get(piece)!;
          let dx = here.x / here.n - first.x / first.n;
          if (dx > width / 2) dx -= width;
          if (dx < -width / 2) dx += width;
          const dy = first.y / first.n - here.y / here.n;
          const octant = Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) / 45) % 8;
          // Two pieces in the same direction are numbered.
          const direction = DIRECTIONS[octant];
          const taken = (suffix: string) => zones.some((zone) => zone.id === `${id}_${suffix}`);
          let suffix = direction;
          for (let n = 2; taken(suffix); n++) suffix = `${direction}_${n}`;
          const label =
            suffix === direction ? direction : `${direction} ${suffix.split('_').pop()}`;
          id = `${id}_${suffix}`;
          name = `${name} (${label})`;
        }
        zones.push({
          id,
          name,
          depth: source.depth,
          kind: coast ? 'coast' : 'sea',
          source: i,
        });
        zoneOfPiece.set(piece, zones.length);
      });
    }
  });
  const ids = new Set(zones.map((zone) => zone.id));
  if (ids.size !== zones.length) throw new Error('splitting sea zones gave two zones the same id');

  // Label every pixel. A small piece joins the zone it touches most, preferring zones of its own
  // kind (a small stretch of coast joins the neighboring coast zone, so open sea never reaches
  // the shore); a piece touching no zone yet waits for its neighbors. Last resort: the other part
  // of its own zone.
  const pieceZone = new Int32Array(parts.pieceGroup.length);
  for (const [piece, zone] of zoneOfPiece) pieceZone[piece] = zone;
  const isCoastPart = (piece: number) => (parts.pieceGroup[piece] & 1) === 1;
  let unassigned = parts.pieceGroup.length - 1 - zoneOfPiece.size;
  while (unassigned > 0) {
    // Contacts between each unassigned piece and the zones around it: [same kind, any kind].
    const contacts = new Map<number, Map<number, [number, number]>>();
    for (let pixel = 0; pixel < sea.length; pixel++) {
      const piece = parts.piece[pixel];
      if (piece === 0 || pieceZone[piece] !== 0) continue;
      forEachNeighbor(grid, pixel, (next) => {
        const other = parts.piece[next];
        if (other === 0 || pieceZone[other] === 0) return;
        const zone = pieceZone[other];
        const counts = contacts.get(piece) ?? new Map<number, [number, number]>();
        const count = counts.get(zone) ?? [0, 0];
        if (isCoastPart(other) === isCoastPart(piece)) count[0] += 1;
        count[1] += 1;
        counts.set(zone, count);
        contacts.set(piece, counts);
      });
    }
    if (contacts.size === 0) break;
    for (const [piece, counts] of contacts) {
      let best = 0;
      let bestCount: [number, number] = [-1, -1];
      for (const [zone, count] of counts)
        if (count[0] > bestCount[0] || (count[0] === bestCount[0] && count[1] > bestCount[1])) {
          best = zone;
          bestCount = count;
        }
      pieceZone[piece] = best;
      unassigned -= 1;
    }
  }
  const fallback = (part: number): number => {
    const target = bigPieces.get(part ^ 1)?.[0] ?? bigPieces.get(part)?.[0];
    return target === undefined ? 0 : zoneOfPiece.get(target)!;
  };
  const labels = new Uint16Array(sea.length);
  for (let pixel = 0; pixel < sea.length; pixel++) {
    const piece = parts.piece[pixel];
    if (piece === 0) continue;
    labels[pixel] = pieceZone[piece] || fallback(parts.pieceGroup[piece]);
  }
  return { labels, zones, tinyIslands };
}

/**
 * A label point for every zone: the pixel of the zone farthest from its
 * edges (for a coast band, the middle of the band). Returns lon/lat per zone.
 */
export function zoneLabelPoints(
  grid: Grid,
  labels: Uint16Array,
  zoneCount: number,
): [number, number][] {
  const { width } = grid;
  const isEdge = (pixel: number) => {
    let edge = false;
    forEachNeighbor(grid, pixel, (next) => {
      if (labels[next] !== labels[pixel]) edge = true;
    });
    return edge;
  };
  const fromEdge = distanceKm(grid, (pixel) => labels[pixel] !== 0 && isEdge(pixel), 5000);
  const best = new Float64Array(zoneCount + 1).fill(-1);
  const where = new Int32Array(zoneCount + 1).fill(-1);
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const zone = labels[pixel];
    if (zone === 0) continue;
    const d = Number.isFinite(fromEdge[pixel]) ? fromEdge[pixel] : 5000;
    if (d > best[zone]) {
      best[zone] = d;
      where[zone] = pixel;
    }
  }
  const result: [number, number][] = [];
  for (let zone = 1; zone <= zoneCount; zone++) {
    const pixel = where[zone];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    result.push([-180 + (x + 0.5) * grid.degreesPerPixel, 90 - (y + 0.5) * grid.degreesPerPixel]);
  }
  return result;
}
