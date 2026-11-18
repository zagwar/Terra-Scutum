import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws the map in software, which is slow: give these tests more time.
test.setTimeout(180_000);

/** Opens the game and waits until everything is ready. */
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

test('food: the top bar, the Food screen, rationing, and a famine on the map (F08)', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({ path: join(SCREENSHOT_DIR, `food-${name}-${testInfo.project.name}.png`) });

  // Germany, a week into the game: well fed, about 30 days of food in reserve.
  expect(
    await page.evaluate(() =>
      window.__terraScutum!.sendCommand({ type: 'choosePlayerCountry', country: 'DEU' }),
    ),
  ).toEqual({ ok: true });
  await page.evaluate(() => window.__terraScutum!.step(8));
  const topBarFood = page.getByTestId('top-bar-food');
  await expect(page.getByTestId('top-bar-food-value')).toHaveText(/^\d+ d$/);
  await expect(topBarFood).toHaveClass(/is-ok/);

  // The top bar's Food opens the Food screen.
  await topBarFood.click();
  await expect(page.getByTestId('shell-window')).toHaveAttribute('data-window', 'food');
  await expect(page.getByTestId('food-mood')).toHaveText('Well fed');
  await expect(page.getByTestId('food-reserves')).toContainText('days');
  await expect(page.getByTestId('food-good-grain')).toBeVisible();
  await expect(page.getByTestId('food-good-processed_food')).toBeVisible();
  await expect(page.getByTestId('food-nobody-hungry')).toBeVisible();
  await expect(page.getByTestId('food-rationing-automatic')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('food-rationing-now')).toContainText('In force: None');
  await shot('screen');

  // The player chooses strict rationing, then automatic again.
  await page.getByTestId('food-rationing-strict').click();
  await expect(page.getByTestId('food-rationing-strict')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('food-rationing-now')).toContainText('In force: Strict');
  await shot('rationing');
  await page.getByTestId('food-rationing-automatic').click();
  await expect(page.getByTestId('food-rationing-automatic')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // The test tool: a food crisis. Five weeks later Germany is in famine.
  await page.getByTestId('food-test-tools').locator('summary').click();
  await page.getByTestId('food-test-crisis').click();
  await expect(page.getByTestId('food-test-crisis')).toBeDisabled();
  // (The crisis's commands are already with the sim worker: it applies them before these days.)
  await page.evaluate(() => window.__terraScutum!.step(35));
  await expect(page.getByTestId('food-mood')).toHaveText('Famine');
  await expect(page.getByTestId('food-provinces')).toBeVisible();
  await expect(page.getByTestId('food-starving')).not.toHaveText(/^0\.0 %/);
  await expect(page.getByTestId('food-rationing-now')).toContainText('Emergency');
  await expect(topBarFood).toHaveClass(/is-bad/);
  await expect(page.locator('[data-alert-type="famine"]')).toBeVisible();
  // Each famine is told in a toast (a pop-up if the player wants one: Settings).
  await expect(page.getByTestId('toast').first()).toContainText('Famine');
  await shot('famine');

  // A famine province's name opens its panel, with its food.
  const firstProvince = page.getByTestId('food-provinces').locator('tbody tr').first();
  await firstProvince.locator('button').click();
  await expect(page.getByTestId('province-panel')).toBeVisible();
  await expect(page.getByTestId('province-food')).toBeVisible();
  await expect(page.getByTestId('province-famine')).toContainText('dead');

  // The food map mode: Germany's famine provinces stand out; the legend explains.
  await page.getByTestId('shell-window-close').click();
  await page.getByTestId('map-mode-food').click();
  await expect(page.getByTestId('map-legend')).toContainText('Famine');
  await page.evaluate(() => window.__terraScutum!.map.lookAt(10.4, 51.2, 5));
  await page.evaluate(() => window.__terraScutum!.map.settle());
  await page.waitForTimeout(1500);
  await shot('map');

  expect(problems).toEqual([]);
});
