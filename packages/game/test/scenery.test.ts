import { describe, expect, it } from 'vitest';
import { loadGameDataFromDisk } from '../../tools/src/load-data';
import {
  capitalCluster,
  continueForestSearch,
  createForestPlacement,
  detailForPixels,
  finestGridLevel,
  gridCellDegrees,
  levelWeight,
  placeForest,
  startForestSearch,
  valueAtZoom,
  writeInstanceMatrix,
  zoomFade,
} from '../src/render/scenery/scenery-placement';

const { scenery } = loadGameDataFromDisk().mapView;
const forests = scenery.forests;
const VARIANTS = [4, 4];

/** Land everywhere north of z = 0, all forest west of x = 10 and none east of it; height 100 m. */
const ground = {
  forestShare: (x: number) => (x < 10 ? 1 : 0),
  heightM: () => 100,
  onLand: (_x: number, z: number) => z > 0,
  latitude: (z: number) => z,
};

describe('forest placement (F133)', () => {
  const unitsPerPixel = 0.01; // about zoom 30 on a 1280-pixel window
  const rect = { minX: 0, maxX: 20, minZ: -5, maxZ: 7 };

  it('puts trees only on forested land, inside the rectangle', () => {
    const out = createForestPlacement(100_000);
    placeForest(out, rect, unitsPerPixel, forests, VARIANTS, ground);
    expect(out.count).toBeGreaterThan(100);
    for (let i = 0; i < out.count; i++) {
      expect(out.x[i]).toBeLessThan(10);
      expect(out.z[i]).toBeGreaterThan(0);
      expect(out.z[i]).toBeLessThanOrEqual(rect.maxZ);
      expect(out.groundM[i]).toBe(100);
      expect(out.variant[i]).toBeLessThan(4);
      expect(out.size[i]).toBeGreaterThanOrEqual(1 - forests.sizeVariation);
      expect(out.size[i]).toBeLessThanOrEqual(1 + forests.sizeVariation);
    }
  });

  it('is the same every time, and the same on every copy of the world', () => {
    const a = createForestPlacement(100_000);
    const b = createForestPlacement(100_000);
    placeForest(a, rect, unitsPerPixel, forests, VARIANTS, ground);
    placeForest(b, rect, unitsPerPixel, forests, VARIANTS, ground);
    expect(Array.from(a.x.subarray(0, a.count))).toEqual(Array.from(b.x.subarray(0, b.count)));
    // One world to the east: the same trees, 360 degrees further.
    const shifted = createForestPlacement(100_000);
    const eastGround = { ...ground, forestShare: (x: number) => ground.forestShare(x - 360) };
    placeForest(
      shifted,
      { ...rect, minX: rect.minX + 360, maxX: rect.maxX + 360 },
      unitsPerPixel,
      forests,
      VARIANTS,
      eastGround,
    );
    expect(shifted.count).toBe(a.count);
    for (let i = 0; i < a.count; i++) expect(shifted.x[i] - 360).toBeCloseTo(a.x[i], 3);
  });

  it('keeps the trees it had when the view zooms in, and adds new ones between them', () => {
    const far = createForestPlacement(100_000);
    const near = createForestPlacement(100_000);
    placeForest(far, rect, unitsPerPixel * 2, forests, VARIANTS, ground);
    placeForest(near, rect, unitsPerPixel, forests, VARIANTS, ground);
    expect(near.count).toBeGreaterThan(far.count * 2);
    const nearTrees = new Set(
      Array.from({ length: near.count }, (_, i) => `${near.x[i]},${near.z[i]}`),
    );
    for (let i = 0; i < far.count; i++) expect(nearTrees.has(`${far.x[i]},${far.z[i]}`)).toBe(true);
  });

  it('grows each grid level in smoothly between half the spacing and the full spacing', () => {
    const level = finestGridLevel(unitsPerPixel, forests.spacingPx);
    const cellPx = gridCellDegrees(level) / unitsPerPixel;
    expect(cellPx).toBeGreaterThanOrEqual(forests.spacingPx / 2);
    expect(cellPx).toBeLessThan(forests.spacingPx);
    expect(levelWeight(level - 2, unitsPerPixel, forests.spacingPx)).toBe(1);
    expect(levelWeight(level + 1, unitsPerPixel, forests.spacingPx)).toBe(0);
  });

  it('stops at the cap and can be done a slice at a time with the same result', () => {
    const capped = createForestPlacement(100_000);
    placeForest(capped, rect, unitsPerPixel, { ...forests, maxInstances: 50 }, VARIANTS, ground);
    expect(capped.count).toBe(50);
    const whole = createForestPlacement(100_000);
    placeForest(whole, rect, unitsPerPixel, forests, VARIANTS, ground);
    const sliced = createForestPlacement(100_000);
    const search = startForestSearch(sliced, rect, unitsPerPixel, forests);
    // A clock that runs out after every check: the search stops and goes on many times.
    let clock = 0;
    let slices = 0;
    while (!continueForestSearch(search, forests, VARIANTS, ground, clock + 0.5, () => clock++))
      slices += 1;
    expect(slices).toBeGreaterThan(3);
    expect(sliced.count).toBe(whole.count);
    expect(Array.from(sliced.z.subarray(0, sliced.count))).toEqual(
      Array.from(whole.z.subarray(0, whole.count)),
    );
  });

  it('chooses the tree model by latitude', () => {
    const out = createForestPlacement(100_000);
    const everywhere = { ...ground, forestShare: () => 1, onLand: () => true };
    placeForest(out, { minX: 0, maxX: 3, minZ: 0, maxZ: 80 }, 0.01, forests, VARIANTS, everywhere);
    const broadleaf = forests.models.findIndex((m) => m.model === 'treeBroadleaf');
    const conifer = forests.models.findIndex((m) => m.model === 'treeConifer');
    for (let i = 0; i < out.count; i++) {
      if (out.z[i] < 39) expect(out.model[i]).toBe(broadleaf);
      if (out.z[i] > 53) expect(out.model[i]).toBe(conifer);
    }
  });
});

