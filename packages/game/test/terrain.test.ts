/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  METRES_PER_MAP_UNIT,
  type TerrainTileData,
  buildWorldMap,
  decodeTerrainTile,
  encodeTerrainTile,
  parseGameData,
  terrainColumns,
  terrainLayout,
  terrainRows,
  terrainTileName,
  terrainTileSizes,
} from '@terra-scutum/sim';
import type { Objects, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import provincesText from '../../../data/geometry/provinces.topo.json?raw';
import {
  LINE_COAST,
  LINE_OTHER_COUNTRY,
  buildProvinceBorders,
  decodePolygons,
  updateBorderKinds,
} from '../src/render/map/map-geometry';
import { createMapProjection } from '../src/render/map/map-projection';
import { createShapeLookup } from '../src/render/map/shape-lookup';
import {
  levelForResolution,
  parentTile,
  tileBounds,
  tilesInView,
} from '../src/render/terrain/terrain-grid';
import { buildTileFill, buildTileLines, drapeLines } from '../src/render/terrain/terrain-mesh';
import {
  buildGroundPixels,
  buildSlopePixels,
  createTileSurface,
  surfaceHeight,
} from '../src/render/terrain/terrain-surface';
import { RAW_GAME_DATA } from '../src/worker/game-data';

// These tests run on the real map and the real terrain tiles.
type MapTopology = Topology<Objects<Record<string, never>>>;
const data = parseGameData(RAW_GAME_DATA);
const world = buildWorldMap(data);
const projection = createMapProjection(data.mapView.projection);
const layout = terrainLayout(data.terrainTiles);
const topology = JSON.parse(provincesText) as MapTopology;
const provinceIndex = (id: string) => world.provinceIndex.get(id)!;
const polygons = decodePolygons(topology, 'provinces', provinceIndex, projection);
const lookup = createShapeLookup(polygons, projection);
const borders = buildProvinceBorders(
  topology,
  'provinces',
  provinceIndex,
  world.provinceCountry,
  world.provinceRegion,
  projection,
);
const meshStep = data.mapView.terrain.meshSteps.at(-1)!;

function readTile(level: number, column: number, row: number): TerrainTileData | null {
  const name = terrainTileName(column, row);
  if (!data.terrainTiles.levels[level].tiles.includes(name)) return null;
  const file = new URL(`../public/terrain/${level}/${name}.bin`, import.meta.url);
  return decodeTerrainTile(new Uint8Array(inflateSync(readFileSync(file))), layout.tileCells);
}

/** The tile of a level that holds a longitude/latitude. */
function tileAt(level: number, longitude: number, latitude: number) {
  const [tile] = tilesInView(layout, level, {
    minX: projection.x(longitude),
    maxX: projection.x(longitude),
    minZ: projection.z(latitude),
    maxZ: projection.z(latitude),
  });
  return tile;
}

describe('terrain tiles', () => {
  it('packs and unpacks a tile without loss', () => {
    const { nodes, cells } = terrainTileSizes(16);
    const tile: TerrainTileData = {
      heights: Int16Array.from({ length: nodes }, (_, i) => ((i * 7919) % 9000) - 400),
      cover: Uint8Array.from({ length: cells }, (_, i) => (i * 31) % 192),
      coverMix: Uint8Array.from({ length: cells }, (_, i) => i % 16),
    };
    const unpacked = decodeTerrainTile(encodeTerrainTile(tile, 16), 16);
    expect(unpacked).toEqual(tile);
    expect(() => decodeTerrainTile(new Uint8Array(10), 16)).toThrow();
  });

  it('has every tile the list names, and real mountains in them', () => {
    expect(data.terrainTiles.levels.length).toBe(5);
    expect(data.terrainTiles.maxHeightM).toBeGreaterThan(7000);
    // Mont Blanc (4,806 m) at the finest level: well above 3,500 m even at 2.4 km per sample.
    const level = layout.levels - 1;
    const tile = tileAt(level, 6.865, 45.833);
    const surface = createTileSurface(layout, tile, readTile(level, tile.column, tile.row), 1);
    expect(surface.cells).toBe(layout.tileCells);
    const height = surfaceHeight(surface, projection.x(6.865), projection.z(45.833));
    expect(height).toBeGreaterThan(3200);
    expect(height).toBeLessThan(4900);
    // The sea is flat: the middle of the Gulf of Genoa.
    const sea = tileAt(level, 9.0, 43.7);
    const seaSurface = createTileSurface(layout, sea, readTile(level, sea.column, sea.row), 1);
    expect(surfaceHeight(seaSurface, projection.x(9.0), projection.z(43.7))).toBe(0);
  });

  it('chooses finer levels for closer zooms, and finds the tiles of a view', () => {
    const { pixelsPerSample, maxLevel } = data.mapView.terrain;
    const levelAt = (unitsPerPixel: number) =>
      levelForResolution(layout, unitsPerPixel, pixelsPerSample, maxLevel);
    expect(levelAt(0.19)).toBe(0);
    expect(levelAt(0.19 / 4)).toBe(2);
    expect(levelAt(0.19 / 80)).toBe(4);
    expect(levelForResolution(layout, 0.0001, pixelsPerSample, 2)).toBe(2);
    // A view across the date line asks for tiles on both copies of the world.
    const tiles = tilesInView(layout, 0, { minX: 170, maxX: 190, minZ: 0, maxZ: 1 });
    expect(tiles.map((tile) => [tile.column, tile.shift])).toEqual([
      [3, 0],
      [0, 1],
    ]);
    expect(parentTile({ level: 3, column: 5, row: 9 })).toEqual({ level: 2, column: 2, row: 4 });
    const bounds = tileBounds(layout, 1, 3, 2);
    expect(bounds.size).toBe(45);
    expect(bounds.minX).toBe(-45);
  });
});

describe('the land on the terrain', () => {
  // The western Alps at the finest level: France, Switzerland and Italy meet here.
  const level = layout.levels - 1;
  const address = tileAt(level, 7.5, 45.9);
  const tile = readTile(level, address.column, address.row);
  const surface = createTileSurface(layout, address, tile, meshStep);
  const fill = buildTileFill(polygons, surface);

  it('covers exactly the provinces inside the tile, province by province', () => {
    // Area per province from the triangles…
    const fromTriangles = new Map<number, number>();
    const { positions, indices, vertexItems } = fill;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
      const area =
        Math.abs(
          (positions[b * 3] - positions[a * 3]) * (positions[c * 3 + 2] - positions[a * 3 + 2]) -
            (positions[c * 3] - positions[a * 3]) * (positions[b * 3 + 2] - positions[a * 3 + 2]),
        ) / 2;
      const item = vertexItems[a];
      expect(vertexItems[b]).toBe(item);
      expect(vertexItems[c]).toBe(item);
      fromTriangles.set(item, (fromTriangles.get(item) ?? 0) + area);
    }
    // …against counting sample points with the map's own "which province is here?".
    const samples = 400;
    const fromSamples = new Map<number, number>();
    const cell = surface.size / samples;
    for (let j = 0; j < samples; j++)
      for (let i = 0; i < samples; i++) {
        const item = lookup.find(surface.minX + (i + 0.5) * cell, surface.minZ + (j + 0.5) * cell);
        if (item >= 0) fromSamples.set(item, (fromSamples.get(item) ?? 0) + cell * cell);
      }
    expect(fromTriangles.size).toBeGreaterThan(5);
    const total = (areas: Map<number, number>) => [...areas.values()].reduce((a, b) => a + b, 0);
    expect(total(fromTriangles)).toBeCloseTo(total(fromSamples), 1);
    for (const [item, area] of fromSamples) {
      if (area < 0.2) continue;
      expect(fromTriangles.get(item)! / area).toBeGreaterThan(0.98);
      expect(fromTriangles.get(item)! / area).toBeLessThan(1.02);
    }
    expect(indices.length / 3).toBeLessThan(40_000);
  });

  it('puts every corner on the surface and inside the tile', () => {
    const { positions } = fill;
    let highest = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      expect(x).toBeGreaterThanOrEqual(surface.minX - 1e-4);
      expect(x).toBeLessThanOrEqual(surface.minX + surface.size + 1e-4);
      const metres = positions[i + 1] * METRES_PER_MAP_UNIT;
      expect(Math.abs(metres - surfaceHeight(surface, x, z))).toBeLessThan(25);
      highest = Math.max(highest, metres);
    }
    expect(highest).toBeGreaterThan(3000);
  });

  it('lays the border lines on the surface, each piece in exactly one tile', () => {
    const lines = buildTileLines(borders, surface);
    expect(lines.borders.length).toBeGreaterThan(8);
    for (let i = 0; i < lines.positions.length; i += 3) {
      const x = lines.positions[i];
      const z = lines.positions[i + 2];
      const metres = lines.positions[i + 1] * METRES_PER_MAP_UNIT;
      expect(Math.abs(metres - surfaceHeight(surface, x, z))).toBeLessThan(25);
    }
    // Over a whole level, the pieces add up to the borders' full length: nothing twice, nothing missing.
    const lengthOf = (geometry: { positions: Float32Array; indices: Uint32Array }) => {
      let sum = 0;
      for (let i = 0; i < geometry.indices.length; i += 6) {
        const a = geometry.indices[i] * 3;
        const b = geometry.indices[i + 2] * 3;
        sum += Math.hypot(
          geometry.positions[b] - geometry.positions[a],
          geometry.positions[b + 2] - geometry.positions[a + 2],
        );
      }
      return sum;
    };
    let draped = 0;
    for (let row = 0; row < terrainRows(layout, 0); row++)
      for (let column = 0; column < terrainColumns(layout, 0); column++)
        draped += lengthOf(
          buildTileLines(borders, createTileSurface(layout, { level: 0, column, row }, null, 8)),
        );
    let full = 0;
    for (const line of borders)
      for (let i = 0; i + 3 < line.points.length; i += 2)
        full += Math.hypot(
          line.points[i + 2] - line.points[i],
          line.points[i + 3] - line.points[i + 1],
        );
    expect(draped / full).toBeGreaterThan(0.9999);
    expect(draped / full).toBeLessThan(1.0001);
  });

  it('turns province borders into country borders when a province changes owner', () => {
    // The two coarsest tiles that hold western Europe, as the game builds them.
    const geometries = [1, 2].map((column) =>
      buildTileLines(borders, createTileSurface(layout, { level: 0, column, row: 1 }, null, 8)),
    );
    const owners = world.provinceCountry.slice();
    const update = () =>
      geometries
        .map((geometry) => updateBorderKinds(geometry, owners, world.provinceRegion))
        .some(Boolean);
    expect(update()).toBe(false);
    const kindsBetween = (a: number, b: number) => {
      const kinds = new Set<number>();
      for (const { borders: spans, sideAndKind } of geometries)
        for (let i = 0; i < spans.length; i += 4) {
          const [sideA, sideB] = [spans[i + 2], spans[i + 3]];
          if (!(sideA === a && sideB === b) && !(sideA === b && sideB === a)) continue;
          for (let v = spans[i]; v < spans[i] + spans[i + 1]; v++)
            kinds.add(sideAndKind[v * 2 + 1]);
        }
      return [...kinds];
    };
    const p = (id: string) => world.provinceIndex.get(id)!;
    const [alsace, baden, french] = [
      p('fra_grand_est'),
      p('deu_baden_wurttemberg'),
      p('fra_bourgogne_franche_comte'),
    ];
    const country = (k: number) => (k & LINE_OTHER_COUNTRY) !== 0;
    expect(kindsBetween(alsace, baden).every(country)).toBe(true);
    expect(kindsBetween(alsace, french).some(country)).toBe(false);

    // Germany takes the province: the border moves to its other side.
    owners[alsace] = world.provinceCountry[baden];
    expect(update()).toBe(true);
    expect(kindsBetween(alsace, baden).some(country)).toBe(false);
    expect(kindsBetween(alsace, french).every(country)).toBe(true);
    // Nothing else to do the second time; region borders and coasts never change.
    expect(update()).toBe(false);
    const coast = p('fra_bretagne');
    expect(kindsBetween(coast, coast)).toEqual([LINE_COAST]);
  });

  it('lays a free line on the land in short pieces', () => {
    const line = { points: new Float32Array([0, 0, 10, 0, 10, 5]), kind: 0 };
    const draped = drapeLines([line], (x) => x * 100, 0.5);
    // 20 + 10 pieces: 31 points, two vertices each.
    expect(draped.positions.length / 3).toBe(62);
    expect(draped.positions[draped.positions.length - 2]).toBeCloseTo(1000 / METRES_PER_MAP_UNIT);
  });

  it('makes the pictures the land shader reads', () => {
    const slopes = buildSlopePixels(layout, level, tile);
    expect(slopes.length).toBe((layout.tileCells + 1) ** 2 * 4);
    // Mountains: clearly sloped pixels on both sides of flat (128).
    let steepest = 0;
    for (let i = 0; i < slopes.length; i += 4)
      steepest = Math.max(steepest, Math.abs(slopes[i] - 128));
    expect(steepest).toBeGreaterThan(40);
    expect(buildSlopePixels(layout, level, null)[0]).toBe(128);
    const materials = Object.values(data.mapView.terrain.materials).map((material) => ({
      color: [1, 3, 5].map((i) => Number.parseInt(material.color.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ],
      roughness: material.roughness,
    }));
    const ground = buildGroundPixels(layout, tile, materials);
    expect(ground.length).toBe((layout.tileCells + 4) ** 2 * 4);
    const colors = new Set<number>();
    for (let i = 0; i < ground.length; i += 4)
      colors.add((ground[i] << 16) | (ground[i + 1] << 8) | ground[i + 2]);
    // Forest, farmland, snow, bare rock…: several ground materials in the Alps.
    expect(colors.size).toBeGreaterThan(4);
  });
});
