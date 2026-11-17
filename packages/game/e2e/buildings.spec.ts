import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws the map in software, which is slow: give these tests more time.
test.setTimeout(150_000);

/** Opens the game (playing as the United States) and waits until everything is ready. */
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

async function waitForFrames(page: Page, frames = 2): Promise<void> {
  const before = await page.evaluate(() => window.__terraScutum!.getFrameCount() ?? 0);
  await page.waitForFunction(
    (target) => (window.__terraScutum!.getFrameCount() ?? 0) >= target,
    before + frames,
    { timeout: 60_000 },
  );
}

const lookAt = (page: Page, longitude: number, latitude: number, zoom: number) =>
  page.evaluate(([lon, lat, z]) => window.__terraScutum!.map.lookAt(lon, lat, z), [
    longitude,
    latitude,
    zoom,
  ] as const);

const screenPosition = (page: Page, longitude: number, latitude: number) =>
  page.evaluate(([lon, lat]) => window.__terraScutum!.map.screenPosition(lon, lat)!, [
    longitude,
    latitude,
  ] as const);

/** Sets the level of one building type in every province of a country that has it (0 closes them). */
const setCountryLevels = (page: Page, country: string, building: string, level: number) =>
  page.evaluate(
    async ([countryId, buildingId, to]) => {
      const api = window.__terraScutum!;
      const { world, provinceOwner, buildings, buildingTypes } = api.getState();
      const type = buildingTypes!.buildings.findIndex((entry) => entry.id === buildingId);
      const owner = world!.countryIds.indexOf(countryId);
      let changed = 0;
      for (const cell of buildings!.cells) {
        const province = Math.floor(cell / buildings!.typeCount);
        if (cell % buildings!.typeCount !== type || provinceOwner![province] !== owner) continue;
        await api.sendCommand({
          type: 'debugSetBuildingLevel',
          province: world!.provinceIds[province],
          building: buildingId,
          level: to,
        });
        changed += 1;
      }
      return changed;
    },
    [country, building, level] as const,
  );

const MUNICH = [11.58, 48.14] as const;

test('a province shows its buildings: levels, output, workers and what holds them back', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `buildings-${name}-${testInfo.project.name}.png`),
    });

  await lookAt(page, 10, 50, 8);
  await waitForFrames(page);
  const munich = await screenPosition(page, ...MUNICH);
  await page.mouse.click(munich.x, munich.y);
  await expect(page.getByTestId('province-name')).toHaveText('Bavaria');

  // Bavaria starts with the example buildings, all running at full output.
  const steel = page.getByTestId('building-steel_mill');
  await expect(steel).toContainText('Steel mill');
  await expect(page.getByTestId('building-level-steel_mill')).toHaveText('Level 8');
  await expect(page.getByTestId('building-output-steel_mill')).toHaveText('100 %');
  await expect(page.getByTestId('building-workers-steel_mill')).toHaveText('32,000 of 32,000');
  // Amounts are real units, shortened: 8 levels × 5,000 t of steel a day.
  await expect(page.getByTestId('building-makes-steel_mill')).toHaveText('40 kt steel a day');
  await expect(page.getByTestId('building-uses-steel_mill')).toHaveText(
    '20 GWh electricity, 64 kt iron ore, 28 kt coal a day',
  );
  await expect(page.getByTestId('building-limit-steel_mill')).toHaveCount(0);
  await expect(page.getByTestId('building-farm')).toContainText('Farm');
  await steel.scrollIntoViewIfNeeded();
  await shot('province-panel');

  // The test tools change a level by hand: one more steel mill level, 4,000 more jobs.
  const unemployment = async () =>
    Number.parseFloat(await page.getByTestId('province-unemployment').innerText());
  const before = await unemployment();
  await page.getByTestId('building-test-tools').locator('summary').click();
  await page.getByTestId('building-more-steel_mill').click();
  await expect(page.getByTestId('building-level-steel_mill')).toHaveText('Level 9');
  await expect(page.getByTestId('building-workers-steel_mill')).toHaveText('36,000 of 36,000');
  for (let i = 0; i < 9; i++) await page.getByTestId('building-more-steel_mill').click();
  await expect(page.getByTestId('building-level-steel_mill')).toHaveText('Level 18');
  expect(await unemployment()).toBeLessThan(before);
  for (let i = 0; i < 10; i++) await page.getByTestId('building-less-steel_mill').click();
  await expect(page.getByTestId('building-level-steel_mill')).toHaveText('Level 8');

  // Germany's coal mines close: once the stockpile is used up, the power plants stop,
  // and with them everything that runs on electricity.
  expect(await setCountryLevels(page, 'DEU', 'coal_mine', 0)).toBeGreaterThan(3);
  await page.evaluate(() => window.__terraScutum!.step(10));
  await expect(page.getByTestId('building-output-steel_mill')).toHaveText('100 %');
  await page.evaluate(() => window.__terraScutum!.step(30));
  await expect(page.getByTestId('building-output-steel_mill')).toHaveText('0 %');
  await expect(page.getByTestId('building-limit-steel_mill')).toHaveText(
    'Held back: not enough electricity.',
  );
  await expect(page.getByTestId('building-makes-steel_mill')).toHaveText('0 t steel a day');
  // The workers keep their jobs for now: layoffs come with markets (F65).
  await expect(page.getByTestId('building-workers-steel_mill')).toHaveText('32,000 of 32,000');
  await steel.scrollIntoViewIfNeeded();
  await shot('province-panel-held-back');

  expect(problems).toEqual([]);
});