describe('scenery sizes and detail (F133)', () => {
  it('reads values by zoom, fades in, and picks the detail level by size on screen', () => {
    expect(valueAtZoom(forests.sizePx, 1)).toBe(forests.sizePx[0].px);
    expect(valueAtZoom(forests.sizePx, 1000)).toBe(forests.sizePx.at(-1)!.px);
    expect(zoomFade(forests.fromZoom, forests.fullZoom, forests.fromZoom)).toBe(0);
    expect(zoomFade(forests.fromZoom, forests.fullZoom, forests.fullZoom)).toBe(1);
    expect(detailForPixels(scenery.simplePx - 1, scenery)).toBe('icon');
    expect(detailForPixels(scenery.simplePx, scenery)).toBe('simple');
    expect(detailForPixels(scenery.detailedPx, scenery)).toBe('detailed');
  });

  it('writes instance matrices in Babylon’s layout', () => {
    const matrices = new Float32Array(32);
    writeInstanceMatrix(matrices, 1, 5, 6, 7, 2, Math.PI / 2);
    expect(Array.from(matrices.subarray(16, 32)).map((v) => Math.round(v * 1000) / 1000)).toEqual([
      0, 0, -2, 0, 0, 2, 0, 0, 2, 0, 0, 0, 5, 6, 7, 1,
    ]);
  });

  it('lays out the same capital cluster for a country every time, the first building in the middle', () => {
    const a = capitalCluster(12, 7, 9, 6);
    expect(a).toEqual(capitalCluster(12, 7, 9, 6));
    expect(a).toHaveLength(7);
    expect(Math.hypot(a[0].offsetX, a[0].offsetZ)).toBe(0);
    for (const building of a) {
      expect(Math.hypot(building.offsetX, building.offsetZ)).toBeLessThanOrEqual(9.001);
      expect(building.variant).toBeLessThan(6);
    }
    expect(capitalCluster(13, 7, 9, 6)).not.toEqual(a);
  });
});
