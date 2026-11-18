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

/** Sets the level of one building type in every province of a country that has it (0 closes them). */
const setCountryLevels = (page: Page, country: string, building: string, level: number) =>
  page.evaluate(
    async ([countryId, buildingId, to]) => {
      const api = window.__terraScutum!;
      const { world, provinceOwner, buildings, buildingTypes } = api.getState();
      const type = buildingTypes!.buildings.findIndex((entry) => entry.id === buildingId);
      const owner = world!.countryIds.indexOf(countryId);
      for (const cell of buildings!.cells) {
        const province = Math.floor(cell / buildings!.typeCount);
        if (cell % buildings!.typeCount !== type || provinceOwner![province] !== owner) continue;
        await api.sendCommand({
          type: 'debugSetBuildingLevel',
          province: world!.provinceIds[province],
          building: buildingId,
          level: to,
        });
      }
    },
    [country, building, level] as const,
  );

const MUNICH = [11.58, 48.14] as const;

test('the Markets screen shows prices that follow supply and demand', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `markets-${name}-${testInfo.project.name}.png`),
    });

  // Economy lens → Markets: the United States' market, every good at its base price.
  await page.getByTestId('lens-economy').click();
  await page.getByTestId('lens-screen-markets').click();
  await expect(page.getByTestId('shell-window')).toHaveAttribute('data-window', 'markets');
  await expect(page.getByTestId('markets-country')).toHaveText('United States');
  await expect(page.getByTestId('markets-table').locator('tbody tr')).toHaveCount(20);
  await expect(page.getByTestId('markets-price-grain')).toHaveText('$600 per t');
  await expect(page.getByTestId('markets-factor-grain')).toHaveText('×1.00');
  await expect(page.getByTestId('markets-price-electricity')).toHaveText('$100 per MWh');
  await expect(page.getByTestId('markets-shortage')).toContainText('got all the goods');
  await expect(page.getByTestId('markets-note')).toContainText('F19');
  await shot('screen');

  // Three weeks later the prices have moved a little, and the price lines have begun.
  await page.evaluate(() => window.__terraScutum!.step(22));
  await expect(page.getByTestId('markets-grain').locator('svg.price-line')).toHaveCount(1);
  await shot('screen-weeks');

  // The United States' farms close: grain runs short and its price climbs to the ceiling.
  await setCountryLevels(page, 'USA', 'farm', 0);
  await page.evaluate(() => window.__terraScutum!.step(15));
  await expect(page.getByTestId('markets-factor-grain')).toHaveText('×1.75');
  await expect(page.getByTestId('markets-factor-grain')).toHaveClass(/price-dear/);
  await shot('screen-grain-short');

  expect(problems).toEqual([]);
});

test('a building shows its sales, costs, profit, wage level and cash reserves', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `markets-${name}-${testInfo.project.name}.png`),
    });

  await page.evaluate(() => window.__terraScutum!.map.lookAt(10, 50, 8));
  await waitForFrames(page);
  const munich = await page.evaluate(
    ([lon, lat]) => window.__terraScutum!.map.screenPosition(lon, lat)!,
    MUNICH,
  );
  await page.mouse.click(munich.x, munich.y);
  await expect(page.getByTestId('province-name')).toHaveText('Bavaria');
  // Bavaria's steel mill sells its steel at the market's price and pays its workers.
  await expect(page.getByTestId('building-wages-steel_mill')).toContainText('the going wage');
  await expect(page.getByTestId('building-profit-steel_mill')).toContainText('$');
  await expect(page.getByTestId('building-reserves-steel_mill')).toContainText('full');
  await page.getByTestId('building-steel_mill').scrollIntoViewIfNeeded();
  await shot('province-panel');

  // The Buildings screen adds up profit and wage level for each building type.
  await page.getByTestId('lens-economy').click();
  await page.getByTestId('lens-screen-buildings').click();
  await expect(page.getByTestId('buildings-profit-steel_mill')).toContainText('$');
  await shot('buildings-screen');

  expect(problems).toEqual([]);
});
