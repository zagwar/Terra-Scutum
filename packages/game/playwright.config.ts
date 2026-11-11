import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests: Playwright opens the built game in headless Chromium.
 * Run with `npm run test:e2e` from the repository root (it builds the game first).
 */
const SOFTWARE_WEBGL_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    trace: 'off',
  },
  // Headless Chromium has no graphics card, so both renderers run in software (SwiftShader).
  // The game picks WebGPU when the browser offers it and WebGL 2 otherwise; each project
  // tests one of the two, so the renderer most players get (WebGPU) is covered as well.
  projects: [
    {
      name: 'webgl2',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: { args: SOFTWARE_WEBGL_ARGS },
      },
    },
    {
      name: 'webgpu',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: [
            ...SOFTWARE_WEBGL_ARGS,
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan',
            '--use-vulkan=swiftshader',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
