import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Fails the run when a suite leaks users or open jobs (E-004). Delta against a pre-run snapshot.
    globalSetup: ['./src/core/jobs/test-global-setup.ts'],
    include: ['src/**/*.test.ts', '../tests/contract/**/*.test.ts', '../tests/guard/**/*.test.ts'],
  },
});
