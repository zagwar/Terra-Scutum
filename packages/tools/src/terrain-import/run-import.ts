import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  LAND_COVER_CLASSES,
  METRES_PER_MAP_UNIT,
  type TerrainLayout,
  type TerrainTilesFile,
  encodeTerrainTile,
  mapViewSchema,
  projectLatitude,
  terrainColumns,
  terrainRows,
  terrainTileName,
  unprojectLatitude,
} from '@terra-scutum/sim';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { DATA_DIR, REPO_ROOT } from '../load-data';
import { loadMapConfig } from '../map-import/config';
import { decodePngRgb, encodePng } from '../map-import/png';
import {
  CLASS_COUNT,
  type ElevationMosaic,
  type LevelData,
  type LevelGrid,
  coarserCounts,
  coarserHeights,
  coarserMask,
  coverFromCounts,
  cutTile,
  fillLandNodes,
  levelGrid,
  mercatorRow,
  sampleHeights,
  simplifyLine,
} from './grids';
import {
  TERRAIN_CONFIG_DIR,
  elevationTilePath,
  ensureElevationTiles,
  ensureLandCover,
  ensureRivers,
  loadTerrainSettings,
  readLandCover,
} from './sources';

/**
 * The terrain import (`npm run import:terrain`): turns public elevation and
 * land cover data, plus the map's province shapes, into the game's terrain:
 *
 * - `packages/game/public/terrain/<level>/<column>_<row>.bin` (the tiles)
 * - `data/terrain_tiles.json` (which tiles exist)
 * - `data/geometry/rivers.json` (the rivers)
 * - `packages/tools/terrain-config/report/` (a summary and a preview picture)
 *
 * Run it again after `npm run import:map` changes the provinces: the land
 * mask comes from them. The output is deterministic.
 */
export const TERRAIN_TILE_DIR = join(REPO_ROOT, 'packages/game/public/terrain');
export const TERRAIN_TILES_FILE = join(DATA_DIR, 'terrain_tiles.json');
export const RIVERS_FILE = join(DATA_DIR, 'geometry/rivers.json');
const REPORT_DIR = join(TERRAIN_CONFIG_DIR, 'report');

/** ESA WorldCover's class codes → positions in `LAND_COVER_CLASSES`. */
const WORLDCOVER_CLASSES: Readonly<Record<number, (typeof LAND_COVER_CLASSES)[number]>> = {
  10: 'forest',
  20: 'shrubland',
  30: 'grassland',
  40: 'farmland',
  50: 'urban',
  60: 'bare',
  70: 'snow',
  80: 'water',
  90: 'wetland',
  95: 'mangrove',
  100: 'tundra',
};

/** Colors for the report's preview picture only (the game's are in `data/map_view.json`). */
const PREVIEW_COLORS: readonly (readonly [number, number, number])[] = [
  [118, 124, 92],
  [52, 78, 46],
  [122, 120, 78],
  [120, 134, 82],
  [156, 150, 94],
  [132, 128, 124],
  [198, 176, 132],
  [238, 242, 246],
  [44, 74, 104],
  [84, 108, 94],
  [50, 88, 68],
  [142, 140, 116],
];

export interface TerrainSummary {
  readonly tiles: number;
  readonly megabytes: number;
  readonly rivers: number;
}

