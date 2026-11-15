import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws the map in software, which is slow: give these tests more time.
test.setTimeout(150_000);

// A phone held upright, with a touch screen (about the size of an iPhone 13).
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const screenPosition = (page: Page, longitude: number, latitude: number) =>
  page.evaluate(([lon, lat]) => window.__terraScutum!.map.screenPosition(lon, lat)!, [
    longitude,
    latitude,
  ] as const);

type Point = { x: number; y: number };

/** Two fingers touch at `from`, move to `to` in a few steps, and lift (Chrome's touch input). */
async function pinch(page: Page, from: [Point, Point], to: [Point, Point]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const points = (t: number) =>
    from.map((start, i) => ({
      x: start.x + (to[i].x - start.x) * t,
      y: start.y + (to[i].y - start.y) * t,
      id: i,
    }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
  for (let step = 1; step <= 6; step++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(step / 6),
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('the game can be played on a phone: compact layout, taps and pinch zoom', async ({
  page,
}, testInfo) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  const shot = (name: string) =>
    page.screenshot({ path: join(SCREENSHOT_DIR, `mobile-${name}-${testInfo.project.name}.png`) });
  await page.goto('/?debug=country-selection');
  await page.waitForFunction(() => window.__terraScutum?.isReady() === true, null, {
    timeout: 90_000,
  });

  // The selection fills the top of the screen; the map mode box starts folded to its title.
  const selection = (await page.getByTestId('country-selection').boundingBox())!;
  expect(selection.width).toBeGreaterThan(360);
  expect(selection.y + selection.height).toBeLessThan(844 * 0.7);
  await expect(page.getByTestId('map-mode-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('map-mode-political')).toHaveCount(0);

  // A tap on the map picks a country.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(10, 44, 3));
  const umbria = await screenPosition(page, 12.6, 43.0);
  expect(umbria.y).toBeGreaterThan(selection.y + selection.height);
  await page.touchscreen.tap(umbria.x, umbria.y);
  await expect(page.getByTestId('selection-name')).toHaveText('Italy');
  // "Play as …" stays in view at the bottom of the panel.
  await expect(page.getByTestId('selection-play')).toBeInViewport();
  await shot('selection');
  await page.getByTestId('selection-play').tap();

  // The shell, compact: the top bar in two rows, the outliner folded, the lens bar as icons.
  await expect(page.getByTestId('top-bar-flag')).toBeVisible();
  const topBar = (await page.getByTestId('top-bar').boundingBox())!;
  expect(topBar.width).toBeLessThanOrEqual(390);
  await expect(page.getByTestId('outliner-toggle')).toHaveAttribute('aria-expanded', 'false');
  const lensBar = (await page.getByTestId('lens-bar').boundingBox())!;
  expect(lensBar.x).toBeGreaterThanOrEqual(0);
  expect(lensBar.x + lensBar.width).toBeLessThanOrEqual(390);
  await expect(page.getByTestId('lens-politics')).toHaveAccessibleName('Politics');
  // The map mode box opens and folds again.
  await page.getByTestId('map-mode-toggle').tap();
  await expect(page.getByTestId('map-mode-political')).toBeVisible();
  await expect(page.getByTestId('map-mode-bar')).toContainText('pinch');
  await page.getByTestId('map-mode-toggle').tap();
  await shot('shell');

  // Two fingers spreading apart zoom in; pinching them together zooms out. Neither is a tap.
  await page.evaluate(() => window.__terraScutum!.map.settle());
  const zoomBefore = await page.evaluate(() => window.__terraScutum!.map.zoom());
  await pinch(
    page,
    [
      { x: 160, y: 420 },
      { x: 230, y: 420 },
    ],
    [
      { x: 100, y: 420 },
      { x: 290, y: 420 },
    ],
  );
  const zoomAfter = await page.evaluate(() => window.__terraScutum!.map.zoom());
  expect(zoomAfter!).toBeGreaterThan(zoomBefore! * 2);
  await expect(page.getByTestId('province-panel')).toHaveCount(0);
  await pinch(
    page,
    [
      { x: 100, y: 420 },
      { x: 290, y: 420 },
    ],
    [
      { x: 160, y: 420 },
      { x: 230, y: 420 },
    ],
  );
  const zoomBack = await page.evaluate(() => window.__terraScutum!.map.zoom());
  expect(zoomBack!).toBeLessThan(zoomAfter! / 2);
  await expect(page.getByTestId('province-panel')).toHaveCount(0);

  // Up close in the Alps the land is real terrain (F125): a tap still lands on the province under
  // the finger. Its panel opens across the screen; the outliner and map mode box step aside.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(7.3, 45.5, 30));
  await page.waitForFunction(() => window.__terraScutum!.map.stats()!.terrainPending === 0, null, {
    timeout: 90_000,
  });
  const granParadiso = [7.27, 45.52] as const;
  expect(
    await page.evaluate(([lon, lat]) => window.__terraScutum!.map.heightAt(lon, lat), granParadiso),
  ).toBeGreaterThan(1500);
  const expected = await page.evaluate(
    ([lon, lat]) => window.__terraScutum!.map.provinceAt(lon, lat),
    granParadiso,
  );
  expect(expected).toMatch(/^ita_/);
  const peak = await screenPosition(page, ...granParadiso);
  await page.touchscreen.tap(peak.x, peak.y);
  expect(await page.evaluate(() => window.__terraScutum!.map.selectedProvince())).toBe(expected);
  await expect(page.getByTestId('province-panel')).toBeVisible();
  await expect(page.getByTestId('outliner')).toBeHidden();
  await expect(page.getByTestId('map-mode-bar')).toBeHidden();
  // The country screen fits the screen in one column.
  await page.getByTestId('province-country').tap();
  await expect(page.getByTestId('country-screen')).toHaveAttribute('data-view', 'government');
  const screen = (await page.getByTestId('country-screen').boundingBox())!;
  expect(screen.x + screen.width).toBeLessThanOrEqual(390);
  await shot('country-screen');

  expect(problems).toEqual([]);
});
