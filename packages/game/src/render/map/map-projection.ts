import type { MapViewConfig } from '@terra-scutum/sim';
import { projectLatitude, unprojectLatitude } from '@terra-scutum/sim';

/**
 * Turns longitude/latitude into positions on the flat map and back.
 *
 * World units: 1 unit = 1 degree of longitude, so one copy of the world is
 * 360 units wide. East is +x, north is +z, the ground is y = 0, and
 * longitude 0 is x = 0. The map repeats east–west every `width` units.
 */
export interface MapProjection {
  /** Width of one copy of the world (east–west), in world units. */
  readonly width: number;
  /** The southern and northern edges of the map. */
  readonly minZ: number;
  readonly maxZ: number;
  x(longitude: number): number;
  /** Latitudes beyond the map's edges land on the edge. */
  z(latitude: number): number;
  longitude(x: number): number;
  latitude(z: number): number;
  /** Brings any x into the main copy of the world: [-width/2, width/2). */
  wrapX(x: number): number;
}

export function createMapProjection(config: MapViewConfig['projection']): MapProjection {
  const width = 360;
  const minZ = projectLatitude(config.type, config.southLatitude);
  const maxZ = projectLatitude(config.type, config.northLatitude);
  const wrapX = (x: number) => ((((x + width / 2) % width) + width) % width) - width / 2;
  return {
    width,
    minZ,
    maxZ,
    x: (longitude) => longitude,
    z: (latitude) =>
      projectLatitude(
        config.type,
        Math.min(config.northLatitude, Math.max(config.southLatitude, latitude)),
      ),
    longitude: (x) => wrapX(x),
    latitude: (z) => unprojectLatitude(config.type, z),
    wrapX,
  };
}
