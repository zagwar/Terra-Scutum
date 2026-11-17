import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws the map in software, which is slow: give these tests more time.
test.setTimeout(150_000);

/** Opens the game and waits until the renderer, the sim and the world map are ready. */
async function openMap(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  await page.goto('/?debug=foundation');
  await page.waitForFunction(() => window.__terraScutum?.isReady() === true, null, {
    timeout: 90_000,
  });
  return problems;
}

/** Waits until the 3D view has drawn a few more frames (so a change is really on screen). */
async function waitForFrames(page: Page, frames = 2): Promise<void> {
  const before = await page.evaluate(() => window.__terraScutum!.getFrameCount() ?? 0);
  await page.waitForFunction(
    (target) => (window.__terraScutum!.getFrameCount() ?? 0) >= target,
    before + frames,
    { timeout: 60_000 },
  );
}

/** Where a place is on the page right now. */
const screenPosition = (page: Page, longitude: number, latitude: number) =>
  page.evaluate(([lon, lat]) => window.__terraScutum!.map.screenPosition(lon, lat)!, [
    longitude,
    latitude,
  ] as const);

const lookAt = (page: Page, longitude: number, latitude: number, zoom: number) =>
  page.evaluate(([lon, lat, z]) => window.__terraScutum!.map.lookAt(lon, lat, z), [
    longitude,
    latitude,
    zoom,
  ] as const);

const PARIS = [2.35, 48.86] as const;
const STRASBOURG = [7.75, 48.58] as const;

test('the political map is the default; a province opens its country panel', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `countries-${name}-${testInfo.project.name}.png`),
    });

  // The political map mode comes first and is on from the start.
  await expect(page.getByTestId('map-mode-bar').locator('.button-row button')).toHaveText([
    'Political',
    'Provinces',
    'Regions',
    'Sea zones',
    'Population',
    'Industry',
  ]);
  await expect(page.getByTestId('map-mode-political')).toHaveAttribute('aria-pressed', 'true');
  await waitForFrames(page);
  await shot('political-world');

  // A province names its owner; the name opens the country screen.
  await expect(page.getByTestId('country-screen')).toHaveCount(0);
  const paris = await screenPosition(page, ...PARIS);
  await page.mouse.click(paris.x, paris.y);
  await expect(page.getByTestId('province-country')).toHaveText('France');
  await page.getByTestId('province-country').click();
  await expect(page.getByTestId('country-name')).toHaveText('France');
  await expect(page.getByTestId('country-capital')).toHaveText('Île-de-France');
  await expect(page.getByTestId('country-provinces')).toHaveText('24');
  await expect(page.getByTestId('country-area')).toHaveText('657,414 km²');
  // Real-world starting data (F71): France with its overseas collectivities.
  await expect(page.getByTestId('country-government')).toHaveText('Presidential democracy');
  await expect(page.getByTestId('country-population')).toHaveText('69.3 million');
  await expect(page.getByTestId('country-gdp')).toHaveText('$3.4 trillion');
  await expect(page.getByTestId('country-gdp-per-person')).toHaveText('$49,019');
  await expect(page.getByTestId('country-screen')).toContainText('real-world figures for 2025');
  const neighbors = page.getByTestId('country-neighbors').getByRole('button');
  await expect(neighbors).toHaveText([
    'Andorra',
    'Belgium',
    'Brazil',
    'Germany',
    'Italy',
    'Luxembourg',
    'Monaco',
    'Netherlands',
    'Spain',
    'Suriname',
    'Switzerland',
  ]);
  await waitForFrames(page);
  await shot('country-screen');

  // A neighbor's name shows that country; its capital's name selects the capital's province.
  // One panel at a time (F122): the country screen took the province panel's place.
  await expect(page.getByTestId('province-panel')).toHaveCount(0);
  await neighbors.filter({ hasText: 'Germany' }).click();
  await expect(page.getByTestId('country-name')).toHaveText('Germany');
  await expect(page.getByTestId('country-provinces')).toHaveText('16');
  await page.getByTestId('country-capital').click();
  await expect(page.getByTestId('province-name')).toHaveText('Berlin');
  await expect(page.getByTestId('province-country')).toHaveText('Germany');

  // Back walks the way back: Germany, France, then Île-de-France; ✕ closes the panel.
  await page.getByTestId('panel-back').click();
  await expect(page.getByTestId('country-name')).toHaveText('Germany');
  await page.getByTestId('panel-back').click();
  await expect(page.getByTestId('country-name')).toHaveText('France');
  await page.getByTestId('panel-back').click();
  await expect(page.getByTestId('province-name')).toHaveText('Île-de-France');
  await expect(page.getByTestId('panel-back')).toHaveCount(0);
  await page.getByTestId('province-close').click();
  await expect(page.getByTestId('province-panel')).toHaveCount(0);

  // The other map modes still work, and the political one comes back.
  await page.getByTestId('map-mode-provinces').click();
  await expect(page.getByTestId('map-mode-political')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('map-mode-political').click();
  await expect(page.getByTestId('map-mode-political')).toHaveAttribute('aria-pressed', 'true');

  expect(problems).toEqual([]);
});

