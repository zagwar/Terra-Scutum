import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Things the sim must never use (docs/13_technical.md, "Architecture rules"):
 * it has to run identically in a Web Worker and in Node, and be deterministic.
 */
const simForbiddenGlobals = [
  ...['window', 'document', 'navigator', 'self', 'localStorage', 'sessionStorage', 'indexedDB'],
  ...['fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'postMessage'],
  ...['process', 'require', 'Buffer', '__dirname', '__filename'],
].map((name) => ({
  name,
  message: 'The sim must not use browser or Node APIs: it runs in a Web Worker and in Node.',
}));

const simNonDeterministicGlobals = [
  {
    name: 'Date',
    message: 'The sim must be deterministic: use the calendar helpers and GameState.day.',
  },
  {
    name: 'performance',
    message: 'The sim never reads the clock: the host passes one in (enableProfiling).',
  },
  ...['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'requestAnimationFrame'].map(
    (name) => ({ name, message: 'The sim is synchronous: no timers.' }),
  ),
  { name: 'crypto', message: 'The sim must be deterministic: use GameState.rng.' },
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/test-results/**', '**/playwright-report/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `void something()` is how a one-line callback discards a value on purpose.
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },

  // ── The sim: pure, deterministic TypeScript ────────────────────────────────
  {
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@babylonjs/*',
                'react',
                'react-dom',
                'react/*',
                'react-dom/*',
                'vite',
                'vite/*',
              ],
              message: 'The sim must not import Babylon, React or build tooling.',
            },
            {
              group: [
                'node:*',
                'fs',
                'path',
                'os',
                'child_process',
                'worker_threads',
                'crypto',
                'util',
              ],
              message: 'The sim must not import Node-only modules.',
            },
            {
              group: [
                '@terra-scutum/*',
                '**/packages/game/**',
                '**/packages/runner/**',
                '**/packages/tools/**',
              ],
              message: 'The sim must not import from other packages; they import from the sim.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...simForbiddenGlobals, ...simNonDeterministicGlobals],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Never use Math.random() in the sim: use the seeded generator, GameState.rng.',
        },
      ],
      'no-console': 'error',
    },
  },

  // ── The game: browser code ────────────────────────────────────────────────
  {
    files: ['packages/game/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@babylonjs/core',
              message:
                "Import from the specific file (for example '@babylonjs/core/Meshes/mesh') so unused parts of Babylon stay out of the build.",
            },
          ],
          patterns: [
            {
              group: ['**/packages/sim/**', '**/sim/src/**'],
              message: "Import the sim through its public API: '@terra-scutum/sim'.",
            },
          ],
        },
      ],
    },
  },

  // ── Node code: runner, tools, config files, tests ─────────────────────────
  {
    files: [
      'packages/runner/**/*.ts',
      'packages/tools/**/*.ts',
      'packages/*/test/**/*.ts',
      'packages/game/e2e/**/*.ts',
      'packages/game/*.config.ts',
      '*.config.{js,ts}',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['packages/*/test/**/*.ts', 'packages/game/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Config files are checked by `tsc` where it matters, not by the typed lint rules.
  {
    files: ['*.config.{js,ts}', 'packages/game/*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
);
