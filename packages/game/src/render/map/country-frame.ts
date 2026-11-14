import { wrappedDelta } from './camera-motion';
import type { MapPolygon } from './map-geometry';

/** A box on the ground (map units), possibly reaching past the map's east or west edge. */
export interface GroundBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * The part of a country worth framing with the camera (F05): every piece of
 * its provinces within `reach` map units (east–west) of `anchorX` (its
 * capital), measured the short way round the world. Far-away pieces (Alaska
 * and Hawaii for the United States, Russia's Far East, overseas territories)
 * are left out, so the view isn't zoomed out across an ocean. Pure math.
 */
export function countryFrame(
  polygons: readonly MapPolygon[],
  owners: Uint16Array,
  country: number,
  anchorX: number,
  reach: number,
  worldWidth: number,
): GroundBox | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const polygon of polygons) {
    if (owners[polygon.item] !== country) continue;
    const middle = (polygon.minX + polygon.maxX) / 2;
    const shift = anchorX + wrappedDelta(anchorX, middle, worldWidth) - middle;
    const west = polygon.minX + shift;
    const east = polygon.maxX + shift;
    if (Math.abs(west - anchorX) > reach && Math.abs(east - anchorX) > reach) continue;
    minX = Math.min(minX, west);
    maxX = Math.max(maxX, east);
    minZ = Math.min(minZ, polygon.minZ);
    maxZ = Math.max(maxZ, polygon.maxZ);
  }
  return minX === Infinity ? null : { minX, maxX, minZ, maxZ };
}