test('the map and the panels follow a change of owner', async ({ page }, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `countries-${name}-${testInfo.project.name}.png`),
    });

  // Strasbourg must stay clear of the country screen (F138), which covers the left of the map
  // up to about x = 730: put it at x = 850, between the screen and the outliner.
  await lookAt(page, 6, 49, 8);
  const oneDegree = (await screenPosition(page, 7, 49)).x - (await screenPosition(page, 6, 49)).x;
  await lookAt(page, STRASBOURG[0] - (850 - 640) / oneDegree, 49, 8);
  const strasbourg = await screenPosition(page, ...STRASBOURG);
  expect(strasbourg.x).toBeGreaterThan(760);
  expect(strasbourg.x).toBeLessThan(940);
  await page.mouse.click(strasbourg.x, strasbourg.y);
  await expect(page.getByTestId('province-name')).toHaveText('Grand Est');
  await expect(page.getByTestId('province-country')).toHaveText('France');
  await page.getByTestId('province-country').click();
  await expect(page.getByTestId('country-provinces')).toHaveText('24');
  await page.mouse.move(strasbourg.x, strasbourg.y);
  await expect(page.getByTestId('map-tooltip')).toHaveText('Grand Est · France');
  await waitForFrames(page, 3);
  await shot('before-owner-change');

  // The sim hands Grand Est to Germany (as a war will later).
  const result = await page.evaluate(() =>
    window.__terraScutum!.sendCommand({
      type: 'debugSetProvinceOwner',
      province: 'fra_grand_est',
      country: 'DEU',
    }),
  );
  expect(result).toEqual({ ok: true });
  expect(await page.evaluate(() => window.__terraScutum!.events.at(-1))).toEqual({
    type: 'provinceOwnerChanged',
    province: 'fra_grand_est',
    from: 'FRA',
    to: 'DEU',
  });

  // The tooltip, the country panel and the province panel all show the new owner.
  await expect(page.getByTestId('map-tooltip')).toHaveText('Grand Est · Germany');
  await expect(page.getByTestId('country-name')).toHaveText('France');
  await expect(page.getByTestId('country-provinces')).toHaveText('23');
  await expect(page.getByTestId('country-area')).toHaveText('600,235 km²');
  await page.mouse.click(strasbourg.x, strasbourg.y);
  await expect(page.getByTestId('province-country')).toHaveText('Germany');
  await page.getByTestId('province-country').click();
  await expect(page.getByTestId('country-name')).toHaveText('Germany');
  await expect(page.getByTestId('country-provinces')).toHaveText('17');
  await page.mouse.move(strasbourg.x, 30);
  await waitForFrames(page, 3);
  await shot('after-owner-change');

  // Days pass: the owners stay (the sim only sends them again when they change).
  await page.evaluate(() => window.__terraScutum!.step(3));
  await expect(page.getByTestId('country-provinces')).toHaveText('17');

  // Zoomed out, the far level of detail shows the change too.
  await page.getByTestId('country-close').click();
  await lookAt(page, 0, 0, 1);
  await waitForFrames(page, 3);
  await shot('after-owner-change-world');

  expect(problems).toEqual([]);
});

