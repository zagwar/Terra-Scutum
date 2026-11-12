import { buildWorldMap, neighborsOf, parseGameData } from '@terra-scutum/sim';
import type { Objects, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import provincesText from '../../../data/geometry/provinces.topo.json?raw';
import seaZonesText from '../../../data/geometry/sea_zones.topo.json?raw';
import {
  applyHighlight,
  assignRegionPalette,
  provinceBaseColors,
  seaZoneColors,
} from '../src/render/map/map-colors';
import {
  LINE_COAST,
  LINE_OTHER_COUNTRY,
  LINE_OTHER_REGION,
  buildInnerBorders,
  buildLineGeometry,
  buildProvinceBorders,
  chunkLines,
  chunkPolygons,
  createChunkGrid,
  decodePolygons,
  outlineOf,
  triangulate,
  wholeLine,
} from '../src/render/map/map-geometry';
import { createMapProjection } from '../src/render/map/map-projection';
import { createShapeLookup } from '../src/render/map/shape-lookup';
import { RAW_GAME_DATA } from '../src/worker/game-data';

// These tests run on the real map: all provinces and sea zones of the game.
type MapTopology = Topology<Objects<Record<string, never>>>;
const data = parseGameData(RAW_GAME_DATA);
const world = buildWorldMap(data);
const provinceTopology = JSON.parse(provincesText) as MapTopology;
const seaTopology = JSON.parse(seaZonesText) as MapTopology;
const projection = createMapProjection(data.mapView.projection);
const provinceIndex = (id: string) => world.provinceIndex.get(id)!;
const polygons = decodePolygons(provinceTopology, 'provinces', provinceIndex, projection);
const lookup = createShapeLookup(polygons, projection);
const borders = buildProvinceBorders(
  provinceTopology,
  'provinces',
  provinceIndex,
  world.provinceCountry,
  world.provinceRegion,
  projection,
);
const at = (longitude: number, latitude: number) => {
  const found = lookup.find(projection.x(longitude), projection.z(latitude));
  return found < 0 ? null : world.provinceIds[found];
};

describe('map shapes', () => {
  it('has a shape for every province and sea zone', () => {
    expect(new Set(polygons.map((p) => p.item)).size).toBe(world.provinceIds.length);
    const sea = decodePolygons(
      seaTopology,
      'seaZones',
      (id) => world.seaZoneIndex.get(id)!,
      projection,
    );
    expect(new Set(sea.map((p) => p.item)).size).toBe(world.seaZoneIds.length);
  });

  it('triangulates every polygon without losing area', () => {
    const fill = triangulate(polygons);
    expect(fill.vertexItems.length).toBe(fill.positions.length / 3);
    expect(Math.max(...fill.indices.subarray(0, 1000))).toBeLessThan(fill.vertexItems.length);

    const ringArea = (ring: Float32Array) => {
      let sum = 0;
      for (let i = 0, j = ring.length / 2 - 1; i < ring.length / 2; j = i++)
        sum += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
      return Math.abs(sum) / 2;
    };
    let outlineArea = 0;
    for (const polygon of polygons)
      polygon.rings.forEach((ring, i) => (outlineArea += (i === 0 ? 1 : -1) * ringArea(ring)));
    let triangleArea = 0;
    const { positions: p, indices } = fill;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3];
      triangleArea +=
        Math.abs((p[b] - p[a]) * (p[c + 2] - p[a + 2]) - (p[c] - p[a]) * (p[b + 2] - p[a + 2])) / 2;
    }
    expect(triangleArea / outlineArea).toBeCloseTo(1, 3);
  });
});

describe('picking (which province is at a point)', () => {
  it('finds well-known places', () => {
    expect(at(2.35, 48.86)).toBe('fra_ile_de_france'); // Paris
    expect(at(-95.4, 29.8)).toMatch(/^usa_texas/); // Houston
    expect(at(139.7, 35.7)).toMatch(/^jpn_/); // Tokyo
    expect(at(-35, 48)).toBeNull(); // the middle of the North Atlantic
    expect(at(0, -75)).toBeNull(); // south of the map
  });

  it('finds every province where it is drawn', () => {
    // For each province: the middle of its biggest triangle is certainly inside it.
    const { positions: p, indices, vertexItems } = triangulate(polygons);
    const best = new Map<number, { area: number; x: number; z: number }>();
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3];
      const area =
        Math.abs((p[b] - p[a]) * (p[c + 2] - p[a + 2]) - (p[c] - p[a]) * (p[b + 2] - p[a + 2])) / 2;
      const item = vertexItems[indices[i]];
      if (area > (best.get(item)?.area ?? 0))
        best.set(item, {
          area,
          x: (p[a] + p[b] + p[c]) / 3,
          z: (p[a + 2] + p[b + 2] + p[c + 2]) / 3,
        });
    }
    const wrong = [...best].filter(([item, point]) => lookup.find(point.x, point.z) !== item);
    expect(wrong.map(([item]) => world.provinceIds[item])).toEqual([]);
    // Nearly every province can be seen and clicked. (A few specks, such as Vatican City, are
    // smaller than the map data's precision and have no area: see docs/15, "Tiny provinces".)
    expect(best.size).toBeGreaterThanOrEqual(world.provinceIds.length - 4);
  });

  it('works on every copy of the world (the map wraps east–west)', () => {
    const paris = lookup.find(projection.x(2.35), projection.z(48.86));
    expect(lookup.find(projection.x(2.35) + 360, projection.z(48.86))).toBe(paris);
    expect(lookup.find(projection.x(2.35) - 720, projection.z(48.86))).toBe(paris);
    // Chukotka lies across the date line: both sides are the same province.
    expect(at(179.5, 67)).toBe(at(-179.5, 67));
    expect(at(179.5, 67)).toMatch(/^rus_/);
  });
});

