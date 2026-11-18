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

/** The number at the start of a text such as "13.2 million" or "3.7 %". */
const numberOf = async (page: Page, testId: string) =>
  Number.parseFloat((await page.getByTestId(testId).innerText()).replace(/,/g, ''));

const MUNICH = [11.58, 48.14] as const;

test('a province shows its people, its pops, their jobs, incomes and standard of living', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `population-${name}-${testInfo.project.name}.png`),
    });

  // Bavaria: about 13 million people (the real figure), half of them in the workforce.
  await lookAt(page, 10, 50, 8);
  await waitForFrames(page);
  const munich = await screenPosition(page, ...MUNICH);
  await page.mouse.click(munich.x, munich.y);
  await expect(page.getByTestId('province-name')).toHaveText('Bavaria');
  await expect(page.getByTestId('province-people')).toHaveText('13.2 million');
  await expect(page.getByTestId('province-workforce')).toHaveText('6.89 million');
  await expect(page.getByTestId('province-dependents')).toHaveText('6.32 million');
  await expect(page.getByTestId('province-unemployment')).toHaveText('3.7 %');
  await expect(page.getByTestId('province-density')).toHaveText('189 per km²');
  const living = await numberOf(page, 'province-living');
  // F65: the standard of living is the pops' wealth (Victoria 3), 1 to 99.
  expect(living).toBeGreaterThan(80);
  expect(living).toBeLessThanOrEqual(99);
  // The six pop groups, each with people, an income and a standard of living.
  const pops = page.getByTestId('province-pops');
  await expect(pops.locator('tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('province-pops-laborers')).toContainText('Laborers');
  await expect(page.getByTestId('province-pops-laborers')).toContainText('2.36M');
  await expect(page.getByTestId('province-pops-laborers')).toContainText(/\$\d+(\.\d)?k/);
  await expect(page.getByTestId('province-pops-soldiers')).toContainText('Soldiers');
  await shot('province-panel');

  // Time passes: Germany has more deaths than births, so Bavaria slowly shrinks.
  await page.evaluate(() => window.__terraScutum!.step(365));
  await expect(page.getByTestId('province-people')).toHaveText('13.2 million');
  const after = await page.evaluate(
    () => window.__terraScutum!.getState().population!.provincePopulation,
  );
  const bavaria = await page.evaluate(() =>
    window.__terraScutum!.getState().world!.provinceIds.indexOf('deu_bavaria'),
  );
  expect(after[bavaria]).toBeLessThan(13_216_947);
  expect(after[bavaria]).toBeGreaterThan(13_100_000);

  // Half of the rest of the economy's jobs in Bavaria close (a test command; its
  // buildings keep theirs): unemployment jumps, and week by week (F65: wealth
  // moves on Mondays) people live less well.
  const result = await page.evaluate(() =>
    window.__terraScutum!.sendCommand({
      type: 'debugScaleJobs',
      province: 'deu_bavaria',
      group: null,
      factor: 0.5,
    }),
  );
  expect(result).toEqual({ ok: true });
  await expect(page.getByTestId('province-unemployment')).toHaveText(/^[45]\d\.\d %$/);
  await page.evaluate(() => window.__terraScutum!.step(70));
  expect(await numberOf(page, 'province-living')).toBeLessThan(living - 1);
  await shot('province-panel-jobs-closed');

  expect(problems).toEqual([]);
});

test('the Population screen and the country screen show the country’s people', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `population-${name}-${testInfo.project.name}.png`),
    });

  // Society lens → Population and pops: the player's country (the United States).
  await page.getByTestId('lens-society').click();
  await page.getByTestId('lens-screen-population').click();
  await expect(page.getByTestId('shell-window')).toHaveAttribute('data-window', 'population');
  await expect(page.getByTestId('population-country')).toHaveText('United States');
  await expect(page.getByTestId('population-people')).toHaveText('345 million');
  await expect(page.getByTestId('population-workforce')).toHaveText('177 million');
  await expect(page.getByTestId('population-unemployment')).toHaveText('4.2 %');
  await expect(page.getByTestId('population-change')).toContainText('+0.00 %');
  await expect(page.getByTestId('population-pops').locator('tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('population-pops-professionals')).toContainText(/\$\d{3},\d{3}/);
  // What people buy (F65): needs and the goods that meet them.
  await expect(page.getByTestId('population-needs-basic_food')).toHaveText(
    'basic food: grain, livestock and fish, processed food',
  );
  await expect(page.getByTestId('population-needs-services')).toContainText('no good yet');
  await expect(page.getByTestId('population-pops-owners')).toContainText('0.0 %');
  // Its provinces, the most peopled first.
  const provinces = page.getByTestId('population-provinces').locator('tbody tr');
  await expect(provinces).toHaveCount(49);
  await expect(provinces.first()).toContainText('California');
  await expect(provinces.first()).toContainText('41.2 million');
  await expect(page.getByTestId('population-note')).toContainText("country's market");
  await shot('screen');

  // A year later the country has grown a little.
  await page.evaluate(() => window.__terraScutum!.step(365));
  await expect(page.getByTestId('population-people')).toHaveText('346 million');
  await expect(page.getByTestId('population-change')).toContainText('+0.16 %');

  // A province's name opens its panel and closes the screen.
  await provinces.first().getByRole('button').click();
  await expect(page.getByTestId('shell-window')).toHaveCount(0);
  await expect(page.getByTestId('province-name')).toHaveText('California');
  await expect(page.getByTestId('province-people')).toHaveText('41.3 million');

  // The country screen's overview shows the living population, unemployment and standard of living.
  await page.getByTestId('province-country').click();
  await expect(page.getByTestId('country-population')).toHaveText('346 million');
  await expect(page.getByTestId('country-unemployment')).toHaveText(/^4\.\d %$/);
  await expect(page.getByTestId('country-living')).toContainText('of 99');
  // Its button opens the Population screen too.
  await page.getByTestId('country-open-population').click();
  await expect(page.getByTestId('population-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await shot('country-screen');

  expect(problems).toEqual([]);
});

test('the Population map mode colors provinces by how densely they are peopled', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `population-${name}-${testInfo.project.name}.png`),
    });

  // Opening the Society lens switches to the Population map mode (section 12.2).
  await page.getByTestId('lens-society').click();
  await expect(page.getByTestId('map-mode-population')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-legend')).toContainText('People per km²');
  await expect(page.getByTestId('map-legend').locator('li')).toHaveCount(7);
  await page.keyboard.press('Escape');
  await waitForFrames(page, 3);
  await shot('map-mode-world');

  // The tooltip says how many people live in the province under the mouse.
  await lookAt(page, 10, 50, 6);
  await waitForFrames(page, 3);
  const munich = await screenPosition(page, ...MUNICH);
  await page.mouse.move(munich.x, munich.y);
  await expect(page.getByTestId('map-tooltip')).toContainText('Bavaria');
  await expect(page.getByTestId('map-tooltip-population')).toHaveText(
    '13.2 million people · 189 per km²',
  );
  await shot('map-mode-europe');

  // Other map modes have no legend and a plain tooltip.
  await page.getByTestId('map-mode-political').click();
  await expect(page.getByTestId('map-legend')).toHaveCount(0);
  await page.mouse.move(munich.x + 3, munich.y + 3);
  await expect(page.getByTestId('map-tooltip')).toContainText('Bavaria');
  await expect(page.getByTestId('map-tooltip-population')).toHaveCount(0);

  expect(problems).toEqual([]);
});
