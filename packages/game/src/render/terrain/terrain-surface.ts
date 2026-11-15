import {
  METRES_PER_MAP_UNIT,
  type TerrainLayout,
  type TerrainTileData,
  terrainCellSize,
} from '@terra-scutum/sim';
import { type TileAddress, tileBounds } from './terrain-grid';

/**
 * One terrain tile as the game draws it (F125): the land's surface as a grid
 * of mesh cells, each split into two flat triangles, plus the pictures the
 * land shader reads (slopes for the light, ground colors). Pure code.
 *
 * Everything that has to stand exactly on the land (the fills, the border
 * lines, the mouse) asks this one surface, so they always agree.
 */
export interface TileSurface extends TileAddress {
  /** The south-west corner in the main copy of the world, and the side length, in map units. */
  readonly minX: number;
  readonly minZ: number;
  readonly size: number;
  /** Mesh cells along one side, and their size in map units. */
  readonly cells: number;
  readonly cellSize: number;
  /** Metres above sea level at the mesh cells' corners: (cells + 1)², row by row from the south. */
  readonly heights: Float32Array;
}

/** `data` null: a tile without a file is flat. `meshStep`: a mesh corner every this many height samples. */
export function createTileSurface(
  layout: TerrainLayout,
  address: TileAddress,
  data: TerrainTileData | null,
  meshStep: number,
): TileSurface {
  const { tileCells } = layout;
  const step = tileCells % meshStep === 0 ? meshStep : 1;
  const cells = tileCells / step;
  const heights = new Float32Array((cells + 1) ** 2);
  if (data) {
    const side = tileCells + 3;
    for (let j = 0; j <= cells; j++)
      for (let i = 0; i <= cells; i++)
        heights[j * (cells + 1) + i] = data.heights[(j * step + 1) * side + i * step + 1];
  }
  const bounds = tileBounds(layout, address.level, address.column, address.row);
  return {
    level: address.level,
    column: address.column,
    row: address.row,
    ...bounds,
    cells,
    cellSize: bounds.size / cells,
    heights,
  };
}

/**
 * The surface's height in metres at (u, v), counted in mesh cells from the
 * tile's south-west corner (positions outside the tile land on its edge).
 * Each cell is two flat triangles, split along the diagonal from its
 * south-west to its north-east corner.
 */
export function surfaceHeightLocal(surface: TileSurface, u: number, v: number): number {
  const n = surface.cells;
  const cu = Math.min(n, Math.max(0, u));
  const cv = Math.min(n, Math.max(0, v));
  const i = Math.min(n - 1, Math.floor(cu));
  const j = Math.min(n - 1, Math.floor(cv));
  return cellHeight(surface, i, j, cv - j <= cu - i, cu - i, cv - j);
}

/** The height on one of a cell's two triangles (`lower`: the south-east one) at (a, b) inside the cell (0…1). */
export function cellHeight(
  surface: TileSurface,
  i: number,
  j: number,
  lower: boolean,
  a: number,
  b: number,
): number {
  const { heights, cells } = surface;
  const base = j * (cells + 1) + i;
  const h00 = heights[base];
  const h10 = heights[base + 1];
  const h01 = heights[base + cells + 1];
  const h11 = heights[base + cells + 2];
  return lower ? h00 + (h10 - h00) * a + (h11 - h10) * b : h00 + (h11 - h01) * a + (h01 - h00) * b;
}

/** The surface's height in metres at a map position in the main copy of the world. */
export function surfaceHeight(surface: TileSurface, x: number, z: number): number {
  return surfaceHeightLocal(
    surface,
    (x - surface.minX) / surface.cellSize,
    (z - surface.minZ) / surface.cellSize,
  );
}

/** The steepest slope the slope picture can hold (1 = 45°, before exaggeration). */
export const MAX_SLOPE = 1;

/**
 * The slope picture of a tile: one pixel per height sample, (tileCells + 1)²,
 * rgba. Red and green hold the slope towards the east and the north (rise per
 * distance, real scale), stored as a signed square root so gentle slopes keep
 * their precision; the land shader undoes that and lights the land with it.
 */
export function buildSlopePixels(
  layout: TerrainLayout,
  level: number,
  data: TerrainTileData | null,
): Uint8Array {
  const { tileCells } = layout;
  const side = tileCells + 1;
  const pixels = new Uint8Array(side * side * 4);
  const encode = (slope: number) => {
    const share = Math.min(1, Math.abs(slope) / MAX_SLOPE);
    return Math.round(127.5 + 127.5 * Math.sign(slope) * Math.sqrt(share));
  };
  const flat = encode(0);
  const perMetre = 1 / (2 * terrainCellSize(layout, level) * METRES_PER_MAP_UNIT);
  const nodeSide = tileCells + 3;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const out = (j * side + i) * 4;
      pixels[out + 2] = 0;
      pixels[out + 3] = 255;
      if (!data) {
        pixels[out] = flat;
        pixels[out + 1] = flat;
        continue;
      }
      const node = (j + 1) * nodeSide + i + 1;
      pixels[out] = encode((data.heights[node + 1] - data.heights[node - 1]) * perMetre);
      pixels[out + 1] = encode(
        (data.heights[node + nodeSide] - data.heights[node - nodeSide]) * perMetre,
      );
    }
  }
  return pixels;
}

/** A ground material as the tile pictures use it: color bytes and how rough it looks (0…1). */
export interface GroundMaterial {
  readonly color: readonly [number, number, number];
  readonly roughness: number;
}

/**
 * The ground picture of a tile: one pixel per land cover cell plus two rings
 * around it, (tileCells + 4)², rgba: the ground's color (the cell's two land
 * cover classes mixed) and, in alpha, how rough it is. `materials` are in the
 * order of the land cover classes.
 */
export function buildGroundPixels(
  layout: TerrainLayout,
  data: TerrainTileData | null,
  materials: readonly GroundMaterial[],
): Uint8Array {
  const side = layout.tileCells + 4;
  const pixels = new Uint8Array(side * side * 4);
  for (let index = 0; index < side * side; index++) {
    const cover = data ? data.cover[index] : 0;
    const main = materials[cover & 15] ?? materials[0];
    const second = materials[cover >> 4] ?? main;
    const share = data ? data.coverMix[index] / 15 : 0;
    const out = index * 4;
    for (let k = 0; k < 3; k++)
      pixels[out + k] = Math.round(main.color[k] + (second.color[k] - main.color[k]) * share);
    pixels[out + 3] = Math.round(
      255 * (main.roughness + (second.roughness - main.roughness) * share),
    );
  }
  return pixels;
}
