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

test('time keys: the game starts paused, Space runs and pauses it, 1–5 and the number pad choose the speed', async ({
  page,
}, testInfo) => {
  const problems = await openGame(page);
  const control = page.getByTestId('time-control');
  const speeds = await page.evaluate(() => window.__terraScutum!.getState().daysPerSecond);
  expect(speeds).toEqual([0.5, 1, 2, 5, 10]);

  await expect(page.getByTestId('time-date')).toHaveText('1 January 2025');
  await expect(page.getByTestId('time-status')).toHaveText('Paused');
  await expectTime(page, true, 2);
  await control.screenshot({
    path: join(SCREENSHOT_DIR, `time-control-paused-${testInfo.project.name}.png`),
  });
  // Paused: no days pass.
  await page.waitForTimeout(1_000);
  expect(await dayOf(page)).toBe(0);

  // Choosing a speed doesn't unpause; the number pad's + and − stop at 1 and 5.
  await page.keyboard.press('Digit4');
  await expectTime(page, true, 4);
  await page.keyboard.press('Numpad1');
  await expectTime(page, true, 1);
  await page.keyboard.press('NumpadSubtract');
  await expectTime(page, true, 1);
  await page.keyboard.press('NumpadAdd');
  await page.keyboard.press('NumpadAdd');
  await expectTime(page, true, 3);

  // The number pad's + doesn't zoom the camera…
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

  // Speed 5 (10 days per second): Space runs time…
  await page.keyboard.press('Digit5');
  await page.keyboard.press('Space');
  await expectTime(page, false, 5);
  await expect(page.getByTestId('time-status')).toHaveText('Speed 5');
  await control.screenshot({
    path: join(SCREENSHOT_DIR, `time-control-running-${testInfo.project.name}.png`),
  });
  const start = await dayOf(page);
  const startedAt = Date.now();
  await page.waitForTimeout(3_000);
  // …and Space pauses it again; the date stays where it is.
  await page.keyboard.press('Space');
  await expectTime(page, true, 5);
  const seconds = (Date.now() - startedAt) / 1000;
  const pausedAt = await dayOf(page);
  // About 10 days per second of real time; a loose range, since the test machine is slow and busy.
  expect(pausedAt - start).toBeGreaterThan(seconds * 10 * 0.5);
  expect(pausedAt - start).toBeLessThanOrEqual(Math.ceil(seconds * 10) + 1);
  await page.waitForTimeout(1_000);
  expect(await dayOf(page)).toBe(pausedAt);

  await page.screenshot({ path: join(SCREENSHOT_DIR, `time-page-${testInfo.project.name}.png`) });
  expect(problems).toEqual([]);
});

test('the time control works with the mouse, and tests can still step days exactly', async ({
  page,
}) => {
  const problems = await openGame(page);

  // Stepping exact days while paused (what the other tests rely on).
  const snapshot = await page.evaluate(() => window.__terraScutum!.step(365));
  expect(snapshot).toMatchObject({ day: 365, date: { year: 2026, month: 1, day: 1 } });
  await expect(page.getByTestId('time-date')).toHaveText('1 January 2026');

  await page.getByTestId('time-speed-5').click();
  await expectTime(page, true, 5);
  await page.getByTestId('time-pause').click();
  await expectTime(page, false, 5);
  await expect(page.getByTestId('time-date')).not.toHaveText('1 January 2026');
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
