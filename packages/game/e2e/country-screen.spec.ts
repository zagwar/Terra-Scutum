import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Headless Chromium draws the map in software, which is slow: give these tests more time.
test.setTimeout(150_000);

/** Opens the game and waits until the renderer, the sim and the world map are ready. */
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

/** Whether an <img> has finished loading a real picture. */
const imageLoaded = (page: Page, testId: string) =>
  page
    .getByTestId(testId)
    .evaluate(
      (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
    );

test('the country screen: Government view for my country, Diplomacy view for others (F138)', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const shot = (name: string) =>
    page.screenshot({
      path: join(SCREENSHOT_DIR, `country-screen-${name}-${testInfo.project.name}.png`),
    });

  // The top bar shows my country's real flag.
  await expect(page.getByTestId('top-bar-flag-image')).toHaveAttribute('data-flag', 'us');
  await expect.poll(() => imageLoaded(page, 'top-bar-flag-image')).toBe(true);

  // The flag opens the Government view: a large panel on the left, the map still visible on the right.
  await page.getByTestId('top-bar-flag').click();
  const screen = page.getByTestId('country-screen');
  await expect(screen).toHaveAttribute('data-view', 'government');
  await expect(page.getByTestId('country-name')).toHaveText('United States');
  await expect(page.getByTestId('country-view-label')).toHaveText('Government · Your country');
  await expect(page.getByTestId('country-government')).toHaveText('Presidential democracy');
  await expect.poll(() => imageLoaded(page, 'country-flag')).toBe(true);
  const box = (await screen.boundingBox())!;
  expect(box.x).toBeLessThan(40);
  expect(box.width).toBeGreaterThan(600);
  expect(box.x + box.width).toBeLessThan(1280 - 300);

  // Every part of section 12.4.1 is there; what isn't in the sim yet says which feature brings it.
  for (const part of [
    'country-leader',
    'country-politics',
    'country-interest-groups',
    'country-modifiers',
    'country-laws',
    'country-cabinet',
    'country-public-opinion',
    'country-overview',
    'country-screen-links',
  ])
    await expect(page.getByTestId(part)).toBeVisible();
  await expect(page.getByTestId('country-leader')).toContainText('Comes with F100 (M3)');
  await expect(page.getByTestId('country-interest-groups')).toContainText('Comes with F119 (M3)');
  await expect(page.getByTestId('country-public-opinion')).toContainText('Comes with F21 (M5)');
  await expect(page.getByTestId('country-public-opinion')).toContainText('Denial');
  await expect(page.getByTestId('country-next-election')).toHaveText(/—/);
  await expect(page.getByTestId('country-cabinet').getByRole('button')).toHaveCount(6);
  await expect(page.getByTestId('country-population')).toHaveText('345 million');
  await page.getByTestId('country-political-capital').hover();
  await expect(page.getByTestId('country-political-capital').getByRole('tooltip')).toContainText(
    'Comes with F72 (M3)',
  );
  await shot('government');

  // A law opens the Laws screen; the buttons open the screens this one summarizes.
  await page.getByTestId('country-law-conscription').click();
  await expect(page.getByTestId('shell-window')).toHaveAttribute('data-window', 'laws');
  await page.keyboard.press('Escape');
  await page.getByTestId('country-open-decisions').click();
  await expect(page.getByTestId('screen-empty')).toContainText('Comes with F97 (M3)');
  await page.keyboard.press('Escape');
  await page.getByTestId('country-open-ledger').click();
  await expect(page.getByTestId('screen-empty')).toContainText('Comes with F124 (M5)');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shell-window')).toHaveCount(0);
  await expect(screen).toHaveAttribute('data-view', 'government');

  // A neighbor's name opens that country's Diplomacy view.
  await screen.getByTestId('country-overview').scrollIntoViewIfNeeded();
  await page.getByTestId('country-neighbors').getByRole('button', { name: 'Canada' }).click();
  await expect(screen).toHaveAttribute('data-view', 'diplomacy');
  await expect(page.getByTestId('country-name')).toHaveText('Canada');
  await expect(page.getByTestId('country-flag')).toHaveAttribute('data-flag', 'ca');
  await expect.poll(() => imageLoaded(page, 'country-flag')).toBe(true);
  await expect(page.getByTestId('country-leader')).toBeVisible();
  for (const part of ['country-relations', 'country-intelligence', 'country-actions'])
    await expect(page.getByTestId(part)).toBeVisible();
  // Diplomatic actions are greyed out with the reason.
  const declareWar = page.getByTestId('country-action-declare_war');
  await expect(declareWar).toHaveAttribute('aria-disabled', 'true');
  await expect(declareWar).toContainText('Comes with F59 (M8c)');
  await expect(page.getByTestId('country-action-improve_relations')).toContainText(
    'Comes with F24 (M6)',
  );
  await expect(page.getByTestId('country-cabinet')).toHaveCount(0);
  await shot('diplomacy');

  // Back returns to my Government view; Esc closes the screen.
  await page.getByTestId('panel-back').click();
  await expect(screen).toHaveAttribute('data-view', 'government');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('country-screen')).toHaveCount(0);

  expect(problems).toEqual([]);
});
