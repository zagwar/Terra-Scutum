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

const PARIS = [2.35, 48.86] as const;
const MID_ATLANTIC = [-35, 48] as const;

test('the world map shows every province; clicking one opens its info panel', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({ path: join(SCREENSHOT_DIR, `map-${name}-${testInfo.project.name}.png`) });

  await expect(page.getByTestId('map-status')).toHaveText('1,294 provinces');
  await waitForFrames(page);
  const stats = await page.evaluate(() => window.__terraScutum!.map.stats()!);
  expect(stats.provinces).toBe(1294);
  expect(stats.seaZones).toBe(126);
  expect(stats.detail).toBe('far');
  expect(stats.drawnTriangles).toBeGreaterThan(50_000);
  // The whole world from far away stays cheap: well under half a million triangles a frame.
  expect(stats.drawnTriangles).toBeLessThan(500_000);
  await shot('world');

  // Hovering shows the province and its country.
  const paris = await screenPosition(page, ...PARIS);
  await page.mouse.move(paris.x, paris.y);
  await expect(page.getByTestId('map-tooltip')).toHaveText('Île-de-France · France');
  await expect(page.getByTestId('map-tooltip')).toBeVisible();
  await shot('hover');

  // Clicking opens the info panel: name, country, region, neighbors.
  await expect(page.getByTestId('province-panel')).toHaveCount(0);
  await page.mouse.click(paris.x, paris.y);
  await expect(page.getByTestId('province-name')).toHaveText('Île-de-France');
  await expect(page.getByTestId('province-country')).toHaveText('France');
  await expect(page.getByTestId('province-region')).toHaveText('Western Europe');
  const neighbors = page.getByTestId('province-neighbors').getByRole('button');
  await expect(neighbors).toHaveText([
    'Bourgogne-Franche-Comté',
    'Centre-Val de Loire',
    'Grand Est',
    'Hauts-de-France',
    'Normandie',
  ]);
  await expect(page.getByTestId('province-sea-zones')).toHaveText('None');
  expect(await page.evaluate(() => window.__terraScutum!.map.selectedProvince())).toBe(
    'fra_ile_de_france',
  );
  await waitForFrames(page);
  await shot('selected');

  // A neighbor's name selects that neighbor; a coastal province lists its sea zones.
  await neighbors.filter({ hasText: 'Normandie' }).click();
  await expect(page.getByTestId('province-name')).toHaveText('Normandie');
  await expect(page.getByTestId('province-sea-zones')).not.toHaveText('None');
  // A province picked from a list is brought into view (zoomed in, because it was small on screen).
  await page.evaluate(() => window.__terraScutum!.map.settle());
  expect(await page.evaluate(() => window.__terraScutum!.map.zoom()!)).toBeGreaterThan(1);
  await page.evaluate(() => window.__terraScutum!.map.lookAt(0, 0, 1));

  // Clicking the sea selects its sea zone instead (F70); the close buttons clear the selection.
  const sea = await screenPosition(page, ...MID_ATLANTIC);
  await page.mouse.click(sea.x, sea.y);
  await expect(page.getByTestId('province-panel')).toHaveCount(0);
  await expect(page.getByTestId('sea-zone-name')).toHaveText('North Atlantic');
  await expect(page.getByTestId('map-tooltip')).toHaveText('North Atlantic');
  await page.getByTestId('sea-zone-close').click();
  await expect(page.getByTestId('sea-zone-panel')).toHaveCount(0);
  await page.mouse.click(paris.x, paris.y);
  await expect(page.getByTestId('province-name')).toHaveText('Île-de-France');
  await page.getByTestId('province-close').click();
  await expect(page.getByTestId('province-panel')).toHaveCount(0);

  // Map modes: regions.
  await page.getByTestId('map-mode-regions').click();
  await expect(page.getByTestId('map-mode-regions')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-mode-provinces')).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(paris.x, 20);
  await waitForFrames(page);
  await shot('regions');

  expect(problems).toEqual([]);
});

test('the map wraps east–west and shows full detail when zoomed in', async ({ page }, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({ path: join(SCREENSHOT_DIR, `map-${name}-${testInfo.project.name}.png`) });
  const map = {
    center: () => page.evaluate(() => window.__terraScutum!.map.centerLongitude()!),
    stats: () => page.evaluate(() => window.__terraScutum!.map.stats()!),
    selected: () => page.evaluate(() => window.__terraScutum!.map.selectedProvince()),
  };

  // Picking by longitude/latitude works on any copy of the world.
  const pick = (longitude: number, latitude: number) =>
    page.evaluate(([lon, lat]) => window.__terraScutum!.map.provinceAt(lon, lat), [
      longitude,
      latitude,
    ] as const);
  expect(await pick(...PARIS)).toBe('fra_ile_de_france');
  expect(await pick(PARIS[0] + 360, PARIS[1])).toBe('fra_ile_de_france');
  expect(await pick(...MID_ATLANTIC)).toBeNull();

  // Scrolling east past the date line continues on the other side.
  expect(await map.center()).toBeCloseTo(0, 6);
  await page.evaluate(() => window.__terraScutum!.map.scrollBy(150));
  expect(await map.center()).toBeCloseTo(150, 6);
  await page.evaluate(() => window.__terraScutum!.map.scrollBy(60));
  expect(await map.center()).toBeCloseTo(-150, 6);
  await waitForFrames(page);
  await shot('scrolled-past-date-line');

  // The Pacific is in the middle now, and Paris is still where the map says it is.
  const paris = await screenPosition(page, ...PARIS);
  await page.mouse.click(paris.x, paris.y);
  expect(await map.selected()).toBe('fra_ile_de_france');

  // One full turn around the world ends where it started.
  await page.evaluate(() => window.__terraScutum!.map.scrollBy(360));
  expect(await map.center()).toBeCloseTo(-150, 6);

  // The temporary arrow keys scroll the map too.
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(
    () => Math.abs(window.__terraScutum!.map.centerLongitude()! + 150) > 1,
    null,
    { timeout: 60_000 },
  );
  await page.keyboard.up('ArrowRight');

  // Zoomed in on the date line: the close-up level, with only the chunks on screen drawn.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(178, 62, 8));
  await waitForFrames(page, 3);
  const zoomed = await map.stats();
  expect(zoomed.detail).toBe('near');
  expect(zoomed.nearTriangles).toBeGreaterThan(400_000);
  expect(zoomed.drawnTriangles).toBeLessThan(zoomed.nearTriangles! / 2);
  // Chukotka lies on both sides of the date line and is one province on screen.
  const west = await screenPosition(page, 179.5, 67);
  const east = await screenPosition(page, -179.5, 67);
  expect(east.x).toBeGreaterThan(west.x);
  expect(east.x - west.x).toBeLessThan(200);
  await page.mouse.click(west.x, west.y);
  const chukotka = await map.selected();
  expect(chukotka).toMatch(/^rus_/);
  await page.getByTestId('province-close').click();
  await page.mouse.click(east.x, east.y);
  expect(await map.selected()).toBe(chukotka);
  await waitForFrames(page);
  await shot('zoomed-date-line');

  // Zoomed in on Europe.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(10, 50, 6));
  const parisZoomed = await screenPosition(page, ...PARIS);
  await page.mouse.click(parisZoomed.x, parisZoomed.y);
  await expect(page.getByTestId('province-name')).toHaveText('Île-de-France');
  await waitForFrames(page, 3);
  await shot('zoomed-europe');

  // Back out: the far level again.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(0, 0, 1));
  await waitForFrames(page);
  expect((await map.stats()).detail).toBe('far');

  expect(problems).toEqual([]);
});
