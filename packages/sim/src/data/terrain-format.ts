import { z } from 'zod';
import { MAP_PROJECTIONS, type MapProjectionType } from './map-view-config';

/**
 * The terrain files (F125): how the world's heights and land cover are cut
 * into tiles, the list of tiles that exist (`data/terrain_tiles.json`), and
 * how one tile is stored. Shared by the terrain import (`packages/tools`),
 * which writes the tiles, and the game, which reads them. The sim's systems
 * don't use any of it.
 *
 * Layout: level 0 covers the world with `baseCells` cells east to west; each
 * level after it has twice as many. A level is cut into square tiles of
 * `tileCells` × `tileCells` cells. Columns count east from longitude −180,
 * rows count north from the map's southern edge, so tile (c, r) of one level
 * is covered by the tiles (2c, 2r) … (2c + 1, 2r + 1) of the next.
 */

/** Flattening the Earth: latitude ↔ the map's north–south coordinate (in degrees of longitude). */
const DEGREES = 180 / Math.PI;
const LATITUDE_MAPPINGS: Record<
  MapProjectionType,
  { forward(latitude: number): number; inverse(z: number): number }
> = {
  equirectangular: {
    forward: (latitude) => latitude,
    inverse: (z) => z,
  },
  // Miller cylindrical: a Mercator-like projection that stays finite at the poles.
  miller: {
    forward: (latitude) =>
      1.25 * Math.log(Math.tan(Math.PI / 4 + (0.4 * latitude) / DEGREES)) * DEGREES,
    inverse: (z) => 2.5 * (Math.atan(Math.exp((0.8 * z) / DEGREES)) - Math.PI / 4) * DEGREES,
  },
};

/** A latitude's position on the flat map (north is up, the equator is 0). */
export function projectLatitude(type: MapProjectionType, latitude: number): number {
  return LATITUDE_MAPPINGS[type].forward(latitude);
}

/** The latitude at a north–south position of the flat map. */
export function unprojectLatitude(type: MapProjectionType, z: number): number {
  return LATITUDE_MAPPINGS[type].inverse(z);
}

/** How many metres one map unit (one degree of longitude at the equator) is. */
export const METRES_PER_MAP_UNIT = 111_320;

const tileName = z.string().regex(/^\d+_\d+$/, 'tiles are written as column_row');

/** `data/terrain_tiles.json`, written by `npm run import:terrain`. Never edited by hand. */
export const terrainTilesFileSchema = z.strictObject({
  /** Changes whenever the tiles change, so browsers fetch the new ones. */
  version: z.string().min(1),
  /** The map projection the tiles were made for: it must be the one in `map_view.json`. */
  projection: z.strictObject({
    type: z.enum(MAP_PROJECTIONS),
    southLatitude: z.number(),
    northLatitude: z.number(),
  }),
  /** Cells around the world at level 0. */
  baseCells: z.number().int().min(256),
  /** Cells along one side of a tile. */
  tileCells: z.number().int().min(16),
  /** The lowest and highest point of the land, in metres. */
  minHeightM: z.number(),
  maxHeightM: z.number(),
  /** Per level (0 = coarsest): the tiles that have a file. A tile without one is flat, bare land. */
  levels: z.array(z.strictObject({ tiles: z.array(tileName) })).min(1),
});
export type TerrainTilesFile = z.infer<typeof terrainTilesFileSchema>;

/** The numbers that fix where every tile lies. */
export interface TerrainLayout {
  readonly baseCells: number;
  readonly tileCells: number;
  readonly levels: number;
  /** The map's southern edge (row 0 starts here), in map units. */
  readonly minZ: number;
  readonly maxZ: number;
}

/** Width of one copy of the world, in map units. */
export const TERRAIN_WORLD_WIDTH = 360;

export function terrainLayout(file: TerrainTilesFile): TerrainLayout {
  return {
    baseCells: file.baseCells,
    tileCells: file.tileCells,
    levels: file.levels.length,
    minZ: projectLatitude(file.projection.type, file.projection.southLatitude),
    maxZ: projectLatitude(file.projection.type, file.projection.northLatitude),
  };
}

/** Size of one cell of a level, in map units. */
export function terrainCellSize(layout: TerrainLayout, level: number): number {
  return TERRAIN_WORLD_WIDTH / (layout.baseCells * 2 ** level);
}

/** Size of one tile of a level, in map units. */
export function terrainTileSize(layout: TerrainLayout, level: number): number {
  return terrainCellSize(layout, level) * layout.tileCells;
}

/** How many tiles a level has east to west. */
export function terrainColumns(layout: TerrainLayout, level: number): number {
  return (layout.baseCells * 2 ** level) / layout.tileCells;
}

