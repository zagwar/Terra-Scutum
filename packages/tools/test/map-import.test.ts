import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildWorldMap, summarizeCountry } from '@terra-scutum/sim';
import { loadGameDataFromDisk } from '../src';
import {
  COUNTRY_PALETTE,
  MIN_BORDER_CONTRAST,
  assignCountryColors,
  assignTraditionalColors,
  colorDifference,
  mapColorContrast,
} from '../src/map-import/colors';
import { loadMapConfig } from '../src/map-import/config';
import {
  type Polygons,
  areaKm2,
  innerLabelPoint,
  labelPoint,
  normalizeWinding,
  polygonsContain,
  ringSignedArea,
} from '../src/map-import/geometry';
import { encodePng } from '../src/map-import/png';
import { compassAdjective } from '../src/map-import/provinces';
import {
  type Grid,
  fillPolygons,
  growLabels,
  touchingPairs,
  traceLabels,
} from '../src/map-import/raster';
import { cleanName, slugify, uniqueIds } from '../src/map-import/text';
import {
  addTouchingPoints,
  applyTinyProvinces,
  cutOut,
  discRing,
} from '../src/map-import/tiny-provinces';
import { buildCountryLookup } from '../src/map-import/units';

const square = (x0: number, y0: number, size: number): Polygons => [
  [
    [
      [x0, y0],
      [x0 + size, y0],
      [x0 + size, y0 + size],
      [x0, y0 + size],
      [x0, y0],
    ],
  ],
];

function smallGrid(width: number, height: number, labels?: number[]): Grid {
  return {
    width,
    height,
    degreesPerPixel: 360 / width,
    labels: labels ? Uint16Array.from(labels) : new Uint16Array(width * height),
  };
}

describe('names and ids', () => {
  it('turns names into ids', () => {
    expect(slugify('Île-de-France')).toBe('ile_de_france');
    expect(slugify("Provence-Alpes-Côte-d'Azur")).toBe('provence_alpes_cote_d_azur');
    expect(slugify('Baden-Württemberg')).toBe('baden_wurttemberg');
    expect(slugify('Łódź Voivodeship')).toBe('lodz_voivodeship');
    expect(slugify('Texas (Houston)')).toBe('texas_houston');
    expect(slugify('???')).toBe('unnamed');
    expect(cleanName('  São   Paulo ')).toBe('São Paulo');
  });

  it('keeps ids unique', () => {
    expect(uniqueIds(['a', 'b', 'a', 'a', 'a_2'])).toEqual(['a', 'b', 'a_3', 'a_4', 'a_2']);
  });
});

