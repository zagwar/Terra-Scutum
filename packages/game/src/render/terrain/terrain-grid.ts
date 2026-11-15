import {
  TERRAIN_WORLD_WIDTH,
  type TerrainLayout,
  terrainCellSize,
  terrainColumns,
  terrainRows,
  terrainTileSize,
} from '@terra-scutum/sim';

/**
 * Where terrain tiles lie and which ones a view needs (F125). Pure code.
 * The layout itself (levels, columns, rows) is in the sim's terrain-format.ts.
 */
export interface TileAddress {
  readonly level: number;
  readonly column: number;
  readonly row: number;
}

/** A tile to draw, and on which copy of the world (0 = the main one, 1 = one world width east…). */
export interface PlacedTile extends TileAddress {
  readonly shift: number;
}

export const tileKey = (level: number, column: number, row: number): string =>
  `${level}/${column}_${row}`;

/** A tile's south-west corner (in the main copy of the world) and the length of its sides, in map units. */
export function tileBounds(
  layout: TerrainLayout,
  level: number,
  column: number,
  row: number,
): { minX: number; minZ: number; size: number } {
  const size = terrainTileSize(layout, level);
  return { minX: -TERRAIN_WORLD_WIDTH / 2 + column * size, minZ: layout.minZ + row * size, size };
}

/**
 * The level to draw at a zoom: the finest one whose height samples still
 * cover at least `pixelsPerSample` screen pixels (never above `maxLevel`).
 */
export function levelForResolution(
  layout: TerrainLayout,
  unitsPerPixel: number,
  pixelsPerSample: number,
  maxLevel: number,
): number {
  let level = 0;
  const last = Math.min(maxLevel, layout.levels - 1);
  while (level < last && terrainCellSize(layout, level + 1) >= unitsPerPixel * pixelsPerSample)
    level += 1;
  return level;
}

/** The tiles of a level that touch a rectangle of ground; x may run past the world's edges (the map wraps). */
export function tilesInView(
  layout: TerrainLayout,
  level: number,
  rect: { minX: number; maxX: number; minZ: number; maxZ: number },
): PlacedTile[] {
  const size = terrainTileSize(layout, level);
  const columns = terrainColumns(layout, level);
  const rows = terrainRows(layout, level);
  const firstRow = Math.max(0, Math.floor((rect.minZ - layout.minZ) / size));
  const lastRow = Math.min(rows - 1, Math.floor((rect.maxZ - layout.minZ) / size));
  const firstColumn = Math.floor((rect.minX + TERRAIN_WORLD_WIDTH / 2) / size);
  const lastColumn = Math.floor((rect.maxX + TERRAIN_WORLD_WIDTH / 2) / size);
  const tiles: PlacedTile[] = [];
  for (let row = firstRow; row <= lastRow; row++)
    for (let c = firstColumn; c <= lastColumn; c++) {
      const shift = Math.floor(c / columns);
      tiles.push({ level, column: c - shift * columns, row, shift });
    }
  return tiles;
}

/** The tile of the next coarser level that covers this one. */
export function parentTile(tile: TileAddress): TileAddress {
  return { level: tile.level - 1, column: tile.column >> 1, row: tile.row >> 1 };
}
