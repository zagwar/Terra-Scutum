import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws the map in software, which is slow: give these tests more time.
test.setTimeout(150_000);

/** Opens the game and waits until the renderer, the sim and the world map are ready. */
async function openGame(page: Page): Promise<string[]> {
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

const dayOf = (page: Page) => page.evaluate(() => window.__terraScutum!.getState().snapshot!.day);
const timeOf = (page: Page) => page.evaluate(() => window.__terraScutum!.time());

/** Waits until the UI has heard the given game speed back from the sim worker. */
async function expectTime(page: Page, paused: boolean, speed: number): Promise<void> {
  const control = page.getByTestId('time-control');
  await expect(control).toHaveAttribute('data-paused', String(paused));
  await expect(control).toHaveAttribute('data-speed', String(speed));
}

test('the game starts paused; Space runs time and pauses it again', async ({ page }, testInfo) => {
  const problems = await openGame(page);
  const control = page.getByTestId('time-control');

  await expect(page.getByTestId('time-date')).toHaveText('1 January 2025');
  await expect(page.getByTestId('time-status')).toHaveText('Paused');
  await expectTime(page, true, 2);
  await control.screenshot({
    path: join(SCREENSHOT_DIR, `time-control-paused-${testInfo.project.name}.png`),
  });
  // Paused: no days pass.
  await page.waitForTimeout(1_500);
  expect(await dayOf(page)).toBe(0);

  // Space: time runs at speed 2 (1 day per second).
  await page.keyboard.press('Space');
  await expectTime(page, false, 2);
  await expect(page.getByTestId('time-status')).toHaveText('Speed 2');
  await expect(page.getByTestId('time-date')).toHaveText('3 January 2025', { timeout: 10_000 });
  await control.screenshot({
    path: join(SCREENSHOT_DIR, `time-control-running-${testInfo.project.name}.png`),
  });

  // Space again: paused, and the date stays where it is.
  await page.keyboard.press('Space');
  await expectTime(page, true, 2);
  const pausedAt = await dayOf(page);
  await page.waitForTimeout(1_500);
  expect(await dayOf(page)).toBe(pausedAt);

  await page.screenshot({ path: join(SCREENSHOT_DIR, `time-page-${testInfo.project.name}.png`) });
  expect(problems).toEqual([]);
});

test('the speeds run about as many days per second as the data says', async ({ page }) => {
  const problems = await openGame(page);
  const speeds = await page.evaluate(() => window.__terraScutum!.getState().daysPerSecond);
  expect(speeds).toEqual([0.5, 1, 2, 5, 10]);

  await page.keyboard.press('Digit5');
  await page.keyboard.press('Space');
  await expectTime(page, false, 5);
  const start = await dayOf(page);
  await page.waitForTimeout(3_000);
  await page.keyboard.press('Space');
  await expectTime(page, true, 5);
  const days = (await dayOf(page)) - start;
  // About 30 days in 3 seconds; a loose range, since the cloud machine is slow and busy.
  expect(days).toBeGreaterThan(15);
  expect(days).toBeLessThanOrEqual(32);
  expect(problems).toEqual([]);
});

test('keys 1–5 and the number pad + and − choose the speed; the camera keeps + and - for zoom', async ({
  page,
}) => {
  const problems = await openGame(page);

  await page.keyboard.press('Digit4');
  await expectTime(page, true, 4); // choosing a speed doesn't unpause
  await page.keyboard.press('Numpad1');
  await expectTime(page, true, 1);
  await page.keyboard.press('NumpadSubtract');
  await expectTime(page, true, 1); // already the slowest
  await page.keyboard.press('NumpadAdd');
  await page.keyboard.press('NumpadAdd');
  await expectTime(page, true, 3);

  // The number pad's + and − don't zoom the camera…
  await page.evaluate(() => window.__terraScutum!.map.settle());
  const zoom = await page.evaluate(() => window.__terraScutum!.map.zoom());
  await page.keyboard.press('NumpadAdd');
  await expectTime(page, true, 4);
  await page.evaluate(() => window.__terraScutum!.map.settle());
  expect(await page.evaluate(() => window.__terraScutum!.map.zoom())).toBe(zoom);

  // …while the main keyboard's + still zooms and leaves the speed alone.
  await page.keyboard.press('Equal');
  await page.evaluate(() => window.__terraScutum!.map.settle());
  expect(await page.evaluate(() => window.__terraScutum!.map.zoom())).toBeGreaterThan(zoom!);
  expect(await timeOf(page)).toEqual({ paused: true, speed: 4 });
  expect(problems).toEqual([]);
});

test('the pause button and the speed bars work with the mouse', async ({ page }) => {
  const problems = await openGame(page);

  await page.getByTestId('time-speed-5').click();
  await expectTime(page, true, 5);
  await page.getByTestId('time-pause').click();
  await expectTime(page, false, 5);
  await expect(page.getByTestId('time-date')).not.toHaveText('1 January 2025');
  await page.getByTestId('time-speed-1').click();
  await expectTime(page, false, 1);

  // The pause button now has the keyboard focus: Space toggles once, not twice.
  await page.getByTestId('time-pause').click();
  await expectTime(page, true, 1);
  await page.keyboard.press('Space');
  await expectTime(page, false, 1);
  await page.keyboard.press('Space');
  await expectTime(page, true, 1);

  // A map mode button with the focus isn't pressed by Space either.
  await page.getByTestId('map-mode-regions').click();
  await page.keyboard.press('Space');
  await expectTime(page, false, 1);
  await expect(page.getByTestId('map-mode-regions')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expectTime(page, true, 1);
  expect(problems).toEqual([]);
});

test('tests can still step days exactly while the game is paused', async ({ page }) => {
  const problems = await openGame(page);
  const snapshot = await page.evaluate(() => window.__terraScutum!.step(365));
  expect(snapshot).toMatchObject({ day: 365, date: { year: 2026, month: 1, day: 1 } });
  await expect(page.getByTestId('time-date')).toHaveText('1 January 2026');
  await page.waitForTimeout(1_000);
  expect(await dayOf(page)).toBe(365);
  expect(problems).toEqual([]);
});
