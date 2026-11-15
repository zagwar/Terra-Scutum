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
  await page.goto('/?debug=scenery');
  await page.waitForFunction(() => window.__terraScutum?.isReady() === true, null, {
    timeout: 120_000,
  });

  // The whole world, then a few countries in view: no trees or capital markers yet
  // (designer decision: both appear from zoom 14, when the forests are dense).
  for (const zoom of [1, 11]) {
    await lookAt(page, 15, 55, zoom);
    expect(await scenery(page)).toMatchObject({ trees: 0, capitalBuildings: 0 });
  }

  // Panama: forests right by the sea, standing on the land as drawn.
  await lookAt(page, -79.5, 8.8, 18);
  const coast = await scenery(page);
  expect(coast.trees).toBeGreaterThan(1000);
  expect(coast.treeDetail).not.toBeNull();
  // One draw call per model variant and material, however many trees.
  expect(coast.drawCalls).toBeLessThan(60);
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${testInfo.project.name}-forest-panama.png`),
  });
  // Each tree on the land (never in the sea), its foot on the ground as drawn (within a few
  // metres), and a small symbol (never taller than the largest size in the data).
  const trees = await page.evaluate(() =>
    window
      .__terraScutum!.map.sceneryProbe(300)!
      .filter((probe) => probe.kind === 'tree')
      .slice(0, 100)
      .map((tree) => ({
        ...tree,
        ground: window.__terraScutum!.map.heightAt(tree.longitude, tree.latitude)!,
        province: window.__terraScutum!.map.provinceAt(tree.longitude, tree.latitude),
      })),
  );
  expect(trees.length).toBe(100);
  for (const tree of trees) {
    expect(tree.province).not.toBeNull();
    expect(Math.abs(tree.baseM - tree.ground)).toBeLessThan(5);
    expect(tree.heightPx).toBeLessThan(20);
  }

  // Close up at Madrid (dry land, few trees: quick to draw in the test browser): the placeholder
  // capital buildings, and the trees at their detailed level.
  await lookAt(page, -3.7, 40.42, 60);
  const madrid = await scenery(page);
  expect(madrid.treeDetail).toBe('detailed');
  expect(madrid.trees).toBeGreaterThan(20);
  const buildings = (
    await page.evaluate(() => window.__terraScutum!.map.sceneryProbe(100_000)!)
  ).filter(
    (probe) =>
      probe.kind === 'building' &&
      Math.abs(probe.longitude + 3.7) < 1 &&
      Math.abs(probe.latitude - 40.42) < 1,
  );
  expect(buildings.length).toBeGreaterThanOrEqual(5);
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
