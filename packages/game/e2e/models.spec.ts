import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import { cubeGlb } from './glb';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws in software, and thousands of trees are slow there: give these tests time.
test.setTimeout(240_000);

/** Points the camera at a place and waits until the terrain and the scenery for that view are ready and drawn. */
async function lookAt(page: Page, longitude: number, latitude: number, zoom: number) {
  await page.evaluate(([lon, lat, z]) => window.__terraScutum!.map.lookAt(lon, lat, z), [
    longitude,
    latitude,
    zoom,
  ] as const);
  await page.waitForFunction(
    () => {
      const stats = window.__terraScutum!.map.stats()!;
      return stats.terrainPending === 0 && !stats.scenery.searching;
    },
    null,
    { timeout: 150_000 },
  );
  const frames = await page.evaluate(() => window.__terraScutum!.getFrameCount() ?? 0);
  await page.waitForFunction(
    (target) => (window.__terraScutum!.getFrameCount() ?? 0) >= target,
    frames + 2,
    { timeout: 90_000 },
  );
}

const scenery = (page: Page) => page.evaluate(() => window.__terraScutum!.map.stats()!.scenery);

test('forests and capital markers stand on the land (F133)', async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.goto('/?debug=foundation');
  await page.waitForFunction(() => window.__terraScutum?.isReady() === true, null, {
    timeout: 120_000,
  });

  // The whole world: no trees yet (they grow in from the operational zoom), no capital markers.
  await lookAt(page, 0, 20, 1);
  const far = await scenery(page);
  expect(far.trees).toBe(0);
  expect(far.capitalBuildings).toBe(0);

  // The Amazon: a forest of trees, standing on the land as drawn.
  await lookAt(page, -62, -4, 10);
  const amazon = await scenery(page);
  expect(amazon.trees).toBeGreaterThan(2000);
  expect(amazon.treeDetail).not.toBeNull();
  // One draw call per model variant and material, however many trees.
  expect(amazon.drawCalls).toBeLessThan(60);
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${testInfo.project.name}-forest-amazon.png`),
  });
  const probes = await page.evaluate(() => window.__terraScutum!.map.sceneryProbe(300)!);
  const trees = probes.filter((probe) => probe.kind === 'tree');
  expect(trees.length).toBeGreaterThan(100);
  for (const tree of trees.slice(0, 60)) {
    const [ground, province] = await page.evaluate(
      ([lon, lat]) => [
        window.__terraScutum!.map.heightAt(lon, lat)!,
        window.__terraScutum!.map.provinceAt(lon, lat),
      ],
      [tree.longitude, tree.latitude] as const,
    );
    // On the land (never in the sea), its foot on the ground as drawn (within a few metres).
    expect(province).not.toBeNull();
    expect(Math.abs(tree.baseM - ground)).toBeLessThan(5);
    // A small symbol: never taller than the largest size in the data.
    expect(tree.heightPx).toBeLessThan(20);
  }

  // The middle of the Sahara has no forest.
  await lookAt(page, 10, 24, 25);
  expect((await scenery(page)).trees).toBeLessThan(20);

  // Paris: the placeholder capital buildings around the capital, drawn simply from this far.
  await lookAt(page, 2.35, 48.85, 5);
  const paris = await scenery(page);
  expect(paris.capitalBuildings).toBeGreaterThan(20);
  const buildings = (await page.evaluate(() => window.__terraScutum!.map.sceneryProbe(100_000)!))
    .filter((probe) => probe.kind === 'building')
    .filter(
      (probe) => Math.abs(probe.longitude - 2.35) < 1.5 && Math.abs(probe.latitude - 48.85) < 1.5,
    );
  expect(buildings.length).toBeGreaterThanOrEqual(5);

  // Up close in the Black Forest: the detailed trees.
  await lookAt(page, 8.2, 48.3, 70);
  const close = await scenery(page);
  expect(close.trees).toBeGreaterThan(1000);
  expect(close.treeDetail).toBe('detailed');
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${testInfo.project.name}-forest-close.png`),
  });
  expect(problems).toEqual([]);
});

test('the model gallery shows every model in three detail levels, and a model file can replace one (F133)', async ({
  page,
}, testInfo) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.goto('/?debug=models');
  await page.waitForFunction(
    () => window.__terraScutum?.isReady() === true && window.__terraScutum.gallery.isComplete(),
    null,
    { timeout: 120_000 },
  );
  await expect(page.getByRole('heading', { name: 'Model gallery' })).toBeVisible();
  const stats = (await page.evaluate(() => window.__terraScutum!.gallery.stats()))!;
  expect(stats.map((model) => model.modelId)).toEqual([
    'treeConifer',
    'treeBroadleaf',
    'boxBuilding',
  ]);
  for (const model of stats) {
    expect(model.source).toBe('generator');
    const { icon, simple, detailed } = model.triangles;
    // Each detail level has more faces than the one before it.
    expect(icon).toBeGreaterThan(0);
    expect(simple!).toBeGreaterThan(icon!);
    expect(detailed!).toBeGreaterThan(simple!);
  }
  await expect(page.locator('.model-gallery-label-model')).toHaveCount(3);
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${testInfo.project.name}-model-gallery.png`),
  });

  // A model file in place of the generated building: the rest of the game doesn't notice.
  const bytes = Array.from(cubeGlb(12));
  await page.evaluate((glb) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(glb)], { type: 'model/gltf-binary' }));
    window.__terraScutum!.gallery.replaceWithFile('boxBuilding', url);
  }, bytes);
  await page.waitForFunction(
    () =>
      window.__terraScutum!.gallery.isComplete() &&
      window.__terraScutum!.gallery.stats()![2].source === 'file',
    null,
    { timeout: 120_000 },
  );
  const replaced = (await page.evaluate(() => window.__terraScutum!.gallery.stats()))![2];
  expect(replaced.variants).toBe(1);
  expect(replaced.triangles).toEqual({ icon: 12, simple: 12, detailed: 12 });
  expect(replaced.heightM).toBeCloseTo(12, 3);
  await expect(page.locator('[data-model="boxBuilding"]')).toContainText('model file');
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${testInfo.project.name}-model-gallery-file.png`),
  });
  expect(problems).toEqual([]);
});
