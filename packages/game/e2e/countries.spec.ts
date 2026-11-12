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
  await expect(page.getByTestId('map-mode-bar').getByRole('button')).toHaveText([
    'Political',
    'Provinces',
    'Regions',
  ]);
  await expect(page.getByTestId('map-mode-political')).toHaveAttribute('aria-pressed', 'true');
  await waitForFrames(page);
  await shot('political-world');

  // A province names its owner; the name opens the country panel.
  await expect(page.getByTestId('country-panel')).toHaveCount(0);
  const paris = await screenPosition(page, ...PARIS);
  await page.mouse.click(paris.x, paris.y);
  await expect(page.getByTestId('province-country')).toHaveText('France');
  await page.getByTestId('province-country').click();
  await expect(page.getByTestId('country-name')).toHaveText('France');
  await expect(page.getByTestId('country-capital')).toHaveText('Île-de-France');
  await expect(page.getByTestId('country-provinces')).toHaveText('24');
  await expect(page.getByTestId('country-area')).toHaveText('657,414 km²');
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
  await shot('country-panel');

  // A neighbor's name shows that country; its capital's name selects the capital's province.
  await neighbors.filter({ hasText: 'Germany' }).click();
  await expect(page.getByTestId('country-name')).toHaveText('Germany');
  await expect(page.getByTestId('country-provinces')).toHaveText('16');
  await expect(page.getByTestId('province-name')).toHaveText('Île-de-France'); // unchanged
  await page.getByTestId('country-capital').click();
  await expect(page.getByTestId('province-name')).toHaveText('Berlin');
  await expect(page.getByTestId('province-country')).toHaveText('Germany');

  // The panels close separately.
  await page.getByTestId('country-close').click();
  await expect(page.getByTestId('country-panel')).toHaveCount(0);
  await expect(page.getByTestId('province-panel')).toHaveCount(1);

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

  await lookAt(page, 6, 49, 8);
  const strasbourg = await screenPosition(page, ...STRASBOURG);
  await page.mouse.click(strasbourg.x, strasbourg.y);
  await expect(page.getByTestId('province-name')).toHaveText('Grand Est');
  await expect(page.getByTestId('province-country')).toHaveText('France');
  await page.getByTestId('province-country').click();
  await expect(page.getByTestId('country-provinces')).toHaveText('24');
  await page.getByTestId('province-close').click();
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
  await page.getByTestId('province-close').click();
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

  // Gibraltar: British, on the coast of Spain.
  await lookAt(page, -5.35, 36.14, 40);
  const gibraltar = await screenPosition(page, -5.3536, 36.1408);
  await page.mouse.click(gibraltar.x, gibraltar.y);
  await expect(page.getByTestId('province-name')).toHaveText('Gibraltar');
  await expect(page.getByTestId('province-country')).toHaveText('United Kingdom');
  await expect(page.getByTestId('province-area')).toHaveText('6.8 km²');
  await expect(page.getByTestId('province-neighbors').getByRole('button')).toHaveText(['Cádiz']);
  await page.getByTestId('country-close').click();
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