test('the Buildings screen shows the country’s buildings and its national stockpile', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `buildings-${name}-${testInfo.project.name}.png`),
    });

  // No alert while everything runs.
  await expect(page.getByTestId('alert')).toHaveCount(0);

  // The Economy lens lists the Buildings screen, now built.
  await page.getByTestId('lens-economy').click();
  await page.getByTestId('lens-screen-buildings').click();
  const screen = page.getByTestId('buildings-screen');
  await expect(screen).toBeVisible();
  await expect(page.getByTestId('buildings-country')).toHaveText('United States');
  await expect(page.getByTestId('buildings-types').locator('tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('buildings-type-steel_mill')).toContainText('310');
  await expect(page.getByTestId('buildings-output-steel_mill')).toHaveText('100 %');
  await expect(page.getByTestId('buildings-held-back')).toHaveText('0');
  // The national stockpile: 15 days of inputs to start with; electricity can't be stored.
  await expect(page.getByTestId('stockpile').locator('tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('stockpile-stock-iron_ore')).toHaveText('37.2 Mt');
  await expect(page.getByTestId('stockpile-made-iron_ore')).toHaveText('2.48 Mt');
  await expect(page.getByTestId('stockpile-used-iron_ore')).toHaveText('2.48 Mt');
  await expect(page.getByTestId('stockpile-stock-electricity')).toHaveText("can't be stored");
  await expect(page.getByTestId('stockpile-stock-steel')).toHaveText('0 t');
  await shot('screen');

  // A building type's name shows where it stands; a province's name opens its panel.
  await page.getByTestId('buildings-open-steel_mill').click();
  await expect(page.getByTestId('buildings-where-title')).toContainText('Steel mill');
  const where = page.getByTestId('buildings-where').locator('tbody tr');
  await expect(where.first()).toContainText('California');
  await page.getByTestId('buildings-where-title').scrollIntoViewIfNeeded();
  await shot('screen-where');

  // Steel piles up in the stockpile, up to 30 days of what is made.
  await page.evaluate(() => window.__terraScutum!.step(10));
  await expect(page.getByTestId('stockpile-stock-steel')).toHaveText('15.5 Mt');

  // The United States' iron mines close: when the ore runs out, the steel mills stop,
  // and the alerts row says so.
  await setCountryLevels(page, 'USA', 'iron_mine', 0);
  await expect(page.getByTestId('stockpile-lasts-iron_ore')).toHaveText('15 days');
  await page.evaluate(() => window.__terraScutum!.step(20));
  await expect(page.getByTestId('buildings-output-steel_mill')).toHaveText('0 %');
  await expect(page.getByTestId('stockpile-lasts-iron_ore')).toHaveText('empty');
  await expect(page.getByTestId('buildings-held-back')).not.toHaveText('0');
  await page.getByTestId('stockpile').scrollIntoViewIfNeeded();
  await shot('screen-held-back');
  const alert = page.getByTestId('alert');
  await expect(alert).toHaveCount(1);
  await expect(alert).toHaveAttribute('data-alert-type', 'idle_factory');

  // The test button refills the stockpile (as imports will): the mills run again.
  await page.getByTestId('stockpile-test-fill').click();
  await expect(page.getByTestId('buildings-output-steel_mill')).toHaveText('100 %');
  await expect(alert).toHaveCount(0);

  // The alert again, and a click on it shows the worst building's province.
  await page.evaluate(() => window.__terraScutum!.step(20));
  await page.getByTestId('shell-window-close').click();
  await expect(alert).toHaveCount(1);
  await alert.hover();
  await expect(alert).toContainText('Steel mill in California runs at 0 %');
  await shot('alert');
  await alert.click();
  await expect(page.getByTestId('province-name')).toHaveText('California');
  await expect(page.getByTestId('building-limit-steel_mill')).toHaveText(
    'Held back: not enough iron ore.',
  );
  // Dismissed with a right-click, it stays away.
  await alert.click({ button: 'right' });
  await expect(alert).toHaveCount(0);
  await page.evaluate(() => window.__terraScutum!.step(2));
  await expect(alert).toHaveCount(0);

  expect(problems).toEqual([]);
});

test('the Industry map mode colors provinces by the people at work in buildings', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `buildings-${name}-${testInfo.project.name}.png`),
    });

  // Opening the Economy lens switches to the Industry map mode (section 12.2).
  await page.getByTestId('lens-economy').click();
  await expect(page.getByTestId('map-mode-industry')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-legend')).toContainText('People at work in buildings');
  await expect(page.getByTestId('map-legend').locator('li')).toHaveCount(7);
  await page.keyboard.press('Escape');
  await waitForFrames(page, 3);
  await shot('map-mode-world');

  // The tooltip says how many people work in the buildings of the province under the mouse.
  await lookAt(page, 10, 50, 6);
  await waitForFrames(page, 3);
  const munich = await screenPosition(page, ...MUNICH);
  await page.mouse.move(munich.x, munich.y);
  await expect(page.getByTestId('map-tooltip')).toContainText('Bavaria');
  await expect(page.getByTestId('map-tooltip-industry')).toContainText('people at work in');
  await shot('map-mode-europe');

  await page.getByTestId('map-mode-political').click();
  await expect(page.getByTestId('map-legend')).toHaveCount(0);
  await page.mouse.move(munich.x + 3, munich.y + 3);
  await expect(page.getByTestId('map-tooltip-industry')).toHaveCount(0);

  expect(problems).toEqual([]);
});
