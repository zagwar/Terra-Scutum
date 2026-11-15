import type { TerrainLayout } from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { checkRivers } from '../src/check-map-assets';
import { decodePngRgb, encodePng } from '../src/map-import/png';
import {
  CLASS_COUNT,
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
} from '../src/terrain-import/grids';
import { loadTerrainSettings } from '../src/terrain-import/sources';

// A tiny world: 32 cells around it at the coarse level, 64 at the fine one.
const layout: TerrainLayout = { baseCells: 32, tileCells: 16, levels: 2, minZ: 0, maxZ: 180 };
const fine = levelGrid(layout, 1);
const coarse = levelGrid(layout, 0);
const FOREST = 1;
const WATER = 8;

describe('the terrain import', () => {
  it('reads its settings', () => {
    const settings = loadTerrainSettings();
    expect(settings.tiles.levels).toBe(5);
    expect(settings.tiles.baseCells % settings.tiles.tileCells).toBe(0);
  });

  it('reads the pixels of a PNG picture', () => {
    const rgba = Uint8Array.from({ length: 5 * 3 * 4 }, (_, i) => (i * 37) % 256);
    const { width, height, rgb } = decodePngRgb(encodePng(5, 3, rgba));
    expect([width, height]).toEqual([5, 3]);
    for (let pixel = 0; pixel < 15; pixel++)
      expect([...rgb.subarray(pixel * 3, pixel * 3 + 3)]).toEqual([
        ...rgba.subarray(pixel * 4, pixel * 4 + 3),
      ]);
    expect(() => decodePngRgb(new Uint8Array(40))).toThrow('not a PNG');
  });

  it('marks the corners inside a polygon as land, holes left out, across the date line too', () => {
    expect(fine.cells).toBe(64);
    expect(fine.cellRows).toBe(32);
    const mask = new Uint8Array(fine.cells * (fine.cellRows + 1));
    const square = (x0: number, z0: number, x1: number, z1: number) =>
      Float64Array.from([x0, z0, x1, z0, x1, z1, x0, z1]);
    fillLandNodes(mask, fine, [square(10.5, 4.5, 20.5, 14.5), square(14.5, 8.5, 16.5, 10.5)]);
    const land = (i: number, j: number) => mask[j * fine.cells + i];
    expect(land(11, 5)).toBe(1);
    expect(land(20, 14)).toBe(1);
    expect(land(10, 5)).toBe(0);
    expect(land(15, 9)).toBe(0); // in the hole
    expect(mask.reduce((sum, value) => sum + value, 0)).toBe(10 * 10 - 2 * 2);
    // A polygon that reaches past the world's eastern edge continues on the western side.
    fillLandNodes(mask, fine, [square(62.5, 20.5, 66.5, 22.5)]);
    expect(land(63, 21)).toBe(1);
    expect(land(1, 21)).toBe(1);
    expect(land(3, 21)).toBe(0);
  });

  it('takes heights from the elevation picture on land only, and keeps depressions only inland', () => {
    const mask = new Uint8Array(fine.cells * (fine.cellRows + 1)).fill(1);
    // The elevation picture: 100 m everywhere, −50 m in its western half.
    const mosaic = { width: 64, height: 64, metres: new Int16Array(64 * 64).fill(100) };
    for (let y = 0; y < 64; y++) for (let x = 0; x < 20; x++) mosaic.metres[y * 64 + x] = -50;
    const latitudeOfRow = (row: number) => -60 + (row * 120) / fine.cellRows;
    const heights = sampleHeights(mosaic, fine, mask, latitudeOfRow);
    expect(heights[10 * fine.cells + 40]).toBe(100);
    expect(heights[10 * fine.cells + 10]).toBe(-50); // far from any sea: a real depression
    // The same with sea six corners away: the low land is sea floor at a coast, so it becomes sea level.
    for (let j = 0; j <= fine.cellRows; j++) mask[j * fine.cells + 16] = 0;
    const coastal = sampleHeights(mosaic, fine, mask, latitudeOfRow);
    expect(coastal[10 * fine.cells + 10]).toBe(0);
    expect(coastal[10 * fine.cells + 16]).toBe(0); // the sea itself
    expect(coastal[10 * fine.cells + 40]).toBe(100);
    expect(mercatorRow(0, 256)).toBeCloseTo(128);
    expect(mercatorRow(85.0511, 256)).toBeCloseTo(0, 2);
  });

  it('makes the coarser level from the finer one', () => {
    const heights = new Int16Array(fine.cells * (fine.cellRows + 1)).fill(400);
    heights[10 * fine.cells + 20] = 2000; // one peak
    const smaller = coarserHeights(heights, fine, coarse);
    expect(smaller.length).toBe(coarse.cells * (coarse.cellRows + 1));
    expect(smaller[3 * coarse.cells + 3]).toBe(400);
    // The peak's node is shared by both levels: a quarter of the weight is its own.
    expect(smaller[5 * coarse.cells + 10]).toBe(800);
    const mask = new Uint8Array(fine.cells * (fine.cellRows + 1));
    mask[10 * fine.cells + 20] = 1;
    mask[11 * fine.cells + 21] = 1;
    const smallerMask = coarserMask(mask, fine, coarse);
    expect(smallerMask[5 * coarse.cells + 10]).toBe(1);
    expect(smallerMask.reduce((sum, value) => sum + value, 0)).toBe(1);
    const counts = new Uint8Array(fine.cells * fine.cellRows * CLASS_COUNT);
    for (const [i, j] of [
      [20, 10],
      [21, 10],
      [20, 11],
    ])
      counts[(j * fine.cells + i) * CLASS_COUNT + FOREST] = 5;
    counts[(11 * fine.cells + 21) * CLASS_COUNT + WATER] = 7;
    const summed = coarserCounts(counts, fine, coarse);
    expect(summed[(5 * coarse.cells + 10) * CLASS_COUNT + FOREST]).toBe(15);
    expect(summed[(5 * coarse.cells + 10) * CLASS_COUNT + WATER]).toBe(7);
  });

  it('picks the two commonest land cover classes, and fills cells without data from their neighbors', () => {
    const counts = new Uint16Array(coarse.cells * coarse.cellRows * CLASS_COUNT);
    const mask = new Uint8Array(coarse.cells * (coarse.cellRows + 1)).fill(1);
    const cell = 5 * coarse.cells + 10;
    counts[cell * CLASS_COUNT + FOREST] = 30;
    counts[cell * CLASS_COUNT + WATER] = 10;
    const { cover, mix } = coverFromCounts(counts, coarse, mask, () => 0);
    expect(cover[cell]).toBe(FOREST | (WATER << 4));
    expect(mix[cell]).toBe(Math.round((15 * 10) / 40));
    // The neighbors had no data: they took over the cell's cover.
    expect(cover[cell + 1]).toBe(cover[cell]);
    expect(cover[cell + coarse.cells]).toBe(cover[cell]);
    // Far away: bare ground (ice near the poles).
    expect(cover[0] & 15).toBe(6);
    const polar = coverFromCounts(counts, coarse, mask, () => 80);
    expect(polar.cover[0] & 15).toBe(7);
    // In a sea cell water doesn't count: the coast's land cover runs up to the coastline.
    const sea = new Uint8Array(mask.length);
    const atSea = coverFromCounts(counts, coarse, sea, () => 0);
    expect(atSea.cover[cell]).toBe(FOREST | (FOREST << 4));
  });

  it('cuts tiles with their rings of neighbors, wrapping east–west', () => {
    const data = {
      grid: coarse,
      heights: Int16Array.from({ length: coarse.cells * (coarse.cellRows + 1) }, (_, i) => i % 997),
      cover: Uint8Array.from({ length: coarse.cells * coarse.cellRows }, (_, i) => i % 12),
      mix: new Uint8Array(coarse.cells * coarse.cellRows),
    };
    const tile = cutTile(data, layout.tileCells, 0, 0);
    expect(tile.heights.length).toBe(19 * 19);
    expect(tile.cover.length).toBe(20 * 20);
    // Node (0, 0) of the tile; the node west of it comes from the world's eastern edge.
    expect(tile.heights[1 * 19 + 1]).toBe(data.heights[0]);
    expect(tile.heights[1 * 19 + 0]).toBe(data.heights[coarse.cells - 1]);
    // South of the map there is nothing: sea level.
    expect(tile.heights[0]).toBe(0);
    expect(tile.cover[2 * 20 + 2]).toBe(data.cover[0]);
    expect(tile.cover[2 * 20 + 0]).toBe(data.cover[coarse.cells - 2]);
    // The next tile east starts where this one ends.
    const east = cutTile(data, layout.tileCells, 1, 0);
    expect(east.heights[1 * 19 + 1]).toBe(tile.heights[1 * 19 + 17]);
  });

  it('simplifies river lines and checks the rivers file', () => {
    const line = [0, 0, 1, 0.001, 2, 0, 3, 1, 4, 0];
    expect(simplifyLine(line, 0.01)).toEqual([0, 0, 2, 0, 3, 1, 4, 0]);
    expect(simplifyLine(line, 0)).toEqual(line);
    expect(checkRivers('rivers.json', { unitsPerDegree: 1000, rivers: [] })).toEqual([
      'rivers.json: has no rivers',
    ]);
    expect(
      checkRivers('rivers.json', {
        unitsPerDegree: 1000,
        rivers: [
          { weight: 0.3, points: [1, 2, 3, 4] },
          { weight: 0.3, points: [1, 2, 3] },
        ],
      }),
    ).toEqual(['rivers.json: river 1 is malformed']);
    expect(checkRivers('rivers.json', [])).toEqual(['rivers.json: not a rivers file']);
  });
});
