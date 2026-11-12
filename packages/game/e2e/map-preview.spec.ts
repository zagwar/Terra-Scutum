import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// The map preview is drawn with a 2D canvas, so it doesn't depend on the 3D renderer: test it once.
test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'webgl2', 'the map preview does not use the 3D renderer');
});

test('the map data preview shows the generated world and its details', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });

  await page.goto('/map-preview.html');
  await page.waitForFunction(() => window.__mapPreview?.ready === true, null, { timeout: 30_000 });
  const counts = await page.evaluate(() => window.__mapPreview!.counts);
  expect(counts.countries).toBeGreaterThan(150);
  expect(counts.provinces).toBeGreaterThan(1000);
  expect(counts.regions).toBeGreaterThan(40);
  expect(counts.seaZones).toBeGreaterThan(100);
  await expect(page.getByTestId('map-preview-status')).toContainText('provinces');
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'map-preview-countries.png') });

  // Picking: Paris is in a French province, the middle of the North Atlantic is a sea zone.
  const paris = await page.evaluate(() => window.__mapPreview!.pick(2.35, 48.86));
  expect(paris?.kind).toBe('province');
  expect(paris?.id).toMatch(/^fra_/);
  const atlantic = await page.evaluate(() => window.__mapPreview!.pick(-35, 48));
  expect(atlantic).toEqual({ kind: 'seaZone', id: 'north_atlantic' });
  // The map loops east–west: one full turn around the world lands on Paris again.
  expect(await page.evaluate(() => window.__mapPreview!.pick(2.35 + 360, 48.86))).toEqual(paris);

  // Dragging far to the east keeps showing the map (no edge).
  const canvas = page.locator('canvas.map-preview-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'map-preview-wrapped.png') });
  await page.getByRole('button', { name: 'Reset view' }).click();

  // Selecting shows the details panel with neighbors.
  await page.evaluate((id) => window.__mapPreview!.select({ kind: 'province', id }), paris!.id);
  await expect(page.getByTestId('details-title')).toBeVisible();
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'map-preview-selected.png') });

  await page.getByTestId('mode-regions').click();
  await page.evaluate(() => window.__mapPreview!.select(null));
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'map-preview-regions.png') });
  await page.getByTestId('mode-seaZones').click();
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'map-preview-sea-zones.png') });

  expect(problems).toEqual([]);
});

test('the game page links to the map preview', async ({ page }) => {
  await page.goto('/?debug=foundation');
  await page.getByTestId('map-preview-link').click();
  await expect(page).toHaveURL(/map-preview\.html$/);
  await page.waitForFunction(() => window.__mapPreview?.ready === true, null, { timeout: 30_000 });
});