export async function runTerrainImport(
  log: (line: string) => void = console.log,
): Promise<TerrainSummary> {
  const settings = loadTerrainSettings();
  const mapView = JSON.parse(readFileSync(join(DATA_DIR, 'map_view.json'), 'utf8')) as {
    projection: unknown;
  };
  const projection = mapViewSchema.shape.projection.parse(mapView.projection);
  const layout: TerrainLayout = {
    baseCells: settings.tiles.baseCells,
    tileCells: settings.tiles.tileCells,
    levels: settings.tiles.levels,
    minZ: projectLatitude(projection.type, projection.southLatitude),
    maxZ: projectLatitude(projection.type, projection.northLatitude),
  };
  const finestLevel = layout.levels - 1;
  const finest = levelGrid(layout, finestLevel);
  const latitudeOfRow = (grid: LevelGrid) => (row: number) =>
    unprojectLatitude(projection.type, layout.minZ + row * grid.cellSize);

  // ── Downloads ──────────────────────────────────────────────────────────────
  const { zoom } = settings.elevation;
  const worldPixels = 256 * 2 ** zoom;
  const lastElevationRow = Math.min(
    2 ** zoom - 1,
    Math.floor((mercatorRow(projection.southLatitude, worldPixels) + 1) / 256),
  );
  await ensureElevationTiles(settings, lastElevationRow, log);
  const landCoverTiles = await ensureLandCover(settings, log);
  const naturalEarth = loadMapConfig().settings.naturalEarth.version;
  const riversSource = await ensureRivers(settings, naturalEarth, log);

  // ── The land mask, from the provinces ─────────────────────────────────────
  log('Drawing the land mask from the provinces…');
  const topology = JSON.parse(
    readFileSync(join(DATA_DIR, 'geometry/provinces.topo.json'), 'utf8'),
  ) as Topology;
  const collection = topology.objects.provinces as GeometryCollection;
  let mask: Uint8Array = new Uint8Array(finest.cells * (finest.cellRows + 1));
  /** Per level: which tiles hold land (a land node or a corner of a province's outline). */
  const tileHasLand = Array.from(
    { length: layout.levels },
    (_, level) => new Uint8Array(terrainColumns(layout, level) * terrainRows(layout, level)),
  );
  const markTile = (x: number, z: number) => {
    // x, z in cells of the finest level.
    for (let level = 0; level < layout.levels; level++) {
      const scale = 2 ** (finestLevel - level) * layout.tileCells;
      const columns = terrainColumns(layout, level);
      const column = Math.min(columns - 1, Math.max(0, Math.floor(x / scale)));
      const row = Math.min(terrainRows(layout, level) - 1, Math.max(0, Math.floor(z / scale)));
      tileHasLand[level][row * columns + column] = 1;
    }
  };
  const clampLatitude = (latitude: number) =>
    Math.min(projection.northLatitude, Math.max(projection.southLatitude, latitude));
  for (const geometry of collection.geometries) {
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue;
    const shape = feature(topology, geometry) as unknown as Feature<Polygon | MultiPolygon>;
    const parts =
      shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates] : shape.geometry.coordinates;
    for (const part of parts) {
      const rings = part.map((ring) => {
        const points = new Float64Array((ring.length - 1) * 2);
        for (let i = 0; i < ring.length - 1; i++) {
          points[i * 2] = (ring[i][0] + 180) / finest.cellSize;
          points[i * 2 + 1] =
            (projectLatitude(projection.type, clampLatitude(ring[i][1])) - layout.minZ) /
            finest.cellSize;
          markTile(points[i * 2], points[i * 2 + 1]);
        }
        return points;
      });
      fillLandNodes(mask, finest, rings);
    }
  }
  for (let j = 0; j <= finest.cellRows; j++)
    for (let i = 0; i < finest.cells; i++) if (mask[j * finest.cells + i]) markTile(i, j);

  // ── Heights ───────────────────────────────────────────────────────────────
  log('Reading the elevation tiles…');
  const mosaic: ElevationMosaic = {
    width: worldPixels,
    height: (lastElevationRow + 1) * 256,
    metres: new Int16Array(worldPixels * (lastElevationRow + 1) * 256),
  };
  for (let y = 0; y <= lastElevationRow; y++) {
    for (let x = 0; x < 2 ** zoom; x++) {
      const { width, height, rgb } = decodePngRgb(readFileSync(elevationTilePath(zoom, x, y)));
      if (width !== 256 || height !== 256) throw new Error(`elevation tile ${x}/${y} is not 256²`);
      for (let row = 0; row < 256; row++) {
        const target = (y * 256 + row) * worldPixels + x * 256;
        for (let column = 0; column < 256; column++) {
          const p = (row * 256 + column) * 3;
          // "Terrarium" encoding: metres = red × 256 + green + blue / 256 − 32768.
          mosaic.metres[target + column] = Math.round(
            rgb[p] * 256 + rgb[p + 1] + rgb[p + 2] / 256 - 32768,
          );
        }
      }
    }
  }
  log('Sampling the heights…');
  let heights = sampleHeights(mosaic, finest, mask, latitudeOfRow(finest));

  // ── Land cover ────────────────────────────────────────────────────────────
  log(`Counting the land cover (${landCoverTiles.length} tiles)…`);
  const classOfCode = new Uint8Array(256);
  for (const [code, name] of Object.entries(WORLDCOVER_CLASSES))
    classOfCode[Number(code)] = LAND_COVER_CLASSES.indexOf(name);
  const { overviewSize, tileDegrees } = settings.landCover;
  let counts: Uint8Array | Uint16Array = new Uint8Array(
    finest.cells * finest.cellRows * CLASS_COUNT,
  );
  const cellColumn = new Int32Array(overviewSize);
  const cellRow = new Int32Array(overviewSize);
  for (const tile of landCoverTiles) {
    for (let p = 0; p < overviewSize; p++) {
      const longitude = tile.westLongitude + ((p + 0.5) * tileDegrees) / overviewSize;
      const latitude = tile.southLatitude + tileDegrees - ((p + 0.5) * tileDegrees) / overviewSize;
      cellColumn[p] =
        ((Math.floor((longitude + 180) / finest.cellSize) % finest.cells) + finest.cells) %
        finest.cells;
      const inside = latitude > projection.southLatitude && latitude < projection.northLatitude;
      const row = Math.floor(
        (projectLatitude(projection.type, clampLatitude(latitude)) - layout.minZ) / finest.cellSize,
      );
      cellRow[p] = inside && row >= 0 && row < finest.cellRows ? row : -1;
    }
    if (cellRow.every((row) => row < 0)) continue;
    const pixels = readLandCover(tile);
    if (pixels.length !== overviewSize * overviewSize)
      throw new Error(`land cover tile ${tile.name} has the wrong size`);
    for (let y = 0; y < overviewSize; y++) {
      const row = cellRow[y];
      if (row < 0) continue;
      for (let x = 0; x < overviewSize; x++) {
        const kind = classOfCode[pixels[y * overviewSize + x]];
        if (kind === 0) continue;
        const index = (row * finest.cells + cellColumn[x]) * CLASS_COUNT + kind;
        if (counts[index] < 255) counts[index] += 1;
      }
    }
  }

  // ── Every level, finest first ─────────────────────────────────────────────
  const levels: LevelData[] = [];
  let grid = finest;
  for (let level = finestLevel; level >= 0; level--) {
    log(`Building level ${level} (${grid.cells} × ${grid.cellRows} cells)…`);
    const { cover, mix } = coverFromCounts(counts, grid, mask, latitudeOfRow(grid));
    if (level >= settings.tiles.mixedCoverLevels) {
      // The fine levels keep only the main class (see `mixedCoverLevels`).
      for (let index = 0; index < cover.length; index++) cover[index] = (cover[index] & 15) * 17;
      mix.fill(0);
    }
    levels[level] = { grid, heights, cover, mix };
    if (level === 0) break;
    const coarse = levelGrid(layout, level - 1);
    counts = coarserCounts(counts, grid, coarse);
    heights = coarserHeights(heights, grid, coarse);
    mask = coarserMask(mask, grid, coarse);
    grid = coarse;
  }

  // ── Tiles ─────────────────────────────────────────────────────────────────
  log('Writing the tiles…');
  rmSync(TERRAIN_TILE_DIR, { recursive: true, force: true });
  const hash = createHash('sha1');
  const manifestLevels: { tiles: string[] }[] = [];
  const sizes: { tiles: number; bytes: number }[] = [];
  let minHeight = 0;
  let maxHeight = 0;
  for (const value of levels[finestLevel].heights) {
    if (value < minHeight) minHeight = value;
    if (value > maxHeight) maxHeight = value;
  }
  for (let level = 0; level < layout.levels; level++) {
    const columns = terrainColumns(layout, level);
    const rows = terrainRows(layout, level);
    const names: string[] = [];
    let bytes = 0;
    mkdirSync(join(TERRAIN_TILE_DIR, String(level)), { recursive: true });
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (!tileHasLand[level][row * columns + column]) continue;
        const tile = cutTile(levels[level], layout.tileCells, column, row);
        const packed = deflateSync(encodeTerrainTile(tile, layout.tileCells), { level: 9 });
        const name = terrainTileName(column, row);
        writeFileSync(join(TERRAIN_TILE_DIR, String(level), `${name}.bin`), packed);
        hash.update(name).update(packed);
        names.push(name);
        bytes += packed.length;
      }
    }
    manifestLevels.push({ tiles: names });
    sizes.push({ tiles: names.length, bytes });
  }
  const manifest: TerrainTilesFile = {
    version: hash.digest('hex').slice(0, 10),
    projection,
    baseCells: layout.baseCells,
    tileCells: layout.tileCells,
    minHeightM: minHeight,
    maxHeightM: maxHeight,
    levels: manifestLevels,
  };
  const levelLines = manifestLevels.map((level) => `    ${JSON.stringify(level)}`).join(',\n');
  const { levels: _levels, ...head } = manifest;
  writeFileSync(
    TERRAIN_TILES_FILE,
    `${JSON.stringify(head, null, 2).slice(0, -2)},\n  "levels": [\n${levelLines}\n  ]\n}\n`,
  );

  // ── Rivers ────────────────────────────────────────────────────────────────
  log('Writing the rivers…');
  const { simplifyDegrees, unitsPerDegree } = settings.rivers;
  const riverRows: string[] = [];
  let riverPoints = 0;
  const source = riversSource as {
    features: {
      properties: { strokeweig?: number | null } | null;
      geometry: { type: string; coordinates: number[][] | number[][][] } | null;
    }[];
  };
  for (const river of source.features) {
    if (!river.geometry) continue;
    const lines =
      river.geometry.type === 'MultiLineString'
        ? (river.geometry.coordinates as number[][][])
        : river.geometry.type === 'LineString'
          ? [river.geometry.coordinates as number[][]]
          : [];
    const weight = river.properties?.strokeweig ?? 0.2;
    for (const line of lines) {
      const inside = line.filter(
        ([, latitude]) =>
          latitude > projection.southLatitude && latitude < projection.northLatitude,
      );
      const simplified = simplifyLine(inside.flat(), simplifyDegrees);
      // Whole units; each point after the first is stored as its step from the one before.
      const packed: number[] = [];
      let lastX = 0;
      let lastY = 0;
      for (let i = 0; i < simplified.length; i += 2) {
        const x = Math.round(simplified[i] * unitsPerDegree);
        const y = Math.round(simplified[i + 1] * unitsPerDegree);
        if (i > 0 && x === lastX && y === lastY) continue;
        packed.push(x - lastX, y - lastY);
        lastX = x;
        lastY = y;
      }
      if (packed.length < 4) continue;
      riverPoints += packed.length / 2;
      riverRows.push(`    ${JSON.stringify({ weight, points: packed })}`);
    }
  }
  writeFileSync(
    RIVERS_FILE,
    `{\n  "unitsPerDegree": ${unitsPerDegree},\n  "rivers": [\n${riverRows.join(',\n')}\n  ]\n}\n`,
  );

  // ── Report ────────────────────────────────────────────────────────────────
  mkdirSync(REPORT_DIR, { recursive: true });
  const previewLevel = Math.min(1, finestLevel);
  writeFileSync(join(REPORT_DIR, 'terrain.png'), previewPicture(levels[previewLevel]));
  const totalBytes = sizes.reduce((sum, size) => sum + size.bytes, 0);
  const totalTiles = sizes.reduce((sum, size) => sum + size.tiles, 0);
  const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1);
  const shares = new Float64Array(CLASS_COUNT);
  let landCells = 0;
  {
    const { grid: g, cover } = levels[finestLevel];
    const m = finestMask(levels[finestLevel]);
    for (let index = 0; index < g.cells * g.cellRows; index++) {
      if (!m[index]) continue;
      shares[cover[index] & 15] += 1;
      landCells += 1;
    }
  }
  const report = [
    '# Terrain import report',
    '',
    'Made by `npm run import:terrain`. Do not edit by hand.',
    '',
    `- Tiles version: \`${manifest.version}\``,
    `- Projection: ${projection.type}, ${projection.southLatitude}° to ${projection.northLatitude}°`,
    `- Heights: ${minHeight} m to ${maxHeight} m`,
    `- Tiles: ${totalTiles} files, ${megabytes(totalBytes)} MB in all`,
    `- Rivers: ${riverRows.length} lines, ${riverPoints} points`,
    '',
    '| Level | Cells around the world | Metres per cell at the equator | Tiles | Size |',
    '|---|---|---|---|---|',
    ...sizes.map(
      (size, level) =>
        `| ${level} | ${layout.baseCells * 2 ** level} | ${Math.round((360 / (layout.baseCells * 2 ** level)) * METRES_PER_MAP_UNIT)} | ${size.tiles} | ${megabytes(size.bytes)} MB |`,
    ),
    '',
    '| Land cover (finest level, main class) | Share of the land |',
    '|---|---|',
    ...LAND_COVER_CLASSES.map(
      (name, kind) =>
        `| ${name} | ${((100 * shares[kind]) / Math.max(1, landCells)).toFixed(1)} % |`,
    ),
    '',
  ];
  writeFileSync(join(REPORT_DIR, 'terrain-report.md'), report.join('\n'));
  log(report.slice(4, 10 + sizes.length + 3).join('\n'));
  return { tiles: totalTiles, megabytes: totalBytes / 1e6, rivers: riverRows.length };
}

