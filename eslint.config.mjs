// Root ESLint flat config: lints tests/ (root-level contract tests and fixtures), which no workspace lint covers.
// The api and web workspaces keep their own configs; this one is used only by `eslint tests` from the repo root.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: tseslint.configs.recommended,
    rules: {
      // An underscore-prefixed parameter is an interface slot the stub does not use.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Contract tests drive the app through loosely typed handles (dynamic imports, raw JSON bodies, stub seams): 66
    // `any` at the time of writing. Rewriting them is a typing project, not a lint fix; it is off for tests/ only,
    // and every other recommended rule (unused vars, ts-comment, etc.) stays on.
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
