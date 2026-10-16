import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

const config = [
  { ignores: ['.next/**', 'out/**', 'coverage/**', 'node_modules/**'] },
  ...compat.config({
    extends: ['eslint:recommended', 'next/core-web-vitals'],
    env: { browser: true, node: true, es2022: true },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  }),
];

export default config;
