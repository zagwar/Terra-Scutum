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

/** Waits until the 3D view has drawn a few more frames (so a change is really on screen). */
async function waitForFrames(page: Page, frames = 2): Promise<void> {
  const before = await page.evaluate(() => window.__terraScutum!.getFrameCount() ?? 0);
  await page.waitForFunction(
    (target) => (window.__terraScutum!.getFrameCount() ?? 0) >= target,
    before + frames,
    { timeout: 60_000 },
  );
}

const PARIS = [2.35, 48.86] as const;

function cameraOf(page: Page) {
  return {
    zoom: () => page.evaluate(() => window.__terraScutum!.map.zoom()!),
    heading: () => page.evaluate(() => window.__terraScutum!.map.heading()!),
    tilt: () => page.evaluate(() => window.__terraScutum!.map.tilt()!),
    center: () => page.evaluate(() => window.__terraScutum!.map.centerLongitude()!),
    /** The place in the middle of the screen. */
    middle: () => page.evaluate(() => window.__terraScutum!.map.placeAt(640, 360)!),
    isMoving: () => page.evaluate(() => window.__terraScutum!.map.isMoving()!),
    settle: () => page.evaluate(() => window.__terraScutum!.map.settle()),
    lookAt: (longitude: number, latitude: number, zoom: number) =>
      page.evaluate(([lon, lat, z]) => window.__terraScutum!.map.lookAt(lon, lat, z), [
        longitude,
        latitude,
        zoom,
      ] as const),
    screenPosition: (longitude: number, latitude: number) =>
      page.evaluate(([lon, lat]) => window.__terraScutum!.map.screenPosition(lon, lat)!, [
        longitude,
        latitude,
      ] as const),
    waitUntilStill: () =>
      page.waitForFunction(() => window.__terraScutum!.map.isMoving() === false, null, {
        timeout: 60_000,
      }),
  };
}

/** Holds a key for a while (long enough for a few frames of the slow test browser). */
async function hold(page: Page, key: string, frames = 6): Promise<void> {
  await page.keyboard.down(key);
  await waitForFrames(page, frames);
  await page.keyboard.up(key);
}

test('the camera glides, leans back as it zooms in, and moves with WASD', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const camera = cameraOf(page);

  // The whole world: looking almost straight down, north up.
  expect(await camera.zoom()).toBe(1);
  expect(await camera.heading()).toBe(0);
  expect(await camera.tilt()).toBeCloseTo(22, 6);

  // One notch of the wheel: the camera glides there instead of jumping.
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, -100);
  await camera.waitUntilStill();
  expect(await camera.zoom()).toBeCloseTo(1.25, 6);

  // Fully zoomed in, it leans back to the near tilt; zooming out brings it back.
  await camera.lookAt(...PARIS, 80);
  expect(await camera.tilt()).toBeCloseTo(45, 6);
  await camera.lookAt(...PARIS, 6);
  const tiltAt6 = await camera.tilt();
  expect(tiltAt6).toBeGreaterThan(22);
  expect(tiltAt6).toBeLessThan(45);

  // WASD (and the arrow keys) scroll the map; the camera glides after the key.
  const before = await camera.middle();
  await hold(page, 'KeyD');
  await camera.waitUntilStill();
  const afterEast = await camera.middle();
  expect(afterEast.longitude).toBeGreaterThan(before.longitude + 0.5);
  await hold(page, 'KeyW');
  await camera.waitUntilStill();
  expect((await camera.middle()).latitude).toBeGreaterThan(afterEast.latitude + 0.3);
  await hold(page, 'KeyA');
  await hold(page, 'KeyS');
  await camera.settle();

  await page.screenshot({
    path: join(SCREENSHOT_DIR, `camera-tilted-${testInfo.project.name}.png`),
  });
  expect(problems).toEqual([]);
});

