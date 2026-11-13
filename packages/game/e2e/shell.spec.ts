import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws the map in software, which is slow: give these tests more time.
test.setTimeout(150_000);

const PARIS = [2.35, 48.86] as const;

/** Opens the UI demo (sample alerts, outliner entries and messages) and waits until it is ready. */
async function openDemo(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  await page.goto('/?debug=ui-demo');
  await page.waitForFunction(() => window.__terraScutum?.isReady() === true, null, {
    timeout: 90_000,
  });
  // The tests move the mouse around freely: no scrolling at the window's edge.
  await page.evaluate(() => window.__terraScutum!.map.setEdgeScrolling(false));
  return problems;
}

const screenPosition = (page: Page, longitude: number, latitude: number) =>
  page.evaluate(([lon, lat]) => window.__terraScutum!.map.screenPosition(lon, lat)!, [
    longitude,
    latitude,
  ] as const);

test('the top bar, lenses, screens, alerts and outliner (UI shell, F122)', async ({
  page,
}, testInfo) => {
  const problems = await openDemo(page);
  const shot = (name: string) =>
    page.screenshot({ path: join(SCREENSHOT_DIR, `shell-${name}-${testInfo.project.name}.png`) });

  // The top bar: the player's country, then every key number as "—" (none exists in the sim yet).
  await expect(page.getByTestId('top-bar-flag')).toContainText('United States');
  for (const id of ['treasury', 'stability', 'manpower', 'food', 'swarmControl', 'arrival'])
    await expect(page.getByTestId(`top-bar-${id}`)).toContainText('—');
  await expect(page.getByTestId('time-date')).toHaveText('1 January 2025');
  // Hovering a number says which feature brings it; clicking it opens its (empty) screen.
  await page.getByTestId('top-bar-stability').hover();
  await expect(page.getByTestId('top-bar-stability-tip')).toBeVisible();
  await expect(page.getByTestId('top-bar-stability-tip')).toContainText('Comes with F10 (M2)');
  await shot('top-bar-tooltip');
  await page.getByTestId('top-bar-stability').click();
  await expect(page.getByTestId('shell-window')).toHaveAttribute('data-window', 'population');
  await expect(page.getByTestId('screen-empty')).toContainText('Comes with F06 (M2)');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shell-window')).toHaveCount(0);

  // The flag opens the player's country panel, on the left.
  await page.getByTestId('top-bar-flag').click();
  await expect(page.getByTestId('country-name')).toHaveText('United States');
  const panelBox = (await page.getByTestId('country-panel').boundingBox())!;
  expect(panelBox.x).toBeLessThan(40);

  // The lens bar: a lens lists its screens; a screen opens as a window over the map.
  await page.getByTestId('lens-economy').click();
  await expect(page.getByTestId('lens-menu')).toContainText('Production chains');
  await shot('lens-menu');
  await page.getByTestId('lens-screen-budget').click();
  await expect(page.getByTestId('lens-menu')).toHaveCount(0);
  await expect(page.getByTestId('shell-window')).toContainText('Budget');
  await expect(page.getByTestId('screen-empty')).toContainText('Comes with F09 (M2)');
  await shot('empty-screen');
  await page.getByTestId('shell-window-close').click();
  await page.getByTestId('lens-swarm').click();
  await expect(page.getByTestId('lens-menu')).toContainText('Hive tracker');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lens-menu')).toHaveCount(0);

  // Alerts: hover for details, click to jump, right-click to dismiss.
  const alerts = page.getByTestId('alert');
  await expect(alerts).toHaveCount(8);
  await alerts.first().hover();
  await expect(page.getByTestId('alerts-row').getByRole('tooltip').first()).toContainText(
    'Units out of supply',
  );
  await page.locator('[data-alert-type="blackout"]').click();
  await expect(page.getByTestId('province-name')).toHaveText('Berlin');
  await page.locator('[data-alert-type="shortage"]').click({ button: 'right' });
  await expect(alerts).toHaveCount(7);
  // An alert type turned off in the settings disappears from the row.
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-tab-alerts').click();
  await page.getByTestId('alert-setting-blackout').uncheck();
  await shot('alert-settings');
  await page.keyboard.press('Escape');
  await expect(alerts).toHaveCount(6);
  await expect(page.locator('[data-alert-type="blackout"]')).toHaveCount(0);

  // The outliner: sections with counts; an entry selects its place; it collapses.
  await expect(page.getByTestId('outliner-armies')).toContainText('2');
  await expect(page.getByTestId('outliner-fronts')).toContainText('0');
  await page.getByTestId('outliner-entry').first().click();
  await expect(page.getByTestId('province-name')).toHaveText('Chesapeake');
  await page.getByTestId('outliner-toggle').click();
  await expect(page.getByTestId('outliner-armies')).toHaveCount(0);
  await page.getByTestId('outliner-toggle').click();
  await expect(page.getByTestId('outliner-armies')).toHaveCount(1);

  expect(problems).toEqual([]);
});

