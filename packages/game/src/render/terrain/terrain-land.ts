import type { Material } from '@babylonjs/core/Materials/material';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  TERRAIN_WORLD_WIDTH,
  type TerrainLayout,
  type TerrainTileData,
  type TerrainTilesFile,
  type TerrainViewConfig,
  decodeTerrainTile,
  terrainColumns,
  terrainLayout,
  terrainRows,
  terrainTileName,
  terrainTileSize,
} from '@terra-scutum/sim';
import {
  type LineGeometry,
  type MapPolygon,
  type StyledLine,
  updateBorderKinds,
} from '../map/map-geometry';
import {
  type ColorTable,
  createFillMesh,
  createLineMesh,
  createPictureTexture,
  uploadLineKinds,
} from '../map/map-meshes';
import { type LandLight, type LandLook, applyLandLook, createLandMaterial } from './land-material';
import {
  type PlacedTile,
  levelForResolution,
  tileBounds,
  tileKey,
  tilesInView,
} from './terrain-grid';
import { buildTileFill, buildTileLines } from './terrain-mesh';
import {
  type GroundMaterial,
  type TileSurface,
  buildGroundPixels,
  buildSlopePixels,
  createTileSurface,
  surfaceHeight,
} from './terrain-surface';

/**
 * The land of the world map on real terrain (F125): loads terrain tiles as
 * the view needs them, builds each tile's land (the provinces cut into the
 * terrain, the border lines and rivers lying on it) and decides which tiles
 * are drawn.
 *
 * - The level drawn follows the zoom (`levelForResolution`); the tiles of
 *   that level that touch the view are fetched, nearest first.
 * - Until all the tiles a coarser tile covers are ready, the coarser tile is
 *   drawn instead (level 0 is loaded before the map appears, so there is
 *   always something to draw).
 * - Building happens a little every frame (`buildMsPerFrame`), so the game
 *   keeps moving while terrain arrives; tiles not used for a while are dropped.
 */
export interface TerrainShapes {
  readonly polygons: readonly MapPolygon[];
  readonly borders: readonly StyledLine[];
}

export interface TerrainLandOptions {
  readonly scene: Scene;
  readonly tiles: TerrainTilesFile;
  readonly config: TerrainViewConfig;
  readonly provinceTable: ColorTable;
  readonly borderMaterial: Material;
  readonly riverMaterial: Material;
  readonly renderingGroup: number;
  /** The province shapes and borders a level is drawn from (simplified for the coarse levels). */
  shapesFor(level: number): TerrainShapes;
  /** The rivers shown at a level. */
  riversFor(level: number): readonly StyledLine[];
  /** Who owns each province now, and each province's region: for the kind of each border. */
  owners(): Uint16Array;
  readonly regionOf: ArrayLike<number>;
}

export interface TerrainView {
  /** The ground the screen shows, in map units; x may run past the world's edges. */
  readonly rect: { minX: number; maxX: number; minZ: number; maxZ: number };
  readonly unitsPerPixel: number;
  readonly centerX: number;
  readonly centerZ: number;
}

export interface TerrainStats {
  /** The terrain level the zoom asks for (0 = coarsest). */
  readonly level: number;
  /** Tiles on screen right now, and how many the view still waits for. */
  readonly drawn: number;
  readonly pending: number;
  /** Tiles kept ready, and how many were built since the map started. */
  readonly ready: number;
  readonly built: number;
  /** The longest a single tile took to build, in milliseconds. */
  readonly slowestBuildMs: number;
}

export interface TerrainLand {
  /** Loads and builds the whole coarsest level. */
  preload(): Promise<void>;
  /** The view changed: decide what to draw and what to fetch. Returns true if what is drawn changed. */
  update(view: TerrainView): boolean;
  /** Once per frame: builds terrain that arrived. Returns true if a tile became ready. */
  tick(): boolean;
  setLook(look: LandLook): void;
  /** The height of the land as drawn right now at a map position, in metres (0 at sea). */
  heightAt(x: number, z: number): number;
  /** The size of the mesh cells of the finest level drawn right now, in map units. */
  cellSize(): number;
  /** Border kinds follow the owners: call when they changed. */
  ownersChanged(): void;
  stats(): TerrainStats;
  dispose(): void;
}

type TileState = 'new' | 'loading' | 'decoded' | 'ready' | 'empty' | 'failed';

