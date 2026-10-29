import { defineConfig } from 'vitest/config';

// ADR-019: a bare `npx vitest run` must reach the TEST database, never the app's. Set here (main
// process and workers inherit it) when the caller has not chosen one.
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test';

export default defineConfig({
  test: {
    environment: 'node',
    // Fails the run when a suite leaks users or open jobs (E-004). Delta against a pre-run snapshot.
    globalSetup: ['./src/core/jobs/test-global-setup.ts'],
    include: ['src/**/*.test.ts', '../tests/contract/**/*.test.ts', '../tests/guard/**/*.test.ts'],
  },
});
