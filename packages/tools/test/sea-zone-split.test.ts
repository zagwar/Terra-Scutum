import { describe, expect, it } from 'vitest';
import { createGrid } from '../src/map-import/raster';
import { distanceKm, splitSeaZones } from '../src/map-import/sea-zone-split';

// A made-up world on a coarse grid (1° pixels): one ocean zone, a continent and a tiny island.
function makeWorld() {
  const grid = createGrid(1);
  const { width, height } = grid;
  const land = new Uint8Array(width * height);
  const at = (lon: number, lat: number) => Math.floor(90 - lat) * width + Math.floor(lon + 180);
  // A continent: 20° × 20° around the equator.
  for (let lat = -10; lat < 10; lat++) for (let lon = 0; lon < 20; lon++) land[at(lon, lat)] = 1;
  // A tiny island: one pixel far away (about 12,000 km² at the equator).
  land[at(-100, 0)] = 1;
  // Everything else is one ocean zone.
  const sea = new Uint16Array(width * height);
  for (let i = 0; i < sea.length; i++) if (!land[i]) sea[i] = 1;
  return { grid, land, sea, at, height };
}

const SETTINGS = {
  coastBandKm: 300,
  minIslandKm2: 50_000,
  minOpenShare: 0.25,
  minPieceKm2: 15_000,
};

describe('splitting sea zones into coast and open sea', () => {
  it('measures distances in km on the grid', () => {
    const { grid, at } = makeWorld();
    const distance = distanceKm(grid, (pixel) => pixel === at(0, 0), 1000);
    // One pixel north is 111 km; one pixel east at the equator about the same.
    expect(distance[at(0, 1)]).toBeCloseTo(111.3, 0);
    expect(distance[at(1, 0)]).toBeCloseTo(111.3, 0);
    expect(distance[at(20, 0)]).toBe(Infinity); // beyond the limit
  });

  it('cuts a zone into a coast band along big land and the open sea beyond', () => {
    const { grid, land, sea, at } = makeWorld();
    const split = splitSeaZones(
      grid,
      sea,
      (pixel) => land[pixel] === 1,
      [{ id: 'ocean', name: 'Ocean', depth: 'deep' }],
      SETTINGS,
    );
    expect(split.zones).toEqual([
      { id: 'ocean', name: 'Ocean', depth: 'deep', kind: 'sea', source: 0 },
      { id: 'ocean_coast', name: 'Ocean Coast', depth: 'deep', kind: 'coast', source: 0 },
    ]);
    expect(split.tinyIslands).toBe(1);
    const zoneAt = (lon: number, lat: number) => split.zones[split.labels[at(lon, lat)] - 1].id;
    // Right next to the continent, and 2° out: coast. 10° out: open sea.
    expect(zoneAt(20, 0)).toBe('ocean_coast');
    expect(zoneAt(21, 5)).toBe('ocean_coast');
    expect(zoneAt(30, 0)).toBe('ocean');
    // The tiny island doesn't count as a coast: the water around it is open sea.
    expect(zoneAt(-101, 0)).toBe('ocean');
    // Land has no sea zone.
    expect(split.labels[at(5, 5)]).toBe(0);
  });

  it('makes a sea that is near land everywhere a coast zone as a whole', () => {
    const { grid, at, height } = makeWorld();
    const { width } = grid;
    // A narrow sea: a 4° wide channel of water between two big land masses (everything else land).
    const land = new Uint8Array(width * height).fill(1);
    const sea = new Uint16Array(width * height);
    for (let lat = -60; lat < 60; lat++)
      for (let lon = 0; lon < 4; lon++) {
        land[at(lon, lat)] = 0;
        sea[at(lon, lat)] = 1;
      }
    const split = splitSeaZones(
      grid,
      sea,
      (pixel) => land[pixel] === 1,
      [{ id: 'channel', name: 'Channel', depth: 'shallow' }],
      SETTINGS,
    );
    expect(split.zones).toEqual([
      { id: 'channel', name: 'Channel', depth: 'shallow', kind: 'coast', source: 0 },
    ]);
    expect(split.labels[at(2, 0)]).toBe(1);
  });
});