interface Tile {
  readonly key: string;
  readonly level: number;
  readonly column: number;
  readonly row: number;
  state: TileState;
  /** The tile's file content; null for a tile without a file (flat land). */
  data: TerrainTileData | null;
  polygons: MapPolygon[];
  surface: TileSurface | null;
  material: ShaderMaterial | null;
  textures: BaseTexture[];
  /** The tile's meshes, once per copy of the world it is drawn on: [fill, borders, rivers]. */
  copies: Mesh[][];
  borders: { mesh: Mesh; geometry: LineGeometry } | null;
  lastUsed: number;
  retryAt: number;
}

interface BoundedLine {
  readonly line: StyledLine;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const MAX_FETCHES = 6;
const RETRY_MS = 4000;

function boundsOfLines(lines: readonly StyledLine[]): BoundedLine[] {
  return lines.map((line) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < line.points.length; i += 2) {
      minX = Math.min(minX, line.points[i]);
      maxX = Math.max(maxX, line.points[i]);
      minZ = Math.min(minZ, line.points[i + 1]);
      maxZ = Math.max(maxZ, line.points[i + 1]);
    }
    return { line, minX, maxX, minZ, maxZ };
  });
}

async function fetchTile(url: string, tileCells: number): Promise<TerrainTileData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  // The file is zlib-compressed; the browser unpacks it.
  const unpacked = response.body!.pipeThrough(new DecompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(unpacked).arrayBuffer());
  return decodeTerrainTile(bytes, tileCells);
}

