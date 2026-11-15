import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws the map in software, which is slow: give these tests more time.
test.setTimeout(180_000);

const map = (page: Page) => ({
  stats: () => page.evaluate(() => window.__terraScutum!.map.stats()!),
  heightAt: (longitude: number, latitude: number) =>
    page.evaluate(([lon, lat]) => window.__terraScutum!.map.heightAt(lon, lat)!, [
      longitude,
      latitude,
    ] as const),
  provinceAt: (longitude: number, latitude: number) =>
    page.evaluate(([lon, lat]) => window.__terraScutum!.map.provinceAt(lon, lat), [
      longitude,
      latitude,
    ] as const),
  screenPosition: (longitude: number, latitude: number) =>
    page.evaluate(([lon, lat]) => window.__terraScutum!.map.screenPosition(lon, lat)!, [
      longitude,
      latitude,
    ] as const),
  placeAt: (x: number, y: number) =>
    page.evaluate(([px, py]) => window.__terraScutum!.map.placeAt(px, py)!, [x, y] as const),
  selected: () => page.evaluate(() => window.__terraScutum!.map.selectedProvince()),
  /** Points the camera at a place and waits until the terrain for that view has arrived and is drawn. */
  async lookAt(longitude: number, latitude: number, zoom: number) {
    await page.evaluate(([lon, lat, z]) => window.__terraScutum!.map.lookAt(lon, lat, z), [
      longitude,
      latitude,
      zoom,
    ] as const);
    await page.waitForFunction(
      () => window.__terraScutum!.map.stats()!.terrainPending === 0,
      null,
      { timeout: 90_000 },
    );
    const frames = await page.evaluate(() => window.__terraScutum!.getFrameCount() ?? 0);
    await page.waitForFunction(
      (target) => (window.__terraScutum!.getFrameCount() ?? 0) >= target,
      frames + 3,
      { timeout: 60_000 },
    );
  },
});

const MONT_BLANC = [6.865, 45.833] as const;
const GULF_OF_GENOA = [9.0, 43.7] as const;
const MID_ATLANTIC = [-35, 48] as const;

test('the land is real terrain: finer the closer the view, with the map colors fading over it (F125)', async ({
  page,
}, testInfo) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `terrain-${name}-${testInfo.project.name}.png`),
    });
  await page.goto('/?debug=foundation');
  await page.waitForFunction(() => window.__terraScutum?.isReady() === true, null, {
    timeout: 90_000,
  });
  const view = map(page);

  // Strategic zoom: the coarsest terrain, the country colors strong, the relief much exaggerated.
  await view.lookAt(0, 0, 1);
  const world = await view.stats();
  expect(world.terrainLevel).toBe(0);
  expect(world.colorStrength).toBeCloseTo(0.8, 5);
  expect(world.exaggeration).toBeCloseTo(28, 5);
  // Even from far away the Alps are mountains and the open sea is flat.
  expect(await view.heightAt(...MONT_BLANC)).toBeGreaterThan(500);
  expect(await view.heightAt(...MID_ATLANTIC)).toBe(0);

  // Operational zoom: finer terrain, the colors about half as strong.
  await view.lookAt(10, 48, 6);
  const europe = await view.stats();
  expect(europe.terrainLevel).toBe(2);
  expect(europe.colorStrength).toBeCloseTo(0.5, 5);
  expect(europe.terrainTiles).toBeLessThan(40);
  await shot('operational');

  // Close zoom: the finest terrain, the colors faint, the land less exaggerated.
  await view.lookAt(7.4, 46.0, 40);
  const alps = await view.stats();
  expect(alps.terrainLevel).toBe(4);
  expect(alps.colorStrength).toBeCloseTo(0.15, 5);
  expect(alps.exaggeration).toBeLessThan(world.exaggeration / 3);
  expect(alps.drawnTriangles).toBeLessThan(400_000);
  expect(await view.heightAt(...MONT_BLANC)).toBeGreaterThan(2500);
  expect(await view.heightAt(...GULF_OF_GENOA)).toBe(0);
  await shot('close');

  // The mouse meets the land where it is drawn: a place high in the mountains is found again
  // exactly from its spot on the screen, and a click there selects the province it lies in.
  const peak = await view.screenPosition(...MONT_BLANC);
  const found = await view.placeAt(peak.x, peak.y);
  expect(found.longitude).toBeCloseTo(MONT_BLANC[0], 2);
  expect(found.latitude).toBeCloseTo(MONT_BLANC[1], 2);
  for (const [longitude, latitude] of [
    [7.75, 46.02], // near the Matterhorn
    [8.0, 45.6], // the Italian foothills
    [6.6, 46.4], // by Lake Geneva
  ] as const) {
    const expected = await view.provinceAt(longitude, latitude);
    expect(expected).not.toBeNull();
    const spot = await view.screenPosition(longitude, latitude);
    await page.mouse.click(spot.x, spot.y);
    expect(await view.selected()).toBe(expected);
  }
  await shot('close-selected');

  // The Provinces map mode shows the natural terrain: no map color at all.
  await page.getByTestId('map-mode-provinces').click();
  await expect(page.getByTestId('map-mode-provinces')).toHaveAttribute('aria-pressed', 'true');
  expect((await view.stats()).colorStrength).toBe(0);
  await page.mouse.move(640, 20);
  await shot('natural');
  await page.getByTestId('map-mode-political').click();
  expect((await view.stats()).colorStrength).toBeCloseTo(0.15, 5);

  // Dragging in the mountains: the place that was grabbed stays under the mouse.
  const grabbed = await view.placeAt(640, 400);
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(600, 430, { steps: 4 });
  await page.mouse.up();
  const dropped = await view.placeAt(600, 430);
  expect(dropped.longitude).toBeCloseTo(grabbed.longitude, 1);
  expect(dropped.latitude).toBeCloseTo(grabbed.latitude, 1);

  // Back out: the coarse terrain again; the credits for the data are in the settings.
  await view.lookAt(0, 0, 1);
  expect((await view.stats()).terrainLevel).toBe(0);
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-tab-about').click();
  await expect(page.getByTestId('credits')).toContainText('ESA WorldCover');
  await expect(page.getByTestId('credits')).toContainText('Natural Earth');

  expect(problems).toEqual([]);
});