test('the mouse wheel zooms, dragging moves the map, and a province picked from a list comes into view', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `countries-${name}-${testInfo.project.name}.png`),
    });
  const map = {
    zoom: () => page.evaluate(() => window.__terraScutum!.map.zoom()!),
    center: () => page.evaluate(() => window.__terraScutum!.map.centerLongitude()!),
    selected: () => page.evaluate(() => window.__terraScutum!.map.selectedProvince()),
  };
  const ROME = [12.4534, 41.9033] as const;

  // Zooming in with the wheel keeps the place under the mouse exactly where it is.
  expect(await map.zoom()).toBe(1);
  const placeAt = (x: number, y: number) =>
    page.evaluate(([px, py]) => window.__terraScutum!.map.placeAt(px, py)!, [x, y] as const);
  const aimAt = async (longitude: number, latitude: number) => {
    const position = await screenPosition(page, longitude, latitude);
    const point = { x: Math.round(position.x), y: Math.round(position.y) };
    await page.mouse.move(point.x, point.y);
    return point;
  };
  let mouse = await aimAt(...ROME);
  const placeBefore = await placeAt(mouse.x, mouse.y);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
  // The camera glides; finish the glide before measuring.
  await page.evaluate(() => window.__terraScutum!.map.settle());
  expect(await map.zoom()).toBeCloseTo(1.25 ** 8, 6);
  const placeAfter = await placeAt(mouse.x, mouse.y);
  // Within 0.005° (about a tenth of a pixel at this zoom): finer terrain arriving during the
  // zoom can lift the ground under the mouse a little (WebGPU once missed 0.0005° by 0.0002°).
  expect(placeAfter.longitude).toBeCloseTo(placeBefore.longitude, 2);
  expect(placeAfter.latitude).toBeCloseTo(placeBefore.latitude, 2);

  // So a tiny country can be reached by hand: aim at Rome, zoom in, aim again, click.
  await aimAt(...ROME);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
  await page.evaluate(() => window.__terraScutum!.map.settle());
  mouse = await aimAt(...ROME);
  await expect(page.getByTestId('map-tooltip')).toHaveText('Vatican City · Vatican City');
  await page.mouse.click(mouse.x, mouse.y);
  await expect(page.getByTestId('province-name')).toHaveText('Vatican City');
  await waitForFrames(page, 3);
  await shot('zoomed-with-wheel');

  // The zoom stops at its limit, and zooming out ends with the whole world in view.
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -100);
  await page.evaluate(() => window.__terraScutum!.map.settle());
  expect(await map.zoom()).toBe(80);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 100);
  await page.evaluate(() => window.__terraScutum!.map.settle());
  expect(await map.zoom()).toBe(1);

  // Dragging moves the map with the mouse and does not count as a click.
  await page.getByTestId('province-close').click();
  const start = await screenPosition(page, 20, 10);
  const longitudeBefore = await map.center();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 60, start.y, { steps: 4 });
  await page.mouse.move(start.x - 120, start.y, { steps: 4 });
  await page.mouse.up();
  expect(await map.center()).toBeGreaterThan(longitudeBefore + 10);
  expect(await map.selected()).toBeNull();
  // The place that was grabbed is still under the mouse.
  const grabbed = await screenPosition(page, 20, 10);
  expect(Math.abs(grabbed.x - (start.x - 120))).toBeLessThan(3);

  // Zoomed in, dragging also moves north and south, and the arrow keys move the map.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(10, 50, 6));
  const paris = await screenPosition(page, ...PARIS);
  await page.mouse.move(paris.x, paris.y);
  await page.mouse.down();
  await page.mouse.move(paris.x + 40, paris.y + 80, { steps: 5 });
  await page.mouse.up();
  const parisDragged = await screenPosition(page, ...PARIS);
  expect(Math.abs(parisDragged.x - (paris.x + 40))).toBeLessThan(3);
  expect(Math.abs(parisDragged.y - (paris.y + 80))).toBeLessThan(3);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(
    ([lon, lat, y]) => window.__terraScutum!.map.screenPosition(lon, lat)!.y > y + 20,
    [...PARIS, parisDragged.y] as const,
    { timeout: 60_000 },
  );
  await page.keyboard.up('ArrowUp');

  // A province picked from a list is brought into view, zoomed in if it is tiny.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(0, 0, 1));
  const lazio = await screenPosition(page, 12.9, 41.5);
  await page.mouse.click(lazio.x, lazio.y);
  await expect(page.getByTestId('province-name')).toHaveText('Lazio');
  await page
    .getByTestId('province-neighbors')
    .getByRole('button')
    .filter({ hasText: 'Vatican City' })
    .click();
  await expect(page.getByTestId('province-name')).toHaveText('Vatican City');
  await page.evaluate(() => window.__terraScutum!.map.settle());
  expect(await map.zoom()).toBeGreaterThan(20);
  const vatican = await screenPosition(page, ...ROME);
  expect(Math.abs(vatican.x - 640)).toBeLessThan(40);
  expect(Math.abs(vatican.y - 360)).toBeLessThan(60);
  await waitForFrames(page, 3);
  await shot('focused-from-list');

  expect(problems).toEqual([]);
});

