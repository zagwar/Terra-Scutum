import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const gameRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(gameRoot, '../..');

/** Short id of the version being built, shown in the game so it's clear which version a link is running. */
function buildCommit(): string {
  // Cloudflare Pages and GitHub Actions provide the commit; fall back to git, then to "dev".
  const fromEnv = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  // Relative paths, so the build works on any link (main link, preview links, later a desktop wrapper).
  base: './',
  plugins: [react()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    // Babylon.js is large; the engine chunk is expected to be over Vite's default warning size.
    chunkSizeWarningLimit: 2500,
    // Flags (F138) stay separate files, downloaded only when shown, instead of being put into the code.
    assetsInlineLimit: (file) => (file.includes('/flag-icons/') ? false : undefined),
  },
  server: {
    // The game imports `data/` and `locales/` from the repository root.
    fs: { allow: [repoRoot] },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