export function createTerrainLand(options: TerrainLandOptions): TerrainLand {
  const { scene, config } = options;
  const layout: TerrainLayout = terrainLayout(options.tiles);
  const hasFile = options.tiles.levels.map((level) => new Set(level.tiles));
  const materials: GroundMaterial[] = Object.values(config.materials).map((material) => ({
    color: [1, 3, 5].map((i) => Number.parseInt(material.color.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ],
    roughness: material.roughness,
  }));
  const azimuth = (config.lightAzimuthDegrees * Math.PI) / 180;
  const elevation = (config.lightElevationDegrees * Math.PI) / 180;
  const light: LandLight = {
    direction: [
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation),
    ],
    strength: config.shadingStrength,
    shadeMin: config.shadeMin,
    shadeMax: config.shadeMax,
  };
  /** A mesh corner every this many height samples, at a level. */
  const meshStep = (level: number) =>
    config.meshSteps[Math.min(level, config.meshSteps.length - 1)];
  let look: LandLook = { heightScale: 1, colorStrength: 1, detailStrength: 0, wander: 0 };

  const tiles = new Map<string, Tile>();
  const lineBounds = new WeakMap<readonly StyledLine[], BoundedLine[]>();
  const linesIn = (lines: readonly StyledLine[], tile: Tile): StyledLine[] => {
    let bounded = lineBounds.get(lines);
    if (!bounded) lineBounds.set(lines, (bounded = boundsOfLines(lines)));
    const { minX, minZ, size } = tileBounds(layout, tile.level, tile.column, tile.row);
    const found: StyledLine[] = [];
    for (const item of bounded)
      if (
        item.maxX >= minX &&
        item.minX <= minX + size &&
        item.maxZ >= minZ &&
        item.minZ <= minZ + size
      )
        found.push(item.line);
    return found;
  };

  let frame = 0;
  let fetching = 0;
  let built = 0;
  let slowestBuildMs = 0;
  let wantedLevel = 0;
  let wanted: PlacedTile[] = [];
  let view: TerrainView | null = null;
  /** What is drawn right now: tile and copy of the world. */
  let drawn: { tile: Tile; shift: number }[] = [];
  let drawnKey = '';
  const drawnTiles = new Map<string, Tile>();
  let drawnMaxLevel = 0;
  let disposed = false;

  const getTile = (level: number, column: number, row: number): Tile => {
    const key = tileKey(level, column, row);
    let tile = tiles.get(key);
    if (!tile) {
      const { minX, minZ, size } = tileBounds(layout, level, column, row);
      const polygons = options
        .shapesFor(level)
        .polygons.filter(
          (polygon) =>
            polygon.maxX > minX &&
            polygon.minX < minX + size &&
            polygon.maxZ > minZ &&
            polygon.minZ < minZ + size,
        );
      tile = {
        key,
        level,
        column,
        row,
        // No province reaches into the tile: nothing to draw, ever.
        state: polygons.length === 0 ? 'empty' : 'new',
        data: null,
        polygons,
        surface: null,
        material: null,
        textures: [],
        copies: [],
        borders: null,
        lastUsed: frame,
        retryAt: 0,
      };
      tiles.set(key, tile);
    }
    return tile;
  };
  const isDone = (tile: Tile) => tile.state === 'ready' || tile.state === 'empty';

  const load = (tile: Tile): Promise<void> => {
    const name = terrainTileName(tile.column, tile.row);
    if (!hasFile[tile.level].has(name)) {
      // A tile without a file is flat, bare land (a speck of an island).
      tile.data = null;
      tile.state = 'decoded';
      return Promise.resolve();
    }
    tile.state = 'loading';
    fetching += 1;
    const url = new URL(
      `terrain/${tile.level}/${name}.bin?v=${options.tiles.version}`,
      document.baseURI,
    ).toString();
    return fetchTile(url, layout.tileCells).then(
      (data) => {
        fetching -= 1;
        tile.data = data;
        tile.state = 'decoded';
      },
      (error: unknown) => {
        fetching -= 1;
        console.warn('A terrain tile could not be loaded; trying again shortly.', error);
        tile.state = 'failed';
        tile.retryAt = performance.now() + RETRY_MS;
      },
    );
  };

  const prepareMesh = (mesh: Mesh) => {
    // Which tiles are drawn is decided here, from the view; the land's height would fool Babylon's own test.
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.setEnabled(false);
    return mesh;
  };

  const build = (tile: Tile): void => {
    const started = performance.now();
    const surface = createTileSurface(layout, tile, tile.data, meshStep(tile.level));
    const fill = buildTileFill(tile.polygons, surface);
    tile.surface = surface;
    if (fill.indices.length === 0) {
      tile.state = 'empty';
      return;
    }
    const name = `terrain-${tile.key}`;
    const slopes = createPictureTexture(
      `${name}-slopes`,
      scene,
      buildSlopePixels(layout, tile.level, tile.data),
      layout.tileCells + 1,
    );
    const ground = createPictureTexture(
      `${name}-ground`,
      scene,
      buildGroundPixels(layout, tile.data, materials),
      layout.tileCells + 4,
    );
    tile.textures = [slopes, ground];
    tile.material = createLandMaterial(
      `${name}-material`,
      scene,
      {
        colorTable: options.provinceTable.texture,
        slopeMap: slopes,
        groundMap: ground,
        minX: surface.minX,
        minZ: surface.minZ,
        size: surface.size,
        tileCells: layout.tileCells,
      },
      light,
      look,
    );
    const meshes = [
      prepareMesh(
        createFillMesh(
          `${name}-land`,
          scene,
          fill,
          options.provinceTable,
          tile.material,
          options.renderingGroup,
        ),
      ),
    ];
    const shapes = options.shapesFor(tile.level);
    const borders = buildTileLines(linesIn(shapes.borders, tile), surface);
    if (borders.indices.length > 0) {
      updateBorderKinds(borders, options.owners(), options.regionOf);
      const mesh = prepareMesh(
        createLineMesh(
          `${name}-borders`,
          scene,
          borders,
          options.borderMaterial,
          options.renderingGroup,
          1,
        ),
      );
      tile.borders = { mesh, geometry: borders };
      meshes.push(mesh);
    }
    const riverLines = options.riversFor(tile.level);
    if (riverLines.length > 0) {
      const rivers = buildTileLines(linesIn(riverLines, tile), surface);
      if (rivers.indices.length > 0)
        meshes.push(
          prepareMesh(
            createLineMesh(
              `${name}-rivers`,
              scene,
              rivers,
              options.riverMaterial,
              options.renderingGroup,
              0,
            ),
          ),
        );
    }
    tile.copies = [meshes];
    tile.state = 'ready';
    // The polygons were only needed to build; the list can be long.
    tile.polygons = [];
    built += 1;
    slowestBuildMs = Math.max(slowestBuildMs, performance.now() - started);
  };

  const unbuild = (tile: Tile): void => {
    for (const copy of tile.copies) for (const mesh of copy) mesh.dispose();
    tile.material?.dispose();
    for (const texture of tile.textures) texture.dispose();
    tiles.delete(tile.key);
  };

  /** How far a tile is from the middle of the view (for "nearest first"). */
  const distance = (placed: PlacedTile): number => {
    if (!view) return 0;
    const { minX, minZ, size } = tileBounds(layout, placed.level, placed.column, placed.row);
    return Math.hypot(
      minX + size / 2 + placed.shift * TERRAIN_WORLD_WIDTH - view.centerX,
      minZ + size / 2 - view.centerZ,
    );
  };

  const startLoads = (): void => {
    if (fetching >= MAX_FETCHES) return;
    const now = performance.now();
    const waiting = wanted
      .map((placed) => ({ placed, tile: getTile(placed.level, placed.column, placed.row) }))
      .filter(
        ({ tile }) => tile.state === 'new' || (tile.state === 'failed' && now >= tile.retryAt),
      )
      .sort((a, b) => distance(a.placed) - distance(b.placed));
    for (const { tile } of waiting) {
      if (fetching >= MAX_FETCHES) break;
      if (tile.state === 'loading' || tile.state === 'decoded') continue;
      void load(tile);
    }
  };

  /** Shows a tile's meshes on the copies of the world it is needed on, and no others. */
  const showCopies = (tile: Tile, shifts: readonly number[]): void => {
    while (tile.copies.length < shifts.length) {
      const index = tile.copies.length;
      tile.copies.push(
        tile.copies[0].map((mesh) => {
          const copy = mesh.clone(`${mesh.name}-copy${index}`);
          copy.renderingGroupId = mesh.renderingGroupId;
          copy.alphaIndex = mesh.alphaIndex;
          copy.isPickable = false;
          return prepareMesh(copy);
        }),
      );
    }
    tile.copies.forEach((copy, index) => {
      const shown = index < shifts.length;
      for (const mesh of copy) {
        mesh.setEnabled(shown);
        if (shown) mesh.position.x = shifts[index] * TERRAIN_WORLD_WIDTH;
      }
    });
  };

  /** Decides what to draw: the wanted tiles where they are ready, coarser ones in their place where not. */
  const resolve = (): boolean => {
    const next: { tile: Tile; shift: number }[] = [];
    let level = wantedLevel;
    let asked: PlacedTile[] = wanted;
    while (asked.length > 0) {
      // Tiles are replaced four at a time: a coarser tile gives way only when all it covers here is ready.
      const groups = new Map<string, PlacedTile[]>();
      for (const placed of asked) {
        const group = `${placed.column >> 1}_${placed.row >> 1}_${placed.shift}`;
        const list = groups.get(group);
        if (list) list.push(placed);
        else groups.set(group, [placed]);
      }
      const coarser: PlacedTile[] = [];
      for (const group of groups.values()) {
        const members = group.map((placed) => getTile(placed.level, placed.column, placed.row));
        if (level === 0 || members.every(isDone)) {
          members.forEach((tile, index) => {
            if (tile.state === 'ready') next.push({ tile, shift: group[index].shift });
          });
        } else {
          const [first] = group;
          coarser.push({
            level: level - 1,
            column: first.column >> 1,
            row: first.row >> 1,
            shift: first.shift,
          });
        }
      }
      asked = coarser;
      level -= 1;
    }
    const key = next
      .map(({ tile, shift }) => `${tile.key}@${shift}`)
      .sort()
      .join(' ');
    for (const { tile } of next) tile.lastUsed = frame;
    if (key === drawnKey) return false;
    drawnKey = key;
    const shiftsOf = new Map<Tile, number[]>();
    for (const { tile, shift } of next) {
      const list = shiftsOf.get(tile);
      if (list) list.push(shift);
      else shiftsOf.set(tile, [shift]);
    }
    for (const { tile } of drawn)
      if (!shiftsOf.has(tile) && tiles.has(tile.key)) showCopies(tile, []);
    for (const [tile, shifts] of shiftsOf) showCopies(tile, shifts);
    drawn = next;
    drawnTiles.clear();
    drawnMaxLevel = 0;
    for (const { tile } of next) {
      drawnTiles.set(tile.key, tile);
      drawnMaxLevel = Math.max(drawnMaxLevel, tile.level);
    }
    return true;
  };

  /** Drops the tiles that haven't been used for the longest, down to the limit. */
  const trim = (): void => {
    const kept = [...tiles.values()].filter((tile) => tile.state === 'ready' && tile.level > 0);
    if (kept.length <= config.cacheTiles) return;
    const inUse = new Set(drawn.map(({ tile }) => tile));
    for (const placed of wanted) inUse.add(getTile(placed.level, placed.column, placed.row));
    kept
      .filter((tile) => !inUse.has(tile))
      .sort((a, b) => a.lastUsed - b.lastUsed)
      .slice(0, kept.length - config.cacheTiles)
      .forEach(unbuild);
  };

  return {
    async preload() {
      const columns = terrainColumns(layout, 0);
      const rows = terrainRows(layout, 0);
      const all: Tile[] = [];
      for (let row = 0; row < rows; row++)
        for (let column = 0; column < columns; column++) all.push(getTile(0, column, row));
      await Promise.all(all.filter((tile) => tile.state === 'new').map(load));
      if (disposed) return;
      for (const tile of all) {
        if (tile.state === 'failed')
          throw new Error(`terrain tile ${tile.key} could not be loaded`);
        if (tile.state === 'decoded') build(tile);
      }
    },
    update(next) {
      frame += 1;
      view = next;
      wantedLevel = levelForResolution(
        layout,
        next.unitsPerPixel,
        config.pixelsPerSample,
        config.maxLevel,
      );
      wanted = tilesInView(layout, wantedLevel, next.rect);
      // A view that asks for very many tiles (a huge window): step back a level.
      while (wantedLevel > 0 && wanted.length > config.cacheTiles) {
        wantedLevel -= 1;
        wanted = tilesInView(layout, wantedLevel, next.rect);
      }
      for (const placed of wanted)
        getTile(placed.level, placed.column, placed.row).lastUsed = frame;
      startLoads();
      const changed = resolve();
      if (changed) trim();
      return changed;
    },
    tick() {
      if (!view) return false;
      const started = performance.now();
      const waiting = wanted
        .map((placed) => ({ placed, tile: getTile(placed.level, placed.column, placed.row) }))
        .filter(({ tile }) => tile.state === 'decoded')
        .sort((a, b) => distance(a.placed) - distance(b.placed));
      let ready = false;
      for (const { tile } of waiting) {
        if (tile.state !== 'decoded') continue;
        build(tile);
        ready = true;
        if (performance.now() - started >= config.buildMsPerFrame) break;
      }
      startLoads();
      return ready;
    },
    setLook(next) {
      if (
        next.heightScale === look.heightScale &&
        next.colorStrength === look.colorStrength &&
        next.detailStrength === look.detailStrength &&
        next.wander === look.wander
      )
        return;
      look = next;
      for (const tile of tiles.values()) if (tile.material) applyLandLook(tile.material, look);
    },
    heightAt(x, z) {
      const wrapped =
        ((((x + TERRAIN_WORLD_WIDTH / 2) % TERRAIN_WORLD_WIDTH) + TERRAIN_WORLD_WIDTH) %
          TERRAIN_WORLD_WIDTH) -
        TERRAIN_WORLD_WIDTH / 2;
      for (let level = drawnMaxLevel; level >= 0; level--) {
        const size = terrainTileSize(layout, level);
        const column = Math.min(
          terrainColumns(layout, level) - 1,
          Math.floor((wrapped + TERRAIN_WORLD_WIDTH / 2) / size),
        );
        const row = Math.floor((z - layout.minZ) / size);
        const tile = drawnTiles.get(tileKey(level, column, row));
        if (tile?.surface) return surfaceHeight(tile.surface, wrapped, z);
      }
      return 0;
    },
    cellSize: () =>
      (terrainTileSize(layout, drawnMaxLevel) / layout.tileCells) * meshStep(drawnMaxLevel),
    ownersChanged() {
      const owners = options.owners();
      for (const tile of tiles.values())
        if (tile.borders && updateBorderKinds(tile.borders.geometry, owners, options.regionOf))
          uploadLineKinds(tile.borders.mesh, tile.borders.geometry);
    },
    stats() {
      let ready = 0;
      for (const tile of tiles.values()) if (tile.state === 'ready') ready += 1;
      const pending = wanted.filter(
        (placed) => !isDone(getTile(placed.level, placed.column, placed.row)),
      ).length;
      return { level: wantedLevel, drawn: drawn.length, pending, ready, built, slowestBuildMs };
    },
    dispose() {
      disposed = true;
      for (const tile of [...tiles.values()]) unbuild(tile);
    },
  };
}
