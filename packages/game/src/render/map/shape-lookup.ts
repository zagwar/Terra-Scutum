import type { MapPolygon } from './map-geometry';
import type { MapProjection } from './map-projection';

/**
 * Finds which province (or sea zone) is at a point of the map: the map's
 * answer to "what did the mouse click on?".
 *
 * It works like a province ID map, but stays exact at every zoom level: a
 * coarse grid over the map lists the few polygons that touch each cell, and
 * only those are tested precisely. A lookup takes a few microseconds.
 */
export interface ShapeLookup {
  /** The item index at map position (x, z), or -1 if there is nothing there. x may be on any copy of the world. */
  find(x: number, z: number): number;
}

/** Grid cell size in world units (degrees of longitude). */
const CELL_SIZE = 1;

function ringContains(ring: Float32Array, x: number, z: number): boolean {
  let inside = false;
  const count = ring.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const zi = ring[i * 2 + 1];
    const zj = ring[j * 2 + 1];
    if (zi > z !== zj > z) {
      const xi = ring[i * 2];
      const xj = ring[j * 2];
      if (x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
    }
  }
  return inside;
}

function polygonContains(polygon: MapPolygon, x: number, z: number): boolean {
  if (x < polygon.minX || x > polygon.maxX || z < polygon.minZ || z > polygon.maxZ) return false;
  // Inside the outer ring and not inside a hole.
  let inside = false;
  for (const ring of polygon.rings) if (ringContains(ring, x, z)) inside = !inside;
  return inside;
}

export function createShapeLookup(
  polygons: readonly MapPolygon[],
  projection: MapProjection,
): ShapeLookup {
  const minX = -projection.width / 2;
  const columns = Math.ceil(projection.width / CELL_SIZE);
  const rows = Math.ceil((projection.maxZ - projection.minZ) / CELL_SIZE);
  const column = (x: number) =>
    Math.min(columns - 1, Math.max(0, Math.floor((x - minX) / CELL_SIZE)));
  const row = (z: number) =>
    Math.min(rows - 1, Math.max(0, Math.floor((z - projection.minZ) / CELL_SIZE)));

  // Two passes: count the polygons per cell, then fill one flat list (no small arrays per cell).
  const offsets = new Int32Array(columns * rows + 1);
  const forEachCell = (polygon: MapPolygon, visit: (cell: number) => void) => {
    for (let r = row(polygon.minZ); r <= row(polygon.maxZ); r++)
      for (let c = column(polygon.minX); c <= column(polygon.maxX); c++) visit(r * columns + c);
  };
  for (const polygon of polygons) forEachCell(polygon, (cell) => (offsets[cell + 1] += 1));
  for (let cell = 0; cell < columns * rows; cell++) offsets[cell + 1] += offsets[cell];
  const cellPolygons = new Int32Array(offsets[columns * rows]);
  const filled = new Int32Array(columns * rows);
  polygons.forEach((polygon, index) =>
    forEachCell(polygon, (cell) => {
      cellPolygons[offsets[cell] + filled[cell]] = index;
      filled[cell] += 1;
    }),
  );

  return {
    find(x, z) {
      if (!(z >= projection.minZ && z <= projection.maxZ)) return -1;
      const wrapped = projection.wrapX(x);
      const cell = row(z) * columns + column(wrapped);
      for (let i = offsets[cell]; i < offsets[cell + 1]; i++) {
        const polygon = polygons[cellPolygons[i]];
        if (polygonContains(polygon, wrapped, z)) return polygon.item;
      }
      return -1;
    },
  };
}
