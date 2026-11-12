import earcut from 'earcut';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, GeometryObject, Topology } from 'topojson-specification';
import type { MapProjection } from './map-projection';

/**
 * Turns the map's shape files (TopoJSON, in longitude/latitude) into what the
 * renderer needs: filled triangles, border lines and outlines, all in flat
 * map coordinates (see map-projection.ts). Pure code: no Babylon, no browser.
 */

/** A list of points stored flat: x0, z0, x1, z1, … */
export type Points = Float32Array;

/** One outline of a province or sea zone (a province with islands has several). */
export interface MapPolygon {
  /** Index of the province or sea zone this polygon belongs to. */
  readonly item: number;
  /** The outer ring first, then any holes. Rings are closed: the last point connects to the first. */
  readonly rings: readonly Points[];
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Triangles for many polygons in one mesh. */
export interface FillGeometry {
  /** x, y, z per vertex (y is always 0). */
  readonly positions: Float32Array;
  /** Which province or sea zone each vertex belongs to. */
  readonly vertexItems: Uint32Array;
  readonly indices: Uint32Array;
}

/**
 * Reads every shape of one TopoJSON object into map coordinates.
 * `indexOf` gives the numeric index of a shape's id (from the sim's world map).
 */
export function decodePolygons(
  topology: Topology,
  objectName: string,
  indexOf: (id: string) => number,
  projection: MapProjection,
): MapPolygon[] {
  const collection = topology.objects[objectName] as GeometryCollection;
  const polygons: MapPolygon[] = [];

  for (const geometry of collection.geometries) {
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue;
    const item = indexOf(String(geometry.id));
    const shape = feature(topology, geometry as GeometryObject) as unknown as Feature<
      Polygon | MultiPolygon
    >;
    const parts =
      shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates] : shape.geometry.coordinates;

    for (const part of parts) {
      // GeoJSON repeats the first point at the end; our rings don't.
      if (part.length === 0 || part[0].length - 1 < 3) continue;
      const rings: Points[] = [];
      for (const ring of part) {
        const count = ring.length - 1;
        if (count < 3) continue;
        const points = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
          points[i * 2] = projection.x(ring[i][0]);
          points[i * 2 + 1] = projection.z(ring[i][1]);
        }
        rings.push(points);
      }

      const outer = rings[0];
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < outer.length; i += 2) {
        minX = Math.min(minX, outer[i]);
        maxX = Math.max(maxX, outer[i]);
        minZ = Math.min(minZ, outer[i + 1]);
        maxZ = Math.max(maxZ, outer[i + 1]);
      }
      polygons.push({ item, rings, minX, maxX, minZ, maxZ });
    }
  }
  return polygons;
}

/** Cuts polygons into triangles (one mesh for all of them). */
export function triangulate(polygons: readonly MapPolygon[]): FillGeometry {
  let vertexCount = 0;
  for (const polygon of polygons) for (const ring of polygon.rings) vertexCount += ring.length / 2;
  const positions = new Float32Array(vertexCount * 3);
  const vertexItems = new Uint32Array(vertexCount);
  const indices: number[] = [];

  let vertex = 0;
  for (const polygon of polygons) {
    // earcut wants all rings in one flat list plus where each hole starts.
    const flat: number[] = [];
    const holeStarts: number[] = [];
    for (const [ringIndex, points] of polygon.rings.entries()) {
      if (ringIndex > 0) holeStarts.push(flat.length / 2);
      for (const value of points) flat.push(value);
    }
    const firstVertex = vertex;
    for (let i = 0; i < flat.length; i += 2) {
      positions[vertex * 3] = flat[i];
      positions[vertex * 3 + 2] = flat[i + 1];
      vertexItems[vertex] = polygon.item;
      vertex += 1;
    }
    for (const index of earcut(flat, holeStarts, 2)) indices.push(firstVertex + index);
  }
  return { positions, vertexItems, indices: new Uint32Array(indices) };
}

/** Longitudes this close to ±180° count as "on the date line". */
const DATE_LINE_TOLERANCE = 1e-6;

/**
 * Turns lines in longitude/latitude into map coordinates, leaving out pieces
 * that aren't real borders: where a shape was cut at the date line (the map
 * wraps there, so the two halves meet), and anything beyond the map's top
 * and bottom edges.
 */
