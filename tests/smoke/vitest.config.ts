// Config for the stack smoke suite (sprint 001 QA-01). Run from the project root:
//   npx vitest run --config tests/smoke/vitest.config.ts
// Not part of the wave gate: it talks to the running containers and is run only
// by the full gate (framework/scripts/gate.config.sh, step `smoke`).
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    include: ['*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
