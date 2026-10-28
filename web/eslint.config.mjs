// ESLint flat config for the web workspace (ADR-010). Real linter, not tsc.
// typescript-eslint recommended, no type-aware rules (keeps lint fast).
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: tseslint.configs.recommended,
  },
);