describe('geometry', () => {
  it('measures area the same whichever way a ring winds', () => {
    const one = square(0, 0, 1);
    const reversed: Polygons = [[[...one[0][0]].reverse()]];
    expect(areaKm2(one)).toBeCloseTo(12_364, -2); // 1° × 1° at the equator
    expect(areaKm2(reversed)).toBeCloseTo(areaKm2(one), 6);
  });

  it('winds outer rings counter-clockwise and holes clockwise', () => {
    const withHole: Polygons = [[[...square(0, 0, 10)[0][0]].reverse(), square(2, 2, 2)[0][0]]];
    const fixed = normalizeWinding(withHole);
    expect(ringSignedArea(fixed[0][0])).toBeGreaterThan(0);
    expect(ringSignedArea(fixed[0][1])).toBeLessThan(0);
  });

  it('respects holes and finds a label point inside odd shapes', () => {
    const donut: Polygons = [[square(0, 0, 10)[0][0], square(3, 3, 4)[0][0]]];
    expect(polygonsContain(donut, 1, 1)).toBe(true);
    expect(polygonsContain(donut, 5, 5)).toBe(false);
    const [x, y] = labelPoint(donut);
    expect(polygonsContain(donut, x, y)).toBe(true);
  });

  it('puts the name of a province where it has the most room', () => {
    // A square: the middle.
    const [sx, sy] = innerLabelPoint(square(0, 0, 10));
    expect(sx).toBeCloseTo(5, 1);
    expect(sy).toBeCloseTo(5, 1);
    // An L: the corner block, not the centroid (which lies near the inner corner).
    const l: Polygons = [
      [
        [
          [0, 0],
          [10, 0],
          [10, 2],
          [4, 2],
          [4, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    ];
    const [lx, ly] = innerLabelPoint(l);
    expect(polygonsContain(l, lx, ly)).toBe(true);
    expect(lx).toBeGreaterThan(1.5);
    expect(lx).toBeLessThan(2.5);
    // A ring: in one of its corners, where there is most room between the hole and the outside.
    const donut: Polygons = [[square(0, 0, 10)[0][0], square(3, 3, 4)[0][0]]];
    const [dx, dy] = innerLabelPoint(donut);
    expect(polygonsContain(donut, dx, dy)).toBe(true);
    expect(Math.min(dx, 10 - dx)).toBeCloseTo(1.75, 1);
    expect(Math.min(dy, 10 - dy)).toBeCloseTo(1.75, 1);
    // The biggest piece wins.
    const [bx] = innerLabelPoint([...square(0, 0, 1), ...square(20, 0, 6)]);
    expect(bx).toBeCloseTo(23, 1);
  });
});

describe('tiny provinces', () => {
  const draft = (id: string, polygons: Polygons) => ({
    id,
    name: id,
    nameSource: 'unit' as const,
    country: 'AAA',
    polygons,
    areaKm2: 100,
    center: [0, 0] as [number, number],
    cities: [],
    population: 0,
    units: [],
    sourceUnits: [],
  });
  const config = (extra: object) => ({
    radiusKm: 10,
    discPoints: 16,
    enlarge: [],
    leaveOut: [],
    ...extra,
  });

  it('draws a disc of the right size on the ground', () => {
    const ring = discRing([10, 60], 10, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
    expect(ringSignedArea(ring)).toBeGreaterThan(0); // counter-clockwise
    expect(areaKm2([[ring]])).toBeCloseTo(Math.PI * 100, -1.5);
    // At 60° north a degree of longitude is half as long, so the disc is twice as wide in degrees.
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width / height).toBeCloseTo(2, 1);
  });

  it('cuts an enlarged province out of the one around it (an enclave)', () => {
    const warnings: string[] = [];
    const { provinces, report } = applyTinyProvinces(
      [draft('big', square(-1, -1, 2)), draft('tiny', []), draft('far', square(5, 5, 1))],
      config({ enlarge: [{ id: 'tiny', center: [0, 0], areaKm2: 0.5 }] }),
      (w) => warnings.push(w),
    );
    expect(warnings).toEqual([]);
    expect(report.enlarged).toEqual(['tiny']);
    const [big, tiny, far] = provinces;
    expect(tiny.areaKm2).toBe(0.5); // the real area, not the disc's
    expect(tiny.center).toEqual([0, 0]);
    expect(polygonsContain(tiny.polygons, 0, 0)).toBe(true);
    expect(polygonsContain(big.polygons, 0, 0)).toBe(false); // a hole where the disc is
    expect(polygonsContain(big.polygons, 0.5, 0.5)).toBe(true);
    expect(big.polygons[0]).toHaveLength(2);
    // The hole runs through exactly the disc's corners: the border is shared.
    const corners = new Set(tiny.polygons[0][0].map((p) => p.join(',')));
    expect(big.polygons[0][1].every((p) => corners.has(p.join(',')))).toBe(true);
    expect(far.polygons).toEqual(square(5, 5, 1));
  });

  it('shares the border with a province the disc only partly covers (a coast)', () => {
    const disc = discRing([0, 0], 10, 16);
    const land = cutOut(square(0.01, -1, 2), disc); // land to the east only
    const joined = addTouchingPoints(disc, [land]);
    expect(joined.length).toBe(disc.length + 2); // the two points where the coast meets the disc
    const corners = new Set(joined.map((p) => p.join(',')));
    const onDisc = land[0][0].filter((p) => corners.has(p.join(',')));
    expect(onDisc.length).toBeGreaterThanOrEqual(9); // half the disc's corners plus the two new points
    expect(polygonsContain(land, 0.05, 0)).toBe(false);
    expect(polygonsContain(land, 0.5, 0)).toBe(true);
  });

  it('leaves provinces out, and warns about ids that do not exist', () => {
    const warnings: string[] = [];
    const { provinces, report } = applyTinyProvinces(
      [draft('keep', square(0, 0, 1)), draft('atoll', [])],
      config({
        leaveOut: ['atoll', 'nowhere'],
        enlarge: [{ id: 'missing', center: [0, 0], areaKm2: 1 }],
      }),
      (w) => warnings.push(w),
    );
    expect(provinces.map((p) => p.id)).toEqual(['keep']);
    expect(report.leftOut).toEqual(['atoll']);
    expect(warnings).toHaveLength(2);
  });
});

describe('world grid', () => {
  it('fills polygons by pixel centers', () => {
    const grid = smallGrid(36, 18); // 10° pixels
    const filled = fillPolygons(grid, square(0, 0, 30), 7);
    expect(filled).toBe(9);
    expect(grid.labels.filter((l) => l === 7).length).toBe(9);
  });

  it('grows labels through open pixels only, around walls', () => {
    //  1 . # . . .     Column 2 is a wall with a gap in the bottom row.
    //  . . # . . .
    //  . . . . . 2
    const W = 9;
    const layout = [1, 0, W, 0, 0, 0, 0, 0, W, 0, 0, 0, 0, 0, 0, 0, 0, 2];
    const grid = smallGrid(6, 3, layout);
    const labels = grid.labels.map((l) => (l === W ? 0 : l));
    growLabels(grid, labels, (pixel) => layout[pixel] !== W);
    layout.forEach((cell, i) => {
      if (cell === W) expect(labels[i]).toBe(0);
      else expect(labels[i]).not.toBe(0);
    });
    expect(labels[1]).toBe(1);
    expect(labels[6]).toBe(1);
    expect(labels[16]).toBe(2);
    expect(labels[11]).toBe(2);
  });

  it('finds touching labels, including across the east–west edge', () => {
    const grid = smallGrid(4, 1, [1, 2, 2, 3]);
    const pairs = touchingPairs(grid, grid.labels, grid.labels);
    expect([...pairs.keys()].sort()).toEqual(['1|2', '2|3', '3|1'].sort());
  });

  it('traces labels into polygons that redraw to exactly the same pixels', () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const width = 24;
    const height = 12;
    const labels = Array.from({ length: width * height }, () => 1 + Math.floor(random() * 3));
    const grid = smallGrid(width, height, labels);
    const traced = traceLabels(grid, grid.labels);
    const redrawn = smallGrid(width, height);
    for (const [label, polygons] of traced) fillPolygons(redrawn, polygons, label);
    expect([...redrawn.labels]).toEqual(labels);
    for (const polygons of traced.values()) {
      for (const polygon of polygons) {
        expect(ringSignedArea(polygon[0])).toBeGreaterThan(0);
        for (const hole of polygon.slice(1)) expect(ringSignedArea(hole)).toBeLessThan(0);
      }
    }
  });
});

describe('province names', () => {
  it('turns a direction-only source name into a readable area name', () => {
    expect(compassAdjective('North West')).toBe('Northwestern');
    expect(compassAdjective('Centre')).toBe('Central');
    expect(compassAdjective('Eastern')).toBe('Eastern');
    expect(compassAdjective('East Wales')).toBeNull();
  });
});

describe('countries', () => {
  it('needs every source territory to be placed exactly once', () => {
    const config = {
      countries: [{ id: 'AAA', name: 'A', source: 'AAA', includes: ['BBB'] }],
      leftOut: ['CCC'],
    };
    expect(buildCountryLookup(config, ['AAA', 'BBB', 'CCC'])).toEqual(
      new Map([
        ['AAA', 'AAA'],
        ['BBB', 'AAA'],
        ['CCC', null],
      ]),
    );
    expect(() => buildCountryLookup(config, ['AAA', 'DDD'])).toThrow(/DDD/);
    const twice = {
      countries: [{ id: 'AAA', name: 'A', source: 'AAA', includes: ['AAA'] }],
      leftOut: [],
    };
    expect(() => buildCountryLookup(twice, ['AAA'])).toThrow(/more than once/);
  });

  it('gives neighboring countries different colors', () => {
    const neighbors = new Map([
      ['A', new Set(['B', 'C'])],
      ['B', new Set(['A', 'C'])],
      ['C', new Set(['A', 'B'])],
    ]);
    const colors = assignCountryColors(['A', 'B', 'C'], neighbors);
    expect(new Set(colors.values()).size).toBe(3);
  });

  it('measures how different two colors look', () => {
    expect(colorDifference('#336699', '#336699')).toBe(0);
    expect(colorDifference('#000000', '#ffffff')).toBeCloseTo(1, 2);
    // Two greens that are hard to tell apart, and a green next to a red.
    expect(colorDifference('#5f7f5a', '#5a7a5a')).toBeLessThan(0.03);
    expect(colorDifference('#5f7f5a', '#a0614f')).toBeGreaterThan(0.1);
    // On the map, a light and a dark shade of one color count as much more alike than two colors.
    expect(mapColorContrast('#c9b8f0', '#7a5fa8')).toBeLessThan(
      colorDifference('#c9b8f0', '#7a5fa8') * 0.6,
    );
    expect(mapColorContrast('#c9b8f0', '#7fae5c')).toBeGreaterThan(0.15);
  });

  it('has a palette of clearly different colors', () => {
    expect(COUNTRY_PALETTE.length).toBeGreaterThanOrEqual(30);
    for (const color of COUNTRY_PALETTE) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    let closest = Infinity;
    COUNTRY_PALETTE.forEach((a, i) =>
      COUNTRY_PALETTE.forEach((b, j) => {
        if (i < j) closest = Math.min(closest, colorDifference(a, b));
      }),
    );
    expect(closest).toBeGreaterThan(0.04);
  });

  it('keeps the colors of countries that touch, nearly touch or share a neighbor far apart', () => {
    // A chain A–B–C–D–E, with F facing A across a strait.
    const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
    const neighbors = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
    for (const [a, b] of ['AB', 'BC', 'CD', 'DE'].map((pair) => [...pair])) {
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
    const near = new Map([
      ['A', new Set(['F'])],
      ['F', new Set(['A'])],
    ]);
    const colors = assignCountryColors(ids, neighbors, near);
    const apart = (a: string, b: string) => mapColorContrast(colors.get(a)!, colors.get(b)!);
    for (const [a, b] of ['AB', 'BC', 'CD', 'DE'].map((pair) => [...pair]))
      expect(apart(a, b)).toBeGreaterThan(0.15);
    expect(apart('A', 'F')).toBeGreaterThan(0.12);
    expect(apart('A', 'C')).toBeGreaterThan(0.07); // both border B
    // The same input always gives the same colors.
    expect([...assignCountryColors(ids, neighbors, near)]).toEqual([...colors]);
  });

  it('keeps traditional colors, and shifts the smaller of two look-alike neighbors', () => {
    // A (big, red) borders B (small, nearly the same red) and C (small, blue). D has no color.
    const ids = ['A', 'B', 'C', 'D'];
    const neighbors = new Map([
      ['A', new Set(['B', 'C', 'D'])],
      ['B', new Set(['A'])],
      ['C', new Set(['A'])],
      ['D', new Set(['A'])],
    ]);
    const preferred = new Map([
      ['A', '#c8403a'],
      ['B', '#c0403a'],
      ['C', '#3f6fc4'],
    ]);
    const importance = new Map([
      ['A', 50],
      ['B', 2],
      ['C', 3],
      ['D', 1],
    ]);
    const { colors, adjusted } = assignTraditionalColors(
      ids,
      neighbors,
      new Map(),
      preferred,
      importance,
    );
    expect(colors.get('A')).toBe('#c8403a'); // the big country keeps its exact color
    expect(colors.get('C')).toBe('#3f6fc4'); // already different enough
    expect(colors.get('B')).not.toBe('#c0403a'); // shifted…
    expect(colorDifference(colors.get('B')!, '#c0403a')).toBeLessThan(0.15); // …but still reddish
    expect(mapColorContrast(colors.get('A')!, colors.get('B')!)).toBeGreaterThanOrEqual(
      MIN_BORDER_CONTRAST * 0.999,
    );
    expect(colors.get('D')).toMatch(/^#[0-9a-f]{6}$/); // a spare palette color
    expect(adjusted.map((entry) => entry.id)).toEqual(['B']);
  });

  it('the real map: big countries keep their traditional colors', () => {
    const data = loadGameDataFromDisk();
    const world = buildWorldMap(data);
    const traditional = loadMapConfig().countryColors.colors;
    for (const id of ['USA', 'GBR', 'FRA', 'DEU', 'RUS', 'CHN', 'ITA', 'ESP', 'NLD', 'BRA']) {
      expect(world.countryMapColor[world.countryIndex.get(id)!], id).toBe(traditional[id]);
    }
    // Every country in the game has a traditional color.
    expect(world.countryIds.filter((id) => !(id in traditional))).toEqual([]);
  });

  it('the real map: countries that share a border have clearly different colors', () => {
    const data = loadGameDataFromDisk();
    const world = buildWorldMap(data);
    const alike: string[] = [];
    world.countryIds.forEach((id, country) => {
      for (const other of summarizeCountry(world, world.provinceCountry, country).neighbors) {
        const difference = mapColorContrast(
          world.countryMapColor[country],
          world.countryMapColor[other],
        );
        if (other > country && difference < MIN_BORDER_CONTRAST * 0.999)
          alike.push(`${id} and ${world.countryIds[other]}: ${difference.toFixed(3)}`);
      }
    });
    expect(alike).toEqual([]);
    expect(new Set(world.countryMapColor).size).toBeGreaterThanOrEqual(100);
  });

  it('the map-config files are valid', () => {
    const config = loadMapConfig();
    expect(config.countries.countries.length).toBeGreaterThan(100);
    expect(config.regions.regions.length).toBeGreaterThan(40);
    expect(config.seaZones.seaZones.length).toBeGreaterThan(100);
    expect(config.provinceGroups.groups.length).toBeGreaterThan(50);
  });
});

describe('preview pictures', () => {
  it('writes a valid PNG', () => {
    const png = encodePng(2, 1, Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const idatAt = png.indexOf('IDAT');
    const length = png.readUInt32BE(idatAt - 4);
    const raw = inflateSync(png.subarray(idatAt + 4, idatAt + 4 + length));
    expect([...raw]).toEqual([0, 255, 0, 0, 255, 0, 0, 255, 255]);
  });
});
