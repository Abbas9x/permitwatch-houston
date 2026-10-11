import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'lighthouse', 'scraper', 'data/raw']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      // User-controlled data must never be rendered as raw HTML.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden in this project (XSS risk).',
        },
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'Assigning innerHTML is forbidden in this project (XSS risk).',
        },
      ],
    },
  },
  {
    // Type-aware rules for the server: unhandled promises are bugs in request handlers.
    files: ['server/**/*.ts'],
    ignores: ['server/**/*.test.ts', 'server/testUtils.ts', 'server/**/testing.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: { project: ['./tsconfig.server.json'], tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    files: ['server/**/*.test.ts', 'server/testUtils.ts', 'server/**/testing.ts', 'shared/**/*.ts', 'e2e/**/*.ts', 'scripts/**/*.{mjs,ts}', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite, jsxA11y.flatConfigs.strict],
  },
]);
