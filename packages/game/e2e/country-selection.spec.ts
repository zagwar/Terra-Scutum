import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws the map in software, which is slow: give these tests more time.
test.setTimeout(150_000);

/** Opens a new game at its country selection and waits until the map is ready. */
async function openSelection(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  await page.goto('/?debug=country-selection');
  await page.waitForFunction(() => window.__terraScutum?.isReady() === true, null, {
    timeout: 90_000,
  });
  return problems;
}

const screenPosition = (page: Page, longitude: number, latitude: number) =>
  page.evaluate(([lon, lat]) => window.__terraScutum!.map.screenPosition(lon, lat)!, [
    longitude,
    latitude,
  ] as const);

test('a new game starts by choosing a country on the map (F05)', async ({ page }, testInfo) => {
  const problems = await openSelection(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `country-selection-${name}-${testInfo.project.name}.png`),
    });

  // The selection replaces the shell: no top bar, outliner or lens bar, and time can't run.
  await expect(page.getByTestId('selection-bar')).toContainText('Choose your country');
  await expect(page.getByTestId('country-selection')).toBeVisible();
  await expect(page.getByTestId('top-bar')).toHaveCount(0);
  await expect(page.getByTestId('outliner')).toHaveCount(0);
  await expect(page.getByTestId('selection-empty')).toBeVisible();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__terraScutum!.time()?.paused)).toBe(true);
  // Eight quick picks, each with its flag.
  await expect(page.getByTestId('selection-quick-pick')).toHaveCount(8);
  await expect(page.getByTestId('selection-quick-pick').first()).toContainText('United States');

  // A click on the map picks the country that owns that place; no province panel opens.
  await page.evaluate(() => window.__terraScutum!.map.lookAt(10, 50, 3));
  const berlin = await screenPosition(page, 13.4, 52.5);
  await page.mouse.click(berlin.x, berlin.y);
  await expect(page.getByTestId('selection-name')).toHaveText('Germany');
  await expect(page.getByTestId('selection-government')).toHaveText('Parliamentary democracy');
  await expect(page.getByTestId('selection-capital')).toHaveText('Berlin');
  await expect(page.getByTestId('selection-provinces')).toHaveText('16');
  await expect(page.getByTestId('selection-flag')).toHaveAttribute('data-flag', 'de');
  await expect(page.getByTestId('province-panel')).toHaveCount(0);
  await page.mouse.move(640, 5);
  await shot('germany');

  // Searching: "cote" finds Côte d'Ivoire; Enter picks the first match.
  await page.getByTestId('selection-search').fill('cote');
  await expect(page.getByTestId('selection-result')).toHaveText(["Côte d'Ivoire"]);
  await page.getByTestId('selection-search').fill('fra');
  await expect(page.getByTestId('selection-result').first()).toHaveText('France');
  await page.getByTestId('selection-search').press('Enter');
  await expect(page.getByTestId('selection-name')).toHaveText('France');
  await page.getByTestId('selection-search').fill('xyz');
  await expect(page.getByTestId('selection-results')).toContainText('No country matches');
  await page.getByTestId('selection-search').fill('');
  // A neighbor's name picks it too.
  await page.getByTestId('selection-neighbors').getByRole('button', { name: 'Spain' }).click();
  await expect(page.getByTestId('selection-name')).toHaveText('Spain');
  // And a quick pick.
  await page.locator('[data-testid="selection-quick-pick"][data-country="IND"]').click();
  await expect(page.getByTestId('selection-name')).toHaveText('India');
  await shot('india');

  // Play as India: the shell appears with India as my country, still paused, and the choice is in the sim.
  await page.getByTestId('selection-play').click();
  await expect(page.getByTestId('country-selection')).toHaveCount(0);
  await expect(page.getByTestId('top-bar-flag')).toContainText('India');
  await expect(page.getByTestId('top-bar-flag-image')).toHaveAttribute('data-flag', 'in');
  await expect(page.getByTestId('time-status')).toHaveText('Paused');
  expect(await page.evaluate(() => window.__terraScutum!.events.at(-1))).toEqual({
    type: 'playerCountryChosen',
    country: 'IND',
  });
  // My country's screen is now India's Government view; another country gets the Diplomacy view.
  await page.getByTestId('top-bar-flag').click();
  await expect(page.getByTestId('country-screen')).toHaveAttribute('data-view', 'government');
  await expect(page.getByTestId('country-name')).toHaveText('India');
  await page.getByTestId('country-neighbors').getByRole('button').first().click();
  await expect(page.getByTestId('country-screen')).toHaveAttribute('data-view', 'diplomacy');
  await page.keyboard.press('Escape');
  await shot('playing-india');

  // Once days have passed, the sim refuses another choice.
  await page.evaluate(() => window.__terraScutum!.step(1));
  expect(
    await page.evaluate(() =>
      window.__terraScutum!.sendCommand({ type: 'choosePlayerCountry', country: 'USA' }),
    ),
  ).toEqual({ ok: false, reasonKey: 'COMMAND_PLAYER_COUNTRY_LOCKED' });

  expect(problems).toEqual([]);
});