export function projectLines(
  lines: readonly (readonly (readonly number[])[])[],
  projection: MapProjection,
): Points[] {
  const result: Points[] = [];
  const onDateLine = (longitude: number) =>
    Math.abs(Math.abs(longitude) - 180) < DATE_LINE_TOLERANCE;
  const offMap = (z: number) => z <= projection.minZ || z >= projection.maxZ;

  for (const line of lines) {
    let current: number[] = [];
    const flush = () => {
      if (current.length >= 4) result.push(new Float32Array(current));
      current = [];
    };
    for (let i = 0; i + 1 < line.length; i++) {
      const [lonA, latA] = line[i];
      const [lonB, latB] = line[i + 1];
      const zA = projection.z(latA);
      const zB = projection.z(latB);
      const skip =
        (onDateLine(lonA) && onDateLine(lonB)) ||
        (zA === zB && offMap(zA)) ||
        (lonA === lonB && latA === latB);
      if (skip) {
        flush();
        continue;
      }
      if (current.length === 0) current.push(projection.x(lonA), zA);
      current.push(projection.x(lonB), zB);
    }
    flush();
  }
  return result;
}

/**
 * What kind of line this is, as flags added together. The line shader uses
 * them to pick each line's color and width (see line-material.ts).
 */
export const LINE_PLAIN = 0;
/** A province border that is also a country border. */
export const LINE_OTHER_COUNTRY = 1;
/** A province border that is also a region border. */
export const LINE_OTHER_REGION = 2;
/** Land meeting sea. */
export const LINE_COAST = 4;

export interface StyledLine {
  readonly points: Points;
  /** `LINE_*` flags. */
  readonly kind: number;
}

/**
 * Every province border, marked as coast, country border, region border or
 * plain province border. TopoJSON stores each shared border once, so nothing
 * is drawn twice.
 */
export function buildProvinceBorders(
  topology: Topology,
  objectName: string,
  indexOf: (id: string) => number,
  countryOf: ArrayLike<number>,
  regionOf: ArrayLike<number>,
  projection: MapProjection,
): StyledLine[] {
  const collection = topology.objects[objectName] as GeometryCollection;
  const index = new Map<GeometryObject, number>();
  for (const geometry of collection.geometries) index.set(geometry, indexOf(String(geometry.id)));
  const lines = (kind: number, keep: (a: number, b: number) => boolean): StyledLine[] =>
    projectLines(
      mesh(topology, collection, (a, b) => keep(index.get(a)!, index.get(b)!)).coordinates,
      projection,
    ).map((points) => ({ points, kind }));
  const border = (otherCountry: boolean, otherRegion: boolean) =>
    lines(
      (otherCountry ? LINE_OTHER_COUNTRY : 0) + (otherRegion ? LINE_OTHER_REGION : 0),
      (a, b) =>
        a !== b &&
        (countryOf[a] !== countryOf[b]) === otherCountry &&
        (regionOf[a] !== regionOf[b]) === otherRegion,
    );
  // In drawing order: plain borders at the bottom, then coasts, then the important borders on top.
  return [
    ...border(false, false),
    ...lines(LINE_COAST, (a, b) => a === b),
    ...border(false, true),
    ...border(true, false),
    ...border(true, true),
  ];
}

/** The borders between the shapes of one TopoJSON object (used for sea zones). */
export function buildInnerBorders(
  topology: Topology,
  objectName: string,
  projection: MapProjection,
): StyledLine[] {
  const collection = topology.objects[objectName] as GeometryCollection;
  return projectLines(mesh(topology, collection, (a, b) => a !== b).coordinates, projection).map(
    (points) => ({ points, kind: LINE_PLAIN }),
  );
}

/** The outline of one province or sea zone, as lines (without date-line cuts). */
export function outlineOf(
  polygons: readonly MapPolygon[],
  item: number,
  projection: MapProjection,
): StyledLine[] {
  const result: StyledLine[] = [];
  const edge = projection.width / 2;
  const onEdge = (x: number) => Math.abs(Math.abs(x) - edge) < DATE_LINE_TOLERANCE;
  for (const polygon of polygons) {
    if (polygon.item !== item) continue;
    for (const ring of polygon.rings) {
      const count = ring.length / 2;
      let current: number[] = [];
      const flush = () => {
        if (current.length >= 4)
          result.push({ points: new Float32Array(current), kind: LINE_PLAIN });
        current = [];
      };
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        if (onEdge(ring[i * 2]) && onEdge(ring[j * 2])) {
          flush();
          continue;
        }
        if (current.length === 0) current.push(ring[i * 2], ring[i * 2 + 1]);
        current.push(ring[j * 2], ring[j * 2 + 1]);
      }
      flush();
    }
  }
  return result;
}

/** A stretch of a line: the points `from`…`to` (inclusive) of `points`. */
export interface LineSpan extends StyledLine {
  readonly from: number;
  readonly to: number;
}

export const wholeLine = (line: StyledLine): LineSpan => ({
  ...line,
  from: 0,
  to: line.points.length / 2 - 1,
});

/**
 * Vertex data for drawing lines with a width (see line-material.ts). Every
 * point becomes two vertices, pushed apart on screen by the shader; each also
 * knows the points before and after it, so corners join cleanly (also where a
 * line was cut into spans).
 */