test('messages, message settings, the region panel and Back (UI shell, F122)', async ({
  page,
}, testInfo) => {
  const problems = await openDemo(page);
  const shot = (name: string) =>
    page.screenshot({ path: join(SCREENSHOT_DIR, `shell-${name}-${testInfo.project.name}.png`) });

  // The demo starts with a sample toast; ✕ closes it.
  await expect(page.getByTestId('toast')).toHaveCount(1);
  await shot('demo-start');
  await page.getByTestId('toast').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('toast')).toHaveCount(0);

  // A real sim event: a province changing hands is a toast by default…
  await page.getByTestId('demo-owner-change').click();
  await expect(page.getByTestId('toast')).toContainText('now belongs to');

  // …and a pop-up that pauses the game once the settings say so.
  await page.getByTestId('open-settings').click();
  await page.getByTestId('message-delivery-province_owner_changed').selectOption('popup');
  await page.getByTestId('message-pauses-province_owner_changed').check();
  await page.keyboard.press('Escape');
  await page.getByTestId('time-pause').click();
  await expect(page.getByTestId('time-control')).toHaveAttribute('data-paused', 'false');
  await page.getByTestId('demo-owner-change').click();
  await expect(page.getByTestId('popup')).toContainText('Province changed hands');
  await expect(page.getByTestId('time-control')).toHaveAttribute('data-paused', 'true');
  await shot('popup');
  // "Show me" opens the province that changed hands.
  await page.getByTestId('popup-show').click();
  await expect(page.getByTestId('popup')).toHaveCount(0);
  await expect(page.getByTestId('province-panel')).toHaveCount(1);
  // The settings are remembered after a reload.
  expect(
    await page.evaluate(() => window.localStorage.getItem('terra-scutum.ui-settings.v1')),
  ).toContain('popup');

  // The message log lists every message, newest first.
  await page.getByTestId('open-message-log').click();
  await expect(page.getByTestId('message-log').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('message-log').locator('li').first()).toContainText(
    'Province changed hands',
  );
  await shot('message-log');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('province-panel')).toHaveCount(0);

  // The region panel: from the province panel's region link, and from the map in the Regions mode.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(2, 48, 4));
  const paris = await screenPosition(page, ...PARIS);
  await page.mouse.click(paris.x, paris.y);
  await expect(page.getByTestId('province-name')).toHaveText('Île-de-France');
  await page.getByTestId('province-region').click();
  await expect(page.getByTestId('region-name')).toHaveText('Western Europe');
  await expect(page.getByTestId('region-climate')).toHaveText('Temperate');
  await expect(page.getByTestId('region-hive')).toHaveText('Comes with F26');
  await expect(page.getByTestId('region-countries').getByRole('button')).toContainText([
    'Belgium',
    'France',
  ]);
  await shot('region-panel');
  await page.getByTestId('panel-back').click();
  await expect(page.getByTestId('province-name')).toHaveText('Île-de-France');

  await page.getByTestId('map-mode-regions').click();
  await page.mouse.click(paris.x, paris.y);
  await expect(page.getByTestId('region-name')).toHaveText('Western Europe');
  await expect(page.getByTestId('panel-back')).toHaveCount(0);
  // A bordering region opens from the list; Back returns.
  await page
    .getByTestId('region-neighbors')
    .getByRole('button', { name: 'Central Europe' })
    .click();
  await expect(page.getByTestId('region-name')).toHaveText('Central Europe');
  await page.getByTestId('panel-back').click();
  await expect(page.getByTestId('region-name')).toHaveText('Western Europe');

  expect(problems).toEqual([]);
});