test('the map turns with Q/E and the middle mouse button; picking and dragging stay exact', async ({
  page,
}, testInfo) => {
  const problems = await openMap(page);
  const camera = cameraOf(page);
  const shot = (name: string) =>
    page.screenshot({ path: join(SCREENSHOT_DIR, `camera-${name}-${testInfo.project.name}.png`) });

  // With the whole world in view the map always stays north up.
  await hold(page, 'KeyE');
  await camera.settle();
  expect(await camera.heading()).toBe(0);

  // Zoomed in, E turns the map clockwise and Q back.
  await camera.lookAt(...PARIS, 6);
  await hold(page, 'KeyE');
  await camera.settle();
  const turned = await camera.heading();
  expect(turned).toBeGreaterThan(1);
  await hold(page, 'KeyQ', 3);
  await camera.settle();
  expect(await camera.heading()).toBeLessThan(turned);

  // The middle mouse button turns it by how far the mouse moves (0.3° per pixel).
  const headingBefore = await camera.heading();
  await page.mouse.move(500, 400);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(600, 400, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  expect(await camera.heading()).toBeCloseTo(headingBefore + 30, 3);
  await waitForFrames(page);
  await shot('turned');

  // Turned and tilted, the mouse still finds the right place: hover and click Paris.
  const paris = await camera.screenPosition(...PARIS);
  await page.mouse.move(paris.x, paris.y);
  await expect(page.getByTestId('map-tooltip')).toHaveText('Île-de-France · France');
  await page.mouse.click(paris.x, paris.y);
  await expect(page.getByTestId('province-name')).toHaveText('Île-de-France');

  // Dragging still keeps the grabbed place under the mouse.
  await page.mouse.down();
  await page.mouse.move(paris.x + 60, paris.y + 40, { steps: 5 });
  await page.mouse.up();
  const dragged = await camera.screenPosition(...PARIS);
  expect(Math.abs(dragged.x - (paris.x + 60))).toBeLessThan(3);
  expect(Math.abs(dragged.y - (paris.y + 40))).toBeLessThan(3);

  // The wheel zooms towards the mouse here too.
  const aim = { x: Math.round(dragged.x), y: Math.round(dragged.y) };
  await page.mouse.move(aim.x, aim.y);
  const placeBefore = await page.evaluate(([x, y]) => window.__terraScutum!.map.placeAt(x, y)!, [
    aim.x,
    aim.y,
  ] as const);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await camera.settle();
  const placeAfter = await page.evaluate(([x, y]) => window.__terraScutum!.map.placeAt(x, y)!, [
    aim.x,
    aim.y,
  ] as const);
  expect(placeAfter.longitude).toBeCloseTo(placeBefore.longitude, 2);
  expect(placeAfter.latitude).toBeCloseTo(placeBefore.latitude, 2);

  // "Whole world" (and the Home key) bring back the whole world, north up.
  await page.getByTestId('map-reset-view').click();
  await camera.waitUntilStill();
  expect(await camera.zoom()).toBe(1);
  expect(await camera.heading()).toBe(0);
  await camera.lookAt(...PARIS, 6);
  await hold(page, 'KeyE', 3);
  await page.keyboard.press('Home');
  await camera.settle();
  expect(await camera.zoom()).toBe(1);
  expect(await camera.heading()).toBe(0);

  expect(problems).toEqual([]);
});

test('the map scrolls when the mouse is at the window edge', async ({ page }) => {
  const problems = await openMap(page);
  const camera = cameraOf(page);
  await page.evaluate(() => window.__terraScutum!.map.setEdgeScrolling(true));
  await camera.lookAt(...PARIS, 4);

  // At the right edge, the map scrolls east (the mouse is over the map, not a panel).
  const before = await camera.center();
  await page.mouse.move(1279, 300);
  await page.waitForFunction(
    (start) => window.__terraScutum!.map.centerLongitude()! > start + 1,
    before,
    { timeout: 60_000 },
  );
  // Back in the middle, it stops.
  await page.mouse.move(640, 300);
  await camera.waitUntilStill();
  const stopped = await camera.center();
  await waitForFrames(page, 4);
  expect(await camera.center()).toBe(stopped);

  expect(problems).toEqual([]);
});
