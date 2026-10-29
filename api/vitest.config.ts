import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '../tests/contract/**/*.test.ts', '../tests/guard/**/*.test.ts'],
  },
});
