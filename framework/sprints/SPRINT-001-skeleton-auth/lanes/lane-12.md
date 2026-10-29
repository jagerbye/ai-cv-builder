# Lane 12 — wave B (unplanned scope: CVB-31)


## T-28 red phase (test-engineer)

Tests added (no production code):
- tests/contract/generation-persist.fixtures.ts (shared fixtures, gated Prisma wrapper)
- tests/contract/generation-persist.test.ts: first-run store (C-006 equality), verifier-accepted vs compose, ready + version +1, compose failure stores nothing, second run keeps userEdited (same id), version 1→2→3
- tests/contract/generation-persist-lease.test.ts: the fence. Zombie held at its persist transaction after the verifying write; lease expired; successor finishes; zombie released. Asserts one draft (successor), attempt 2, version 2. Variant with stop(). Variant: stopped worker, no successor, writes nothing.
- tests/contract/generation-persist-boot.test.ts: createGenerationPipeline({}) boots; run without key ends failed CONFIG_MISSING, nothing stored.
- api/src/core/jobs/loop.test.ts: startJobLoop polls without a caller; stop() waits for an in-flight run (compose held) and the run ends succeeded.
- api/src/core/jobs/test-lock.ts: added suite.expireLease(jobId) (test-only helper; the guard forbids a hand-written UPDATE of generation_jobs in a test file).

Red confirmation (gate run, lane command):
- generation-persist-lease: "expected 'finished' to be 'held'" (no persist transaction exists; zombie completes without writing a draft).
- generation-persist: "expected undefined to deeply equal { text: 'Summary run-a' ..." (no summary stored); "expected { state: 'generating', version: 1 } to deeply equal { state: 'ready', version: 2 }".
- generation-persist-boot: Cannot find module api/src/core/generation/pipeline.js.
- loop.test: Cannot find module ./loop.js.
- cvs-regenerate (T-26, existing): "expected true to be false" on the merge check, the CVB-31 defect.
- Guard (tests/guard): 14/14 green.

Criteria with no test: main.ts wiring (SIGTERM/SIGINT, boot-time loop start) is not testable without importing main.ts, which listens on :3000; review-only. "server.ts and main.ts import the same factory" has no behavioral test; review-only.

Open questions for Architect: CvDraft has no contact, so the contract test asserts the intake contact survives a run. Factory name createGenerationPipeline(env) and loop API startJobLoop({worker, intervalMs}) -> {stop(): Promise<void>} are my naming; the developer should match them.