/** Which cells of a level are land: where the height data has any land corner (heights at sea are 0). */
function finestMask(data: LevelData): Uint8Array {
  const { cells, cellRows } = data.grid;
  const mask = new Uint8Array(cells * cellRows);
  for (let j = 0; j < cellRows; j++)
    for (let i = 0; i < cells; i++) {
      const east = (i + 1) % cells;
      if (
        data.heights[j * cells + i] !== 0 ||
        data.heights[j * cells + east] !== 0 ||
        data.heights[(j + 1) * cells + i] !== 0 ||
        data.heights[(j + 1) * cells + east] !== 0
      )
        mask[j * cells + i] = 1;
    }
  return mask;
}

/** A small shaded picture of one level, to check the result without opening the game. */
function previewPicture(data: LevelData): Buffer {
  const { cells, cellRows, cellSize } = data.grid;
  const land = finestMask(data);
  const rgba = new Uint8Array(cells * cellRows * 4);
  const slope = 24 / METRES_PER_MAP_UNIT / cellSize;
  for (let j = 0; j < cellRows; j++) {
    for (let i = 0; i < cells; i++) {
      const out = ((cellRows - 1 - j) * cells + i) * 4;
      rgba[out + 3] = 255;
      if (!land[j * cells + i]) {
        rgba.set([24, 48, 74], out);
        continue;
      }
      const east = (i + 1) % cells;
      const h00 = data.heights[j * cells + i];
      const h10 = data.heights[j * cells + east];
      const h01 = data.heights[(j + 1) * cells + i];
      const h11 = data.heights[(j + 1) * cells + east];
      const dx = ((h10 + h11 - h00 - h01) / 2) * slope;
      const dz = ((h01 + h11 - h00 - h10) / 2) * slope;
      // Light from the north-west.
      const length = Math.hypot(dx, dz, 1);
      const shade = Math.min(
        1.6,
        Math.max(0.35, 1 + 1.15 * ((0.5 * dx - 0.5 * dz + 0.707) / length - 0.707)),
      );
      const cover = data.cover[j * cells + i];
      const a = PREVIEW_COLORS[cover & 15];
      const b = PREVIEW_COLORS[cover >> 4];
      const t = data.mix[j * cells + i] / 15;
      for (let k = 0; k < 3; k++)
        rgba[out + k] = Math.min(255, Math.round((a[k] + (b[k] - a[k]) * t) * shade));
    }
  }
  return encodePng(cells, cellRows, rgba);
}
