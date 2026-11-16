import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

/** Opens the game in the `foundation` debug scenario and waits until the renderer, the sim and the map are running. */
async function openGame(page: Page, extraQuery = ''): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  await page.goto(`/?debug=foundation${extraQuery}`);
  // The map is drawn in software in headless Chromium, which can take a while to start.
  await page.waitForFunction(() => window.__terraScutum?.isReady() === true, null, {
    timeout: 50_000,
  });
  return problems;
}

/** Opens Settings → About this build, where the renderer, sim and map status are shown (F122). */
async function openAbout(page: Page): Promise<void> {
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-tab-about').click();
}

/** How many clearly different colours the 3D canvas shows (1 would mean a blank canvas). */
async function countCanvasColours(page: Page): Promise<number> {
  const png = await page.locator('canvas.scene-canvas').screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 7) {
      colours.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
    }
    return colours.size;
  }, png.toString('base64'));
}

test('the game starts: 3D scene, sim worker and UI are all running', async ({ page }, testInfo) => {
  const problems = await openGame(page);
  // Each Playwright project provides one renderer (see playwright.config.ts).
  const expectedRenderer = testInfo.project.name === 'webgpu' ? 'WebGPU' : 'WebGL 2';

  await expect(page).toHaveTitle('Terra Scutum');
  await expect(page.getByTestId('top-bar')).toBeVisible();
  await expect(page.getByTestId('loading-note')).toHaveCount(0);
  await openAbout(page);
  await expect(page.getByTestId('renderer-status')).toHaveText(expectedRenderer);
  await expect(page.getByTestId('sim-status')).toHaveText('Running');
  await expect(page.getByTestId('map-status')).toHaveText(/^[\d,]+ provinces$/);
  await expect(page.getByTestId('time-date')).toHaveText('1 January 2025');
  await expect(page.getByTestId('sim-day')).toHaveText('0');
  await expect(page.getByTestId('save-format')).toHaveText('Version 4');
  await expect(page.getByTestId('build-commit')).toHaveText(/^[0-9a-f]{7}$|^dev$/);
  await expect(page.getByTestId('error-overlay')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shell-window')).toHaveCount(0);

  // The scene is really being drawn, and it isn't blank.
  const framesBefore = await page.evaluate(() => window.__terraScutum!.getFrameCount());
  await page.waitForFunction(
    (before) => (window.__terraScutum!.getFrameCount() ?? 0) > (before ?? 0) + 2,
    framesBefore,
  );
  expect(await countCanvasColours(page)).toBeGreaterThan(8);

  await page.screenshot({
    path: join(SCREENSHOT_DIR, `foundation-start-${testInfo.project.name}.png`),
  });
  expect(problems).toEqual([]);
});

test('the sim worker steps days exactly on request and the date follows', async ({
  page,
}, testInfo) => {
  const problems = await openGame(page);

  const first = await page.evaluate(() => window.__terraScutum!.step(1));
  expect(first).toMatchObject({ day: 1, date: { year: 2025, month: 1, day: 2 } });
  await expect(page.getByTestId('time-date')).toHaveText('2 January 2025');
  await openAbout(page);
  await expect(page.getByTestId('sim-day')).toHaveText('1');
  await page.keyboard.press('Escape');

  // Jump two years ahead through the debug hook: landfall is around January 2027.
  const snapshot = await page.evaluate(() => window.__terraScutum!.step(730));
  expect(snapshot).toMatchObject({ day: 731, date: { year: 2027, month: 1, day: 2 } });
  await expect(page.getByTestId('time-date')).toHaveText('2 January 2027');

  await page.screenshot({
    path: join(SCREENSHOT_DIR, `foundation-after-ticks-${testInfo.project.name}.png`),
  });
  expect(problems).toEqual([]);
});

test('commands reach the sim and sim events come back', async ({ page }) => {
  const problems = await openGame(page);

  const result = await page.evaluate(() =>
    window.__terraScutum!.sendCommand({ type: 'debugPing', token: 1234 }),
  );
  expect(result).toEqual({ ok: true });
  expect(await page.evaluate(() => window.__terraScutum!.events)).toEqual([
    { type: 'debugPong', token: 1234 },
  ]);

  const refused = await page.evaluate(() =>
    window.__terraScutum!.sendCommand({ type: 'nonsense' } as never),
  );
  expect(refused).toMatchObject({ ok: false, reasonKey: 'COMMAND_UNKNOWN' });
  expect(problems).toEqual([]);
});

test('an unknown debug scenario shows a readable error instead of a blank page', async ({
  page,
}) => {
  await page.goto('/?debug=does-not-exist');
  await expect(page.getByTestId('error-overlay')).toContainText('no debug scenario');
});

test('the renderer can be forced to WebGL 2', async ({ page }) => {
  const problems = await openGame(page, '&renderer=webgl2');
  await openAbout(page);
  await expect(page.getByTestId('renderer-status')).toHaveText('WebGL 2');
  expect(problems).toEqual([]);
});

test('the normal game (no debug scenario) starts without errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  await page.goto('/');
  // A new game starts with the country selection (F05); the loading note goes when the map is ready.
  await expect(page.getByTestId('country-selection')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('loading-note')).toHaveCount(0, { timeout: 50_000 });
  await page.locator('[data-testid="selection-quick-pick"][data-country="USA"]').click();
  await page.getByTestId('selection-play').click();
  // Then the top bar shows the player's country.
  await expect(page.getByTestId('top-bar-flag')).toContainText('United States');
  await openAbout(page);
  await expect(page.getByTestId('sim-status')).toHaveText('Running');
  await expect(page.getByTestId('renderer-status')).toHaveText(/WebGPU|WebGL 2/);
  await expect(page.getByTestId('map-status')).toHaveText(/provinces$/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('time-date')).toHaveText('1 January 2025');
  // The debug hooks exist only in debug scenarios.
  expect(await page.evaluate(() => window.__terraScutum)).toBeUndefined();
  // The game starts paused; Space starts time.
  await expect(page.getByTestId('time-status')).toHaveText('Paused');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('time-date')).not.toHaveText('1 January 2025', { timeout: 10_000 });
  expect(problems).toEqual([]);
});
