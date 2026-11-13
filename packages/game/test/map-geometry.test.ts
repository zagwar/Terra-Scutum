import { buildWorldMap, isCoastalSeaZone, neighborsOf, parseGameData } from '@terra-scutum/sim';
import type { Objects, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import provincesText from '../../../data/geometry/provinces.topo.json?raw';
import seaZonesText from '../../../data/geometry/sea_zones.topo.json?raw';
import {
  MAP_MODES,
  applyHighlight,
  applySeaHighlight,
  provinceBaseColors,
  seaZoneColors,
} from '../src/render/map/map-colors';
import {
  LINE_COAST,
  LINE_OTHER_COUNTRY,
  LINE_OTHER_REGION,
  borderKind,
  buildInnerBorders,
  buildLineGeometry,
  buildProvinceBorders,
  chunkLines,
  chunkPolygons,
  createChunkGrid,
  decodePolygons,
  outlineOf,
  triangulate,
  updateBorderKinds,
  wholeLine,
} from '../src/render/map/map-geometry';
import { createMapProjection } from '../src/render/map/map-projection';
import { createShapeLookup, findTarget } from '../src/render/map/shape-lookup';
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
    // Every province can be seen and clicked, the enlarged tiny ones included (F02).
    expect(best.size).toBe(world.provinceIds.length);
  });

  it('can click the tiny provinces that the map import enlarges', () => {
    expect(at(12.4534, 41.9033)).toBe('vat_vatican_city');
    expect(at(12.4534, 41.9033 + 0.07)).toBe('vat_vatican_city'); // 8 km north: still the disc
    expect(at(12.4534, 41.9033 + 0.12)).toBe('ita_lazio'); // 13 km north: Italy around it
    expect(at(-5.3536, 36.1408)).toBe('gbr_gibraltar');
    expect(at(-5.3536, 36.1408 + 0.12)).toBe('esp_andalusia');
    expect(at(72.43, -7.33)).toBe('gbr_british_indian_ocean_territory');
    // Their label points and every other province's lie inside the province.
    const outside = data.provinces.provinces.filter((p) => at(p.center[0], p.center[1]) !== p.id);
    expect(outside.map((p) => p.id)).toEqual([]);
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

  it('knows the provinces on both sides of every border', () => {
    for (const line of borders) {
      const sides = line.sides!;
      expect(sides.length).toBe((line.points.length / 2 - 1) * 2);
      // A line was put together from borders of one kind (with the starting owners).
      for (let i = 0; i < sides.length; i += 2) {
        expect(
          borderKind(sides[i], sides[i + 1], world.provinceCountry, world.provinceRegion),
        ).toBe(line.kind);
      }
    }
  });

  it('turns province borders into country borders when a province changes owner', () => {
    const geometry = buildLineGeometry(
      [...chunkLines(borders, createChunkGrid(projection, 360)).values()].flat(),
    );
    const owners = world.provinceCountry.slice();
    expect(updateBorderKinds(geometry, owners, world.provinceRegion)).toBe(false);
    const kindsBetween = (a: number, b: number) => {
      const kinds = new Set<number>();
      const { borders: spans, sideAndKind } = geometry;
      for (let i = 0; i < spans.length; i += 4) {
        const [sideA, sideB] = [spans[i + 2], spans[i + 3]];
        if (!(sideA === a && sideB === b) && !(sideA === b && sideB === a)) continue;
        for (let v = spans[i]; v < spans[i] + spans[i + 1]; v++) kinds.add(sideAndKind[v * 2 + 1]);
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
    expect(updateBorderKinds(geometry, owners, world.provinceRegion)).toBe(true);
    expect(kindsBetween(alsace, baden).some(country)).toBe(false);
    expect(kindsBetween(alsace, french).every(country)).toBe(true);
    // Nothing else to do the second time; region borders and coasts never change.
    expect(updateBorderKinds(geometry, owners, world.provinceRegion)).toBe(false);
    const coast = p('fra_bretagne');
    expect(kindsBetween(coast, coast)).toEqual([LINE_COAST]);
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
    expect(geometry.borders.length).toBe(0); // sea zone borders never change kind
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
        // A span lies between one pair of provinces.
        for (let i = span.from; i < span.to; i++) {
          expect(span.sides![i * 2]).toBe(span.sideA);
          expect(span.sides![i * 2 + 1]).toBe(span.sideB);
        }
      }
    expect(chunked).toBe(total);
    expect(chunks.size).toBeGreaterThan(20);
  });
});

describe('map colors', () => {
  const colors = data.mapView.colors;
  const rgb = (table: Uint8Array, index: number) => [...table.subarray(index * 4, index * 4 + 3)];

  it('colors provinces by their region in the regions map mode', () => {
    const near = (a: number[], b: number[]) =>
      a.every((value, i) => Math.abs(value - b[i]) <= 255 * colors.regionVariation + 1);
    const hex = (color: string) => [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
    const table = provinceBaseColors('regions', world, colors, world.provinceCountry);
    world.provinceIds.forEach((_, province) => {
      const region = world.provinceRegion[province];
      expect(near(rgb(table, province), hex(world.regionMapColor[region]))).toBe(true);
    });
    // Neighboring regions never share a color.
    const clashes: string[] = [];
    for (let province = 0; province < world.provinceIds.length; province++) {
      const region = world.provinceRegion[province];
      for (const neighbor of neighborsOf(world.provinceNeighbors, province)) {
        const other = world.provinceRegion[neighbor];
        if (other !== region && world.regionMapColor[other] === world.regionMapColor[region])
          clashes.push(`${world.regionIds[region]} / ${world.regionIds[other]}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('colors every province and sea zone, opaque', () => {
    for (const mode of MAP_MODES) {
      const table = provinceBaseColors(mode, world, colors, world.provinceCountry);
      expect(table.length).toBe(world.provinceIds.length * 4);
      for (let i = 3; i < table.length; i += 4) expect(table[i]).toBe(255);
    }
    for (const mode of MAP_MODES) {
      const sea = seaZoneColors(mode, world, colors);
      expect(sea.length).toBe(world.seaZoneIds.length * 4);
      for (let i = 3; i < sea.length; i += 4) expect(sea[i]).toBe(255);
    }
  });

  it('colors provinces by their current owner in the political map mode', () => {
    const p = (id: string) => world.provinceIndex.get(id)!;
    const c = (id: string) => world.countryIndex.get(id)!;
    const near = (a: number[], b: number[]) =>
      a.every((value, i) => Math.abs(value - b[i]) <= 255 * colors.politicalVariation + 1);
    const colorOf = (country: string) => {
      const hex = world.countryMapColor[c(country)];
      return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    };
    const owners = world.provinceCountry.slice();
    let table = provinceBaseColors('political', world, colors, owners);
    expect(near(rgb(table, p('fra_bretagne')), colorOf('FRA'))).toBe(true);
    expect(near(rgb(table, p('deu_bavaria')), colorOf('DEU'))).toBe(true);
    expect(near(rgb(table, p('fra_bretagne')), colorOf('DEU'))).toBe(false);
    // Two provinces of one country: the same color, shaded slightly differently.
    const shades = new Set(
      world.provinceIds
        .map((id, province) => (id.startsWith('fra_') ? rgb(table, province).join() : ''))
        .filter((shade) => shade !== ''),
    );
    expect(shades.size).toBeGreaterThan(5);

    owners[p('fra_bretagne')] = c('DEU');
    table = provinceBaseColors('political', world, colors, owners);
    expect(near(rgb(table, p('fra_bretagne')), colorOf('DEU'))).toBe(true);
    // The other map modes don't depend on the owner.
    expect(provinceBaseColors('regions', world, colors, owners)).toEqual(
      provinceBaseColors('regions', world, colors, world.provinceCountry),
    );
  });

  it('marks the selected province, its neighbors and the hovered province', () => {
    const base = provinceBaseColors('provinces', world, colors, world.provinceCountry);
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

  it('shades sea zones by depth, and by coastal or open sea in the sea zones map mode', () => {
    const hex = (color: string) => [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
    const near = (a: number[], color: string) =>
      a.every((value, i) => Math.abs(value - hex(color)[i]) <= 255 * colors.seaVariation + 1);
    const zone = (id: string) => world.seaZoneIndex.get(id)!;
    const byDepth = seaZoneColors('political', world, colors);
    const byCoast = seaZoneColors('seaZones', world, colors);
    world.seaZoneIds.forEach((_, z) => {
      expect(near(rgb(byDepth, z), world.seaZoneDeep[z] ? colors.seaDeep : colors.seaShallow)).toBe(
        true,
      );
      expect(
        near(rgb(byCoast, z), isCoastalSeaZone(world, z) ? colors.seaCoastal : colors.seaOpen),
      ).toBe(true);
      // The sea stays blue in every map mode.
      for (const table of [byDepth, byCoast]) {
        const [r, g, b] = rgb(table, z);
        expect(b).toBeGreaterThan(Math.max(r, g));
      }
    });
    // Every map mode but sea zones shows the same sea.
    for (const mode of MAP_MODES)
      if (mode !== 'seaZones') expect(seaZoneColors(mode, world, colors)).toEqual(byDepth);
    // The North Sea is coastal; the open North Atlantic is not.
    expect(isCoastalSeaZone(world, zone('north_sea'))).toBe(true);
    expect(isCoastalSeaZone(world, zone('north_atlantic'))).toBe(false);
  });

  it('marks the selected and the hovered sea zone', () => {
    const base = seaZoneColors('seaZones', world, colors);
    const shown = new Uint8Array(base.length);
    const northSea = world.seaZoneIndex.get('north_sea')!;
    const baltic = world.seaZoneIndex.get('baltic_sea')!;
    applySeaHighlight(base, shown, { selected: northSea, hovered: baltic }, colors);
    expect(rgb(shown, northSea)[0]).toBeGreaterThan(rgb(base, northSea)[0]);
    expect(rgb(shown, baltic)[0]).toBeGreaterThan(rgb(base, baltic)[0]);
    applySeaHighlight(base, shown, { selected: null, hovered: null }, colors);
    expect(shown).toEqual(base);
  });
});

describe('sea zone picking', () => {
  const seaLookup = createShapeLookup(
    decodePolygons(seaTopology, 'seaZones', (id) => world.seaZoneIndex.get(id)!, projection),
    projection,
  );
  const targetAt = (longitude: number, latitude: number) =>
    findTarget(lookup, seaLookup, projection.x(longitude), projection.z(latitude));

  it('finds sea zones on the water, and provinces on land (land wins over the sea zone under it)', () => {
    expect(targetAt(3, 56)).toEqual({
      kind: 'seaZone',
      index: world.seaZoneIndex.get('north_sea'),
    });
    expect(targetAt(-40, 45)).toEqual({
      kind: 'seaZone',
      index: world.seaZoneIndex.get('north_atlantic'),
    });
    // Paris: the sea zone shapes continue under the land, but the province is found.
    expect(seaLookup.find(projection.x(2.35), projection.z(48.86))).toBeGreaterThanOrEqual(0);
    expect(targetAt(2.35, 48.86)).toEqual({
      kind: 'province',
      index: world.provinceIndex.get('fra_ile_de_france'),
    });
    // Across the date line, on either side.
    expect(targetAt(179.5, 20)?.kind).toBe('seaZone');
    expect(targetAt(-179.5, 20)?.kind).toBe('seaZone');
    // Outside the map (north of its top edge): nothing.
    expect(targetAt(0, 89.9)).toBeNull();
  });

  it('finds every sea zone at its label point', () => {
    const wrong: string[] = [];
    world.seaZoneIds.forEach((id, zone) => {
      const longitude = world.seaZoneCenter[zone * 2];
      const latitude = world.seaZoneCenter[zone * 2 + 1];
      const { southLatitude, northLatitude } = data.mapView.projection;
      // Some polar label points (the North Pole, the far Southern Ocean) are on or past the map's edge.
      if (latitude >= northLatitude || latitude <= southLatitude) return;
      const found = targetAt(longitude, latitude);
      if (found?.kind !== 'seaZone' || found.index !== zone)
        wrong.push(`${id} → ${found ? `${found.kind} ${found.index}` : 'nothing'}`);
    });
    expect(wrong).toEqual([]);
  });

  it('lists coastal provinces that really face the sea zone (the Philippine Sea)', () => {
    const coasts = neighborsOf(world.seaZoneProvinces, world.seaZoneIndex.get('philippine_sea')!);
    const ids = Array.from(coasts, (province) => world.provinceIds[province]);
    expect(ids).toEqual(
      expect.arrayContaining(['phl_bicol', 'phl_davao', 'jpn_okinawa', 'jpn_shikoku']),
    );
  });
});