export interface LineGeometry {
  /** x, y, z per vertex. */
  readonly positions: Float32Array;
  /** Previous point (x, z) and next point (x, z) per vertex. */
  readonly neighbors: Float32Array;
  /** Per vertex: which side of the line it's pushed to (-1 or +1), and the line's `LINE_*` flags. */
  readonly sideAndKind: Float32Array;
  readonly indices: Uint32Array;
}

export function buildLineGeometry(spans: readonly LineSpan[]): LineGeometry {
  let pointCount = 0;
  for (const span of spans) pointCount += span.to - span.from + 1;
  const positions = new Float32Array(pointCount * 2 * 3);
  const neighbors = new Float32Array(pointCount * 2 * 4);
  const sideAndKind = new Float32Array(pointCount * 2 * 2);
  const indices = new Uint32Array((pointCount - spans.length) * 6);

  let vertex = 0;
  let index = 0;
  for (const { points, from, to, kind } of spans) {
    const last = points.length / 2 - 1;
    // A line that ends where it starts is a loop: its ends join like any other corner.
    const loop = last > 2 && points[0] === points[last * 2] && points[1] === points[last * 2 + 1];
    for (let i = from; i <= to; i++) {
      const previous = i > 0 ? i - 1 : loop ? last - 1 : i;
      const next = i < last ? i + 1 : loop ? 1 : i;
      for (const side of [-1, 1]) {
        positions[vertex * 3] = points[i * 2];
        positions[vertex * 3 + 2] = points[i * 2 + 1];
        neighbors[vertex * 4] = points[previous * 2];
        neighbors[vertex * 4 + 1] = points[previous * 2 + 1];
        neighbors[vertex * 4 + 2] = points[next * 2];
        neighbors[vertex * 4 + 3] = points[next * 2 + 1];
        sideAndKind[vertex * 2] = side;
        sideAndKind[vertex * 2 + 1] = kind;
        vertex += 1;
      }
      if (i < to) {
        const a = vertex - 2;
        indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], index);
        index += 6;
      }
    }
  }
  return { positions, neighbors, sideAndKind, indices };
}

/**
 * Chunks: the map cut into a grid of squares, so that zoomed-in views only
 * draw the squares on screen. A polygon goes into the square that holds its
 * middle; a line is cut where it passes from one square to the next.
 */
export interface ChunkGrid {
  readonly columns: number;
  readonly rows: number;
  /** The chunk (0 … columns × rows - 1) that holds a map position. */
  chunkAt(x: number, z: number): number;
}

export function createChunkGrid(projection: MapProjection, chunkSize: number): ChunkGrid {
  const columns = Math.max(1, Math.round(projection.width / chunkSize));
  const rows = Math.max(1, Math.round((projection.maxZ - projection.minZ) / chunkSize));
  const columnWidth = projection.width / columns;
  const rowHeight = (projection.maxZ - projection.minZ) / rows;
  const clamp = (value: number, count: number) => Math.min(count - 1, Math.max(0, value));
  return {
    columns,
    rows,
    chunkAt: (x, z) =>
      clamp(Math.floor((z - projection.minZ) / rowHeight), rows) * columns +
      clamp(Math.floor((x + projection.width / 2) / columnWidth), columns),
  };
}

export function chunkPolygons(
  polygons: readonly MapPolygon[],
  grid: ChunkGrid,
): Map<number, MapPolygon[]> {
  const chunks = new Map<number, MapPolygon[]>();
  for (const polygon of polygons) {
    const chunk = grid.chunkAt(
      (polygon.minX + polygon.maxX) / 2,
      (polygon.minZ + polygon.maxZ) / 2,
    );
    const list = chunks.get(chunk);
    if (list) list.push(polygon);
    else chunks.set(chunk, [polygon]);
  }
  return chunks;
}

export function chunkLines(lines: readonly StyledLine[], grid: ChunkGrid): Map<number, LineSpan[]> {
  const chunks = new Map<number, LineSpan[]>();
  const add = (chunk: number, span: LineSpan) => {
    const list = chunks.get(chunk);
    if (list) list.push(span);
    else chunks.set(chunk, [span]);
  };
  for (const line of lines) {
    const { points } = line;
    const segmentCount = points.length / 2 - 1;
    let from = 0;
    let current = -1;
    for (let i = 0; i < segmentCount; i++) {
      // A segment belongs to the chunk that holds its middle.
      const chunk = grid.chunkAt(
        (points[i * 2] + points[i * 2 + 2]) / 2,
        (points[i * 2 + 1] + points[i * 2 + 3]) / 2,
      );
      if (chunk !== current) {
        if (current >= 0) add(current, { ...line, from, to: i });
        current = chunk;
        from = i;
      }
    }
    if (current >= 0) add(current, { ...line, from, to: segmentCount });
  }
  return chunks;
}
