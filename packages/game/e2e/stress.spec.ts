import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// The render stress test is the heaviest scene there is, and the test browser draws in
// software (one or two frames a second): give it time.
test.setTimeout(420_000);

test('the render stress test: late-game load, counter and benchmark (F139)', async ({
  page,
}, testInfo) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.goto('/?debug=stress');
  await page.waitForFunction(
    () => window.__terraScutum?.isReady() === true && window.__terraScutum.stress.scene() !== null,
    null,
    { timeout: 120_000 },
  );

  // The late-game load is on the map (data/stress_test.json → render); with the whole world in
  // view every model is drawn (the worst case), as icons, once the models are made.
  await page.waitForFunction(
    () => (window.__terraScutum!.stress.scene()?.modelsDrawn ?? 0) > 25_000,
    null,
    { timeout: 60_000 },
  );
  const scene = (await page.evaluate(() => window.__terraScutum!.stress.scene()))!;
  expect(scene.buildings).toBeGreaterThan(19_500);
  expect(scene.units).toBeGreaterThanOrEqual(5_000);
  expect(scene.bugs).toBeGreaterThanOrEqual(2_000);
  expect(scene.lines).toBeGreaterThan(3_000);
  expect(scene.clouds).toBeGreaterThan(0);
  expect(scene.lasers).toBeGreaterThan(0);
  expect(scene.modelDetail).toBe('icon');

  // The counter shows the numbers.
  const overlay = page.getByTestId('stress-overlay');
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId('stress-fps')).toContainText('FPS');
  await expect(page.getByTestId('stress-load')).toContainText('2,400 bugs');

  // The sim worker runs the sim stress test's placeholder load at top speed.
  await page.waitForFunction(() => (window.__terraScutum!.stress.sim()?.days ?? 0) >= 5, null, {
    timeout: 60_000,
  });
  const sim = (await page.evaluate(() => window.__terraScutum!.stress.sim()))!;
  expect(sim.averageMs).toBeGreaterThan(0);

  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${testInfo.project.name}-stress-world.png`),
    timeout: 120_000,
  });

  // The benchmark visits every view and measures it (shorter here than for the designer).
  const results = await page.evaluate(() =>
    window.__terraScutum!.stress.runBenchmark({ measureSeconds: 2, settleSeconds: 8 })!,
  );
  expect(results.map((result) => result.view)).toEqual([
    'STRESS_VIEW_WORLD',
    'STRESS_VIEW_EUROPE',
    'STRESS_VIEW_FOREST',
    'STRESS_VIEW_BATTLE',
    'STRESS_VIEW_BATTLE_CLOSE',
  ]);
  for (const result of results) {
    expect(result.frames).toBeGreaterThanOrEqual(3);
    expect(result.fps).toBeGreaterThan(0);
    expect(result.drawCalls).toBeGreaterThan(10);
    expect(result.triangles).toBeGreaterThan(50_000);
  }
  // Up close at the battle the models are detailed, and the bugs are on screen.
  expect(results[4].modelsDrawn).toBeGreaterThan(2_000);
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${testInfo.project.name}-stress-battle.png`),
    timeout: 120_000,
  });

  // Playwright records the numbers (the CI run keeps them with the screenshots).
  const record = {
    renderer: testInfo.project.name,
    note: 'Measured in the headless test browser, which draws in software: not real-world frame rates.',
    scene,
    sim: (await page.evaluate(() => window.__terraScutum!.stress.sim()))!,
    results,
  };
  writeFileSync(
    join(SCREENSHOT_DIR, `${testInfo.project.name}-stress-results.json`),
    JSON.stringify(record, null, 2) + '\n',
  );
  console.log(
    results
      .map(
        (r) =>
          `${r.view}: ${r.fps.toFixed(1)} FPS, CPU ${r.cpuMs.toFixed(1)} ms, ` +
          `${r.drawCalls} draw calls, ${(r.triangles / 1e6).toFixed(2)} M triangles`,
      )
      .join('\n'),
  );
  expect(problems).toEqual([]);
});
