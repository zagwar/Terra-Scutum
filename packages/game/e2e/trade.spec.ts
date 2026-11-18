import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws the map in software, which is slow: give these tests more time.
test.setTimeout(150_000);

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

test('the Trade screen shows what a country imports and exports, from and to whom', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `trade-${name}-${testInfo.project.name}.png`),
    });

  // Japan, a big importer of iron ore and coal, a week into the game.
  expect(
    await page.evaluate(() =>
      window.__terraScutum!.sendCommand({ type: 'choosePlayerCountry', country: 'JPN' }),
    ),
  ).toEqual({ ok: true });
  await page.evaluate(() => window.__terraScutum!.step(8));

  // Economy lens → Trade.
  await page.getByTestId('lens-economy').click();
  await page.getByTestId('lens-screen-trade').click();
  await expect(page.getByTestId('shell-window')).toHaveAttribute('data-window', 'trade');
  await expect(page.getByTestId('trade-country')).toHaveText('Japan');
  await expect(page.getByTestId('trade-imports')).toContainText('$');
  await expect(page.getByTestId('trade-balance')).toContainText('−');
  await expect(page.getByTestId('trade-tariffs')).toContainText('$');
  await expect(page.getByTestId('trade-good-iron_ore')).toBeVisible();
  await expect(page.getByTestId('trade-imported-iron_ore')).toContainText('kt');
  await expect(page.getByTestId('trade-good-electricity')).toHaveCount(0);
  await shot('goods');

  // Where Japan's iron ore comes from: Australia among the suppliers.
  await page.getByTestId('trade-partners-iron_ore').click();
  const from = page.getByTestId('trade-from');
  await expect(from).toBeVisible();
  await expect(from).toContainText('Australia');
  await from.scrollIntoViewIfNeeded();
  await shot('iron-ore-from');

  // The partners, biggest first, the rest of the world last.
  await page.getByTestId('trade-tab-partners').click();
  const australia = page.getByTestId('trade-partner-AUS');
  await expect(australia).toContainText(/iron ore/i);
  await expect(australia).toContainText('km');
  await expect(page.getByTestId('trade-partner-rest')).toBeVisible();
  await shot('partners');

  // Test tools: an embargo on Australia; Japan turns to other suppliers.
  await page.getByTestId('trade-test-tools').locator('summary').click();
  const aus = await page.evaluate(() =>
    window.__terraScutum!.getState().world!.countryIds.indexOf('AUS'),
  );
  await page.getByTestId('trade-test-country').selectOption(String(aus));
  await page.getByTestId('trade-test-embargo').click();
  await expect(australia).toContainText('Embargo');
  // (Iron ore is still the chosen good.)
  await page.getByTestId('trade-tab-goods').click();
  await expect(page.getByTestId('trade-from')).not.toContainText('Australia');
  await expect(page.getByTestId('trade-imported-iron_ore')).toContainText('kt');
  await shot('embargo');

  // Lifted, Australia sells to Japan again.
  await page.getByTestId('trade-tab-partners').click();
  await page.getByTestId('trade-test-tools').locator('summary').click();
  await page.getByTestId('trade-test-country').selectOption(String(aus));
  await page.getByTestId('trade-test-lift').click();
  await expect(australia).not.toContainText('Embargo');
  await expect(australia).toContainText(/iron ore/i);

  // The World Market: world prices, what is traded, the biggest traders.
  await page.getByTestId('trade-tab-world').click();
  await expect(page.getByTestId('trade-world-iron_ore')).toContainText('China');
  await expect(page.getByTestId('trade-world-electricity')).toHaveCount(0);
  await shot('world');

  expect(problems).toEqual([]);
});
