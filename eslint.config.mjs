// Shared ESLint flat config for the monorepo. apps/web extends it with Next.js rules.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// packages/core and packages/extractors must stay pure: no database, network or filesystem access.
const ioModules = [
  'pg',
  'pg-boss',
  'drizzle-orm',
  'drizzle-orm/*',
  'undici',
  'node:fs',
  'node:fs/promises',
  'fs',
  'node:net',
  'node:http',
  'node:https',
  'node:child_process',
  '@pretoscop/db',
  '@pretoscop/fetch',
  '@pretoscop/llm',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/next-env.d.ts',
      '**/fixtures/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['packages/core/src/**/*.ts', 'packages/extractors/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/demo.ts', '**/cli/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ioModules.filter((m) => !m.includes('*')).map((name) => ({
            name,
            message: 'core and extractors are pure: no I/O imports (CLAUDE.md conventions).',
          })),
          patterns: [{ group: ['drizzle-orm/*'], message: 'core and extractors are pure.' }],
        },
      ],
    },
  },
);