describe('border lines', () => {
  const segments = (kind: (k: number) => boolean) =>
    borders
      .filter((line) => kind(line.kind))
      .reduce((sum, line) => sum + line.points.length / 2 - 1, 0);

  it('sorts borders into coasts, country borders and region borders', () => {
    expect(segments((k) => k === LINE_COAST)).toBeGreaterThan(10_000);
    expect(segments((k) => k === 0)).toBeGreaterThan(10_000);
    expect(segments((k) => (k & LINE_OTHER_COUNTRY) !== 0)).toBeGreaterThan(5_000);
    expect(segments((k) => (k & LINE_OTHER_REGION) !== 0)).toBeGreaterThan(2_000);
    // Coasts are drawn before the important borders, plain borders first of all.
    expect(borders[0].kind).toBe(0);
    expect(borders.at(-1)!.kind).toBe(LINE_OTHER_COUNTRY + LINE_OTHER_REGION);
  });

  it('draws nothing along the date line, where shapes were only cut for the file', () => {
    const onDateLine = (line: Float32Array) => {
      for (let i = 0; i + 2 < line.length; i += 2)
        if (Math.abs(line[i]) === 180 && Math.abs(line[i + 2]) === 180) return true;
      return false;
    };
    expect(borders.filter((line) => onDateLine(line.points))).toEqual([]);
    const chukotka = lookup.find(projection.x(179.5), projection.z(67));
    const outline = outlineOf(polygons, chukotka, projection);
    expect(outline.length).toBeGreaterThan(1);
    expect(outline.filter((line) => onDateLine(line.points))).toEqual([]);
  });

  it('builds two vertices per point and two triangles per segment', () => {
    const sea = buildInnerBorders(seaTopology, 'seaZones', projection);
    const points = sea.reduce((sum, line) => sum + line.points.length / 2, 0);
    const geometry = buildLineGeometry(sea.map(wholeLine));
    expect(geometry.positions.length).toBe(points * 2 * 3);
    expect(geometry.neighbors.length).toBe(points * 2 * 4);
    expect(geometry.sideAndKind.length).toBe(points * 2 * 2);
    expect(geometry.indices.length).toBe((points - sea.length) * 6);
    expect([geometry.sideAndKind[0], geometry.sideAndKind[2]]).toEqual([-1, 1]);
  });
});

describe('chunks', () => {
  const grid = createChunkGrid(projection, 30);

  it('cuts the map into a grid', () => {
    expect(grid.columns).toBe(12);
    expect(grid.rows).toBeGreaterThanOrEqual(5);
    expect(grid.chunkAt(-179, projection.minZ + 1)).toBe(0);
    expect(grid.chunkAt(179, projection.maxZ - 1)).toBe(grid.columns * grid.rows - 1);
    expect(grid.chunkAt(500, 9999)).toBe(grid.columns * grid.rows - 1);
  });

  it('puts every polygon in exactly one chunk', () => {
    const chunks = chunkPolygons(polygons, grid);
    expect([...chunks.values()].reduce((sum, list) => sum + list.length, 0)).toBe(polygons.length);
  });

  it('cuts lines between chunks without losing or repeating a segment', () => {
    const chunks = chunkLines(borders, grid);
    const total = borders.reduce((sum, line) => sum + line.points.length / 2 - 1, 0);
    let chunked = 0;
    for (const spans of chunks.values())
      for (const span of spans) {
        expect(span.to).toBeGreaterThan(span.from);
        chunked += span.to - span.from;
      }
    expect(chunked).toBe(total);
    expect(chunks.size).toBeGreaterThan(20);
  });
});

describe('map colors', () => {
  const colors = data.mapView.colors;
  const rgb = (table: Uint8Array, index: number) => [...table.subarray(index * 4, index * 4 + 3)];

  it('gives neighboring regions different colors', () => {
    const choice = assignRegionPalette(world, colors.regionPalette.length);
    const clashes: string[] = [];
    for (let province = 0; province < world.provinceIds.length; province++) {
      const region = world.provinceRegion[province];
      for (const neighbor of neighborsOf(world.provinceNeighbors, province)) {
        const other = world.provinceRegion[neighbor];
        if (other !== region && choice[other] === choice[region])
          clashes.push(`${world.regionIds[region]} / ${world.regionIds[other]}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('colors every province and sea zone, opaque', () => {
    for (const mode of ['provinces', 'regions'] as const) {
      const table = provinceBaseColors(mode, world, colors);
      expect(table.length).toBe(world.provinceIds.length * 4);
      for (let i = 3; i < table.length; i += 4) expect(table[i]).toBe(255);
    }
    expect(seaZoneColors(world, colors).length).toBe(world.seaZoneIds.length * 4);
  });

  it('marks the selected province, its neighbors and the hovered province', () => {
    const base = provinceBaseColors('provinces', world, colors);
    const shown = new Uint8Array(base.length);
    const paris = world.provinceIndex.get('fra_ile_de_france')!;
    const neighbor = neighborsOf(world.provinceNeighbors, paris)[0];
    const far = world.provinceIndex.get('usa_texas_houston') ?? 0;
    applyHighlight(base, shown, { selected: paris, hovered: far }, world, colors);
    expect(rgb(shown, paris)).toEqual([0xe8, 0xc8, 0x6a]);
    expect(rgb(shown, neighbor)).not.toEqual(rgb(base, neighbor));
    expect(rgb(shown, far)[0]).toBeGreaterThan(rgb(base, far)[0]);
    // Clearing the highlight brings the base colors back.
    applyHighlight(base, shown, { selected: null, hovered: null }, world, colors);
    expect(shown).toEqual(base);
  });
});
