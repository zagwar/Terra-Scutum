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

const screenPosition = (page: Page, longitude: number, latitude: number) =>
  page.evaluate(([lon, lat]) => window.__terraScutum!.map.screenPosition(lon, lat)!, [
    longitude,
    latitude,
  ] as const);

const NORTH_SEA = [3, 56] as const;
const PARIS = [2.35, 48.86] as const;

test('sea zones can be hovered and clicked; their panel links to sea zones and provinces', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `sea-zones-${name}-${testInfo.project.name}.png`),
    });
  const map = {
    selectedSeaZone: () => page.evaluate(() => window.__terraScutum!.map.selectedSeaZone()),
    selectedProvince: () => page.evaluate(() => window.__terraScutum!.map.selectedProvince()),
  };

  // Land wins over the sea zone shapes underneath it.
  expect(await page.evaluate(() => window.__terraScutum!.map.seaZoneAt(3, 56))).toBe('north_sea');
  expect(await page.evaluate(() => window.__terraScutum!.map.seaZoneAt(2.35, 48.86))).toBeNull();

  // Zoom in on Europe so the North Sea is big on screen.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(5, 54, 6));
  const northSea = await screenPosition(page, ...NORTH_SEA);

  // Hovering the sea names the sea zone.
  await page.mouse.move(northSea.x, northSea.y);
  await expect(page.getByTestId('map-tooltip')).toHaveText('North Sea');

  // Clicking opens the sea zone panel: name, type, depth, bordering sea zones, coastal provinces.
  // The middle of the North Sea is open sea; the coast zone runs around it.
  await page.mouse.click(northSea.x, northSea.y);
  await expect(page.getByTestId('sea-zone-name')).toHaveText('North Sea');
  await expect(page.getByTestId('sea-zone-type')).toHaveText('Open sea');
  await expect(page.getByTestId('sea-zone-depth')).toHaveText('Shallow');
  const neighbors = page.getByTestId('sea-zone-neighbors').getByRole('button');
  await expect(neighbors.filter({ hasText: 'North Sea Coast' })).toHaveCount(1);
  expect(await map.selectedSeaZone()).toBe('north_sea');
  await waitForFrames(page);
  await shot('selected');

  // A bordering sea zone's name selects that sea zone and brings it into view.
  await neighbors.filter({ hasText: 'North Sea Coast' }).click();
  await expect(page.getByTestId('sea-zone-name')).toHaveText('North Sea Coast');
  await expect(page.getByTestId('sea-zone-type')).toHaveText('Coast zone');
  expect(await map.selectedSeaZone()).toBe('north_sea_coast');
  const coasts = page.getByTestId('sea-zone-coasts').getByRole('button');
  await expect(coasts.filter({ hasText: 'Lower Saxony' })).toHaveCount(1);
  await expect(coasts.filter({ hasText: 'East of England' })).toHaveCount(1);
  await page
    .getByTestId('sea-zone-neighbors')
    .getByRole('button', { name: 'English Channel' })
    .click();
  await expect(page.getByTestId('sea-zone-name')).toHaveText('English Channel');
  expect(await map.selectedSeaZone()).toBe('english_channel');
  await waitForFrames(page);
  await shot('coast-zone');

  // A coastal province's name selects the province (the sea zone panel makes way).
  await page.getByTestId('sea-zone-coasts').getByRole('button', { name: 'Normandie' }).click();
  await expect(page.getByTestId('province-name')).toHaveText('Normandie');
  await expect(page.getByTestId('sea-zone-panel')).toHaveCount(0);
  expect(await map.selectedSeaZone()).toBeNull();

  // The province panel's sea zone names are links back to the sea zone.
  await page
    .getByTestId('province-sea-zones')
    .getByRole('button', { name: 'English Channel' })
    .click();
  await expect(page.getByTestId('sea-zone-name')).toHaveText('English Channel');
  await expect(page.getByTestId('province-panel')).toHaveCount(0);
  expect(await map.selectedProvince()).toBeNull();

  // Clicking land selects the province again.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(2, 50, 4));
  const paris = await screenPosition(page, ...PARIS);
  await page.mouse.click(paris.x, paris.y);
  await expect(page.getByTestId('province-name')).toHaveText('Île-de-France');
  await expect(page.getByTestId('sea-zone-panel')).toHaveCount(0);

  expect(problems).toEqual([]);
});

test('the sea zones map mode makes the sea zone borders and the coast stand out', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `sea-zones-${name}-${testInfo.project.name}.png`),
    });

  await page.getByTestId('map-mode-seaZones').click();
  await expect(page.getByTestId('map-mode-seaZones')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-mode-political')).toHaveAttribute('aria-pressed', 'false');
  // Keep the mouse off the map so nothing is highlighted in the pictures.
  await page.mouse.move(640, 5);
  await waitForFrames(page);
  await shot('mode-world');

  await page.evaluate(() => window.__terraScutum!.map.lookAt(125, 15, 3));
  await waitForFrames(page);
  await shot('mode-east-asia');

  // Picking a sea zone works in this map mode too.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(5, 54, 4));
  const northSea = await screenPosition(page, ...NORTH_SEA);
  await page.mouse.click(northSea.x, northSea.y);
  await expect(page.getByTestId('sea-zone-name')).toHaveText('North Sea');
  await page.mouse.move(640, 5);
  await waitForFrames(page);
  await shot('mode-europe-selected');

  // Back to the political map: today's deep and shallow sea.
  await page.getByTestId('map-mode-political').click();
  await waitForFrames(page);
  await shot('political-europe');

  expect(problems).toEqual([]);
});