/** How many rows of cells a level needs to reach the map's northern edge. */
export function terrainCellRows(layout: TerrainLayout, level: number): number {
  return Math.ceil((layout.maxZ - layout.minZ) / terrainCellSize(layout, level) - 1e-9);
}

/** How many rows of tiles a level has. */
export function terrainRows(layout: TerrainLayout, level: number): number {
  return Math.ceil(terrainCellRows(layout, level) / layout.tileCells);
}

/** A tile's name inside its level: `column_row`. */
export function terrainTileName(column: number, row: number): string {
  return `${column}_${row}`;
}

/**
 * One tile's content.
 *
 * - `heights`: metres above sea level at the corners of the cells ("nodes"),
 *   with one extra ring of nodes around the tile, so slopes at the edge match
 *   the neighboring tile: (tileCells + 3)² values. Node (i, j) of the tile is
 *   at index (j + 1) × (tileCells + 3) + (i + 1); i counts east, j north.
 * - `cover` and `coverMix`: the land cover of the cells, with two extra rings
 *   of cells (so the land shader can let the edges between land types wander
 *   a little without a seam at the tile's edge): (tileCells + 4)² values
 *   each. Cell (i, j) of the tile is at index (j + 2) × (tileCells + 4) + (i + 2).
 *   `cover` holds the main class in its low four bits and the second class in
 *   its high four bits (positions in `LAND_COVER_CLASSES`); `coverMix` is how
 *   much of the two is the second class, 0…15 (15 = all of it; it is never
 *   more than half).
 */
export interface TerrainTileData {
  readonly heights: Int16Array;
  readonly cover: Uint8Array;
  readonly coverMix: Uint8Array;
}

const TILE_FORMAT = 1;

export function terrainTileSizes(tileCells: number): { nodes: number; cells: number } {
  return { nodes: (tileCells + 3) ** 2, cells: (tileCells + 4) ** 2 };
}

/**
 * Packs a tile into bytes that compress well: each height is stored as its
 * difference from what its three neighbors predict (smooth land gives small
 * numbers), low and high bytes apart. The result still has to be compressed
 * (the import uses zlib's deflate; the game unpacks it with the browser's own).
 */
export function encodeTerrainTile(tile: TerrainTileData, tileCells: number): Uint8Array {
  const { nodes, cells } = terrainTileSizes(tileCells);
  if (
    tile.heights.length !== nodes ||
    tile.cover.length !== cells ||
    tile.coverMix.length !== cells
  )
    throw new Error('encodeTerrainTile: wrong tile size');
  const side = tileCells + 3;
  const bytes = new Uint8Array(1 + nodes * 2 + cells * 2);
  bytes[0] = TILE_FORMAT;
  const { heights } = tile;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const index = j * side + i;
      const west = i > 0 ? heights[index - 1] : 0;
      const south = j > 0 ? heights[index - side] : 0;
      const southWest = i > 0 && j > 0 ? heights[index - side - 1] : 0;
      const predicted = i > 0 && j > 0 ? west + south - southWest : west + south;
      const difference = heights[index] - predicted;
      // Zigzag: small differences of either sign become small numbers.
      const packed = ((difference << 1) ^ (difference >> 31)) & 0xffff;
      bytes[1 + index] = packed & 0xff;
      bytes[1 + nodes + index] = packed >> 8;
    }
  }
  bytes.set(tile.cover, 1 + nodes * 2);
  bytes.set(tile.coverMix, 1 + nodes * 2 + cells);
  return bytes;
}

/** Reads a tile back from `encodeTerrainTile`'s bytes (already decompressed). */
export function decodeTerrainTile(bytes: Uint8Array, tileCells: number): TerrainTileData {
  const { nodes, cells } = terrainTileSizes(tileCells);
  if (bytes.length !== 1 + nodes * 2 + cells * 2 || bytes[0] !== TILE_FORMAT)
    throw new Error('not a terrain tile of this version');
  const side = tileCells + 3;
  const heights = new Int16Array(nodes);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const index = j * side + i;
      const packed = bytes[1 + index] | (bytes[1 + nodes + index] << 8);
      const difference = (packed >>> 1) ^ -(packed & 1);
      const west = i > 0 ? heights[index - 1] : 0;
      const south = j > 0 ? heights[index - side] : 0;
      const southWest = i > 0 && j > 0 ? heights[index - side - 1] : 0;
      const predicted = i > 0 && j > 0 ? west + south - southWest : west + south;
      heights[index] = predicted + difference;
    }
  }
  return {
    heights,
    cover: bytes.slice(1 + nodes * 2, 1 + nodes * 2 + cells),
    coverMix: bytes.slice(1 + nodes * 2 + cells),
  };
}
