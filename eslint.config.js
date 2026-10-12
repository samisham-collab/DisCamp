// ESLint: Expo's rules plus type-aware checks that catch real bugs
// (forgotten promises, missing switch cases). Prettier handles formatting.
// https://docs.expo.dev/guides/using-eslint/

const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');
const tseslint = require('typescript-eslint');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'coverage/*',
      'android/*',
      'ios/*',
      'expo-env.d.ts',
      'supabase/functions/**/index.ts',
    ],
  },
  {
    files: ['*.config.js'],
    languageOptions: { globals: { __dirname: 'readonly', require: 'readonly', module: 'writable' } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    files: ['__tests__/**', 'jest.setup.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  prettierConfig,
]);
