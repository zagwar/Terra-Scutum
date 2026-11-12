import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { assignCountryColors } from '../src/map-import/colors';
import { loadMapConfig } from '../src/map-import/config';
import {
  type Polygons,
  areaKm2,
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
