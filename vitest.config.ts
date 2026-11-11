import { defineConfig } from 'vitest/config';

// Unit tests for every package run in Node (no browser): `npm test`.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