test('the tiny provinces can be seen and clicked', async ({ page }, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `countries-${name}-${testInfo.project.name}.png`),
    });

  // Vatican City: a country of one province, inside Italy.
  await lookAt(page, 12.45, 41.9, 40);
  const vatican = await screenPosition(page, 12.4534, 41.9033);
  await page.mouse.click(vatican.x, vatican.y);
  await expect(page.getByTestId('province-name')).toHaveText('Vatican City');
  await expect(page.getByTestId('province-area')).toHaveText('0.5 km²');
  await expect(page.getByTestId('province-neighbors').getByRole('button')).toHaveText(['Lazio']);
  await page.getByTestId('province-country').click();
  await expect(page.getByTestId('country-name')).toHaveText('Vatican City');
  await expect(page.getByTestId('country-provinces')).toHaveText('1');
  await expect(page.getByTestId('country-neighbors').getByRole('button')).toHaveText(['Italy']);
  await waitForFrames(page, 3);
  await shot('vatican-city');
  // The country screen covers the left of the map (F138): close it before clicking there.
  await page.getByTestId('country-close').click();

  // Gibraltar: British, on the coast of Spain.
  await lookAt(page, -5.35, 36.14, 40);
  const gibraltar = await screenPosition(page, -5.3536, 36.1408);
  await page.mouse.click(gibraltar.x, gibraltar.y);
  await expect(page.getByTestId('province-name')).toHaveText('Gibraltar');
  await expect(page.getByTestId('province-country')).toHaveText('United Kingdom');
  await expect(page.getByTestId('province-area')).toHaveText('6.8 km²');
  await expect(page.getByTestId('province-neighbors').getByRole('button')).toHaveText([
    'Andalusia',
  ]);
  await page.getByTestId('province-close').click();
  await waitForFrames(page, 3);
  await shot('gibraltar');

  // The British Indian Ocean Territory: an island province far from everything.
  await lookAt(page, 72.43, -7.33, 40);
  const diegoGarcia = await screenPosition(page, 72.43, -7.33);
  await page.mouse.click(diegoGarcia.x, diegoGarcia.y);
  await expect(page.getByTestId('province-name')).toHaveText('British Indian Ocean Territory');
  await expect(page.getByTestId('province-area')).toHaveText('60 km²');

  expect(problems).toEqual([]);
});
