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

test('budget: the treasury in the top bar, the Budget screen, taxes and a default (F09)', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({ path: join(SCREENSHOT_DIR, `budget-${name}-${testInfo.project.name}.png`) });

  // The United States, a week and a half in: its real 2025 deficit shows.
  await page.evaluate(() => window.__terraScutum!.step(10));
  const treasury = page.getByTestId('top-bar-treasury');
  await expect(page.getByTestId('top-bar-treasury-value')).toHaveText(/^\$.+ \(−\$.+\/wk\)$/);
  await expect(treasury).toHaveClass(/is-warn/);
  await treasury.hover();
  await expect(page.getByTestId('top-bar-treasury-tip')).toContainText('rating');
  await shot('top-bar');

  // The top bar's Treasury opens the Budget screen.
  await treasury.click();
  await expect(page.getByTestId('shell-window')).toHaveAttribute('data-window', 'budget');
  await expect(page.getByTestId('budget-mood')).toHaveText('In deficit');
  await expect(page.getByTestId('budget-debt')).toContainText('of GDP');
  await expect(page.getByTestId('budget-gdp')).toContainText('real 2025: revenue 31 %');
  await expect(page.getByTestId('budget-line-income_tax')).not.toContainText('—');
  await expect(page.getByTestId('budget-line-military')).not.toContainText('—');
  await expect(page.getByTestId('budget-line-research')).toContainText('Comes with F83');
  await expect(page.getByTestId('budget-taxes-medium')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('budget-automatic-off')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('budget-tax-laborers')).toBeVisible();
  await shot('screen');
  await page.getByTestId('budget-income').scrollIntoViewIfNeeded();
  await shot('lines');

  // The player raises taxes to very high: a week later the balance is a surplus.
  await page.getByTestId('budget-taxes-very_high').click();
  await expect(page.getByTestId('budget-taxes-very_high')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.__terraScutum!.step(14));
  await expect(page.getByTestId('budget-mood')).toHaveText('In surplus');
  await expect(page.getByTestId('budget-balance')).not.toContainText('−');
  await expect(treasury).toHaveClass(/is-ok/);
  await shot('taxes');

  // The test tool: a debt crisis. With taxes back at medium the next deficit means a default.
  await page.getByTestId('budget-taxes-medium').click();
  await page.getByTestId('budget-test-tools').locator('summary').click();
  await page.getByTestId('budget-test-crisis').click();
  await expect(page.getByTestId('budget-test-crisis')).toBeDisabled();
  await page.evaluate(() => window.__terraScutum!.step(14));
  await expect(page.getByTestId('budget-mood')).toHaveText('In default');
  await expect(page.getByTestId('budget-rating')).toHaveText('D');
  await expect(page.getByTestId('budget-cut')).toBeVisible();
  await expect(treasury).toHaveClass(/is-bad/);
  await expect(page.locator('[data-alert-type="default"]')).toBeVisible();
  // The default is told in a toast.
  await expect(page.getByTestId('toast').first()).toContainText('defaulted');
  await shot('default');

  expect(problems).toEqual([]);
});
