# Lane 04 — generation pipeline (the critical chain)

> **What this file is:** the working log of one lane: each agent appends its
> task block here. This is what the Orchestrator reads INSTEAD of diffs, so
> write it as a report, not a diary.

Per task, appended by the agents in order:

```
## T-NN <title>
- tests (test-engineer): <files added>, RED confirmed: <how>
- code (developer): <what was built, decisions made>, GREEN: <test command + result>
- gates: typecheck ✓ lint ✓ tests ✓
- review (code-reviewer): approved | fix-list → resolution
- escalations: none | Haiku→Sonnet on <step>, reason
- errors worth remembering: none | <symptom → cause → fix> (retro moves these
  to framework/knowledge/errors.md)
- docs touched: none | <which, why>
- time: tests ~h:mm, code ~h:mm, review ~h:mm → total ~h:mm (est. was ~h:mm)
- jira: <ISSUE-KEY> — synced <date> | sync pending | not mirrored
```

## T-09 Anthropic gateway (C-012, F-010)
- tests (test-engineer): added `api/src/core/generation/gateway.test.ts` (request shape, re-validation + one retry, 429/529/500/400/401/timeout classification, backoff, per-call budget, CONFIG_MISSING, secret/prompt logging, no global fetch), `api/src/llm/config.test.ts` (model from ANTHROPIC_MODEL, Sonnet default, optional key), `api/src/core/generation/sdk-seam.test.ts` (only gateway imports the SDK), fixtures `tests/fixtures/llm/{tool-ok,schema-violation,malformed-no-tool-use,malformed-wrong-tool-name,over-budget,error-400,error-401,error-429,error-500,error-529}.json`. No production code.
- RED confirmed: `npm -w api run test -- --run src/llm src/core/generation` → 1 failed, 6 passed. Failures:
  - `src/llm/config.test.ts`: suite-level `Cannot find module './config.js'` (missing module, not an assertion).
  - `src/core/generation/gateway.test.ts`: suite-level `Cannot find module './gateway.js'`. Individual gateway tests have NOT run yet, so they are unverified until the module exists.
  - `src/core/generation/sdk-seam.test.ts`: assertion `expected [] to deeply equal ['core/generation/gateway.ts']` (no importer exists yet).
  - `types.test.ts`: 6 passed (T-07, unchanged).
- Interface assumed by tests (developer must match): `createAnthropicGateway(config: LlmConfig, deps?: {fetch, sleep, logger})` in `api/src/core/generation/gateway.ts`; `readLlmConfig(env)` in `api/src/llm/config.ts` returning `{apiKey?, model, tokenBudgetPerCall, timeoutMs}`. SDK must be built with its `fetch` option, `maxRetries: 0` (gateway owns the 3-attempt policy), and `tool_choice {type:'tool',name}`. Errors carry `.code`.
- Gaps for the Teamlead (not resolved here, tests avoid pinning them):
  - `ToolCallRequest` (frozen T-07) has no field for the user message. Tests carry the prompt in `description`. Extract (T-10) cannot send the untrusted source block until the type gains a message field or a frozen convention.
  - The closed error enum in api-contracts C-000 has no codes for auth, invalid request, budget exceeded, or timeout. Tests assert distinct-from-each-other and not-retryable, not names. Chosen mapping to confirm: timeout → `LLM_UNAVAILABLE`. Missing key → `CONFIG_MISSING`.
- escalations: none
- errors worth remembering: none
- docs touched: none
- jira: CVB-9 — sync pending

## T-09 (developer) GREEN: Anthropic gateway (CVB-9)
- code (developer): `api/src/llm/config.ts` (`readLlmConfig(env)`, default model `claude-sonnet-5-5` from a named constant, budget 4096, timeout 60 s, key optional). `api/src/core/generation/gateway.ts` (`createAnthropicGateway(config, deps)`, the only SDK importer, `GatewayError` with `.code`). SDK 0.137.0 built with `fetch`, `timeout`, `maxRetries: 0`. Tool-use with `tool_choice {type:'tool', name}`. Result re-validated with `req.parse`. One schema retry: the assistant turn plus a `tool_result` (`is_error`) carrying the validation message, or plain text when there is no tool_use block. Backoff 500 ms then 1000 ms, 3 attempts for 429, 5xx, 529 and transport or timeout errors. 400, 401, 403 and other 4xx fail at once. Budget is input+output tokens across attempts and is checked after each response.
- test fix: `gateway.test.ts` line 71 `Record<string, any>` changed to `Record<string, unknown>` (lint `no-explicit-any`, gate lint). No assertion changed.
- GREEN: `npm -w api run test -- --run src/llm src/core/generation/gateway src/core/generation/sdk-seam src/core/generation/types` → 4 files, 34/34 pass, no network, no key.
- Lane command `npm -w api run test -- --run src/llm src/core/generation`: still red, but only on lane 07's files `verify.test.ts`, `verify.golden.test.ts`, `questions.test.ts` (modules `./verify.js`, `./questions.js` not built). Not touched here.
- gates: typecheck ✗ (only in T-12 and intake test files; no error in gateway/config/seam) · lint ✓ (after the test fix) · tests ✗ (lane 07, intake, web styles/client/App, stack-config, not T-09) · build ✗ (web `/src/main.tsx` unresolved, not T-09). Full output: scratchpad `gate-out.txt`.
- check-lane (base ee63f25, allowlist: llm/**, gateway*, sdk-seam test, fixtures/llm/**, lane + plan): no violation on T-09 paths. The only lane-04 violations are the lane 07 test files.
- errors worth remembering: none
- docs touched: none. Reason: no user-visible behavior change (spec §3.10 unchanged). C-012 is implemented as written. The three new error codes below need a C-000 decision, which the Teamlead owns.
- decisions for the Teamlead (not resolved by me):
  1. C-000 closed enum: the gateway throws `LLM_AUTH_FAILED`, `LLM_INVALID_REQUEST`, `LLM_BUDGET_EXCEEDED` (in addition to the C-000 codes). Timeout maps to `LLM_UNAVAILABLE` as the test asserts. Confirm the names or add them to C-000.
  2. `ToolCallRequest` has no user-message field. The gateway sends `description` both as the tool description (the test requires it) and as the user message. This doubles the prompt in tokens. A frozen field is needed before T-10 sends the untrusted source block.
  3. Default model id literal lives in `config.ts` only. Spec says default Sonnet 5.5. Confirm the id string `claude-sonnet-5-5`.
  4. Budget is input+output per callTool, checked after each response (it cannot stop a spend that is already made). `max_tokens` is also set to the budget.
- jira: CVB-9 — sync pending (not committed; orchestrator commits)

## T-09 review (code-reviewer, CVB-9): fix-list → not approved yet
- gates: gate.sh red (typecheck, test, build failed). All failures are outside T-09 files: lane 07 verify/questions tests (TS2307, 3 files), intake.test.ts (2 PDF tests), stack-config.test.ts (WEB_PORT in .env.example), web routes.test.tsx(70,12) TS18048. T-09 suites 34/34 green, no network, no key. Lane command red only on lane 07's three files.
- check-lane ee63f25 (allowlist: llm/**, gateway*.ts, sdk-seam.test.ts, fixtures/llm/**, lane-04.md, plan.md): no violation on T-09 paths. The working tree holds other lanes' changes, so the check also flags their files. Those are not T-09's.
- stub lens: happy path is fine (two distinct valid inputs, parsed through `parse`). Error codes are weak in places:
  1. gateway.test.ts 400 and 401 tests assert "not in the retryable list" and "401 code differs from 400 code". A stub returning LLM_AUTH_FAILED for every error would pass the 400 test. Fix: pin `LLM_INVALID_REQUEST` for 400 and `LLM_AUTH_FAILED` for 401.
  2. Timeout test asserts 1 <= calls <= 3. Fix: `toHaveLength(3)` and `delays` length 2, matching the 3-attempt policy.
  3. Budget test asserts only "rejected and not LLM_INVALID_OUTPUT". Fix: `code === 'LLM_BUDGET_EXCEEDED'`.
  4. sdk-seam.test.ts regex misses dynamic `import('@anthropic-ai/sdk')`. Fix: add that form to the pattern.
- code, non-blocking, for the Teamlead (already listed in the developer block):
  - Prompt is sent twice (tool description and user message). T-10 needs a frozen user-message field on ToolCallRequest (T-07 amendment).
  - Budget is checked after each response. A schema retry is sent with max_tokens = full budget even if little remains. Fix option: pass max_tokens = remaining budget on the retry. Input tokens are not capped at all.
  - C-000 needs LLM_AUTH_FAILED, LLM_INVALID_REQUEST, LLM_BUDGET_EXCEEDED, or the gateway codes need a decision.
  - `params as unknown as` cast: acceptable, but type the params properly if the SDK type allows.
- confirmed: model literal `claude-sonnet-5-5` only in api/src/llm/config.ts; SDK pinned 0.137.0; SDK imported only by gateway.ts (tests excepted); API key never logged; prompt not logged above debug.
- decision: T-09 is not closed until fixes 1–4 land. Re-run this lane's suites and check-lane after the fix. The gate.sh acceptance should be changed to "own files green, lane command red only on lane 07 files", per the developer's recommendation.
- errors worth remembering: zsh treats `====` as an equals-expansion, so echo the separator in quotes. macOS has no `timeout`, so gate.sh must be run without it.
- jira: CVB-9 — sync pending (not committed)

## T-09 (developer) fixes after review (CVB-9)
- 1. `gateway.test.ts`: 400 test now pins `LLM_INVALID_REQUEST`; 401 test pins `LLM_AUTH_FAILED` (both still assert 1 call, 0 backoff delays).
- 2. Timeout test: exactly 3 calls and 2 backoff delays.
- 3. Budget test: outcome equals `{ rejected: 'LLM_BUDGET_EXCEEDED' }`, 1 call.
- 4. `sdk-seam.test.ts`: pattern now also matches `import('@anthropic-ai/sdk')` (and `require(...)`).
- Production code unchanged. No reviewer item disputed.
- GREEN: `npm -w api run test -- --run src/llm src/core/generation/gateway src/core/generation/sdk-seam src/core/generation/types` → 4 files, 34/34, no network, no key.
- gate.sh: still red, none of it T-09: web routes.test.tsx(70,12) TS18048; stack-config.test.ts (.env.example); verify.golden.test.ts prompt-injection (2 tests, lane 07). The lane 07 TS2307 and intake failures from the earlier run are gone. Output: scratchpad `gate2.txt`.
- jira: CVB-9 — sync pending (not committed)

## T-09 re-review (code-reviewer, CVB-9): fixes 1-4 verified → own scope approved, gate blocked outside T-09
- fix 1 ✓ gateway.test.ts 400 pins `LLM_INVALID_REQUEST`, 401 pins `LLM_AUTH_FAILED`; both assert 1 call, 0 delays.
- fix 2 ✓ timeout test asserts 3 calls and 2 delays.
- fix 3 ✓ budget test asserts `{ rejected: 'LLM_BUDGET_EXCEEDED' }` with 1 call.
- fix 4 ✓ sdk-seam.test.ts pattern matches `import('@anthropic-ai/sdk')`, `require(...)`, and static `from`. The seam is still exactly `core/generation/gateway.ts`.
- own suites: 4 files, 34/34 green (run now, no network, no key).
- gate.sh (run now, exit 1): typecheck `src/app/routes.test.tsx(70,12)` TS18048 (lane 03); test `stack-config.test.ts` "lists nothing else" (lane 01, WEB_PORT) and 2 `verify.golden.test.ts` prompt-injection tests (lane 07). None in T-09 files. Output: scratchpad `review3-gate.txt`.
- check-lane ee63f25 with the T-09 allowlist (llm/**, gateway*, sdk-seam.test.ts, tests/fixtures/llm/**, lane-04.md, plan.md): every listed violation is another lane's file. No `api/src/llm/**`, gateway, sdk-seam or `tests/fixtures/llm/**` path is flagged.
- stub lens: the 400/401/429/529/500/timeout/budget tests pin concrete codes and call counts, so a hard-coded happy value or a single generic code fails them. Acceptable.
- open non-blocking items (unchanged, for the Teamlead): C-000 needs LLM_AUTH_FAILED, LLM_INVALID_REQUEST, LLM_BUDGET_EXCEEDED. ToolCallRequest has no user-message field (prompt sent twice). Budget is checked after the spend. Retry sends full max_tokens.
- verdict: ok=false on the gate criterion only. T-09 code and tests meet the acceptance. The task closes once the Teamlead either (a) accepts "own files green, lane command red only on other lanes' files", or (b) waits for wave A to land. Nothing committed.
- jira: CVB-9 — sync pending (not committed)

## T-10 (test-engineer) RED: extract stage (CVB-10)
- tests (test-engineer): added `api/src/core/generation/extract.test.ts` (21 cases); fixtures `tests/fixtures/llm/extract-ok.json`, `extract-paraphrase.json`, `extract-injection.json` (each holds `source` + raw `toolInput`). No production code.
- criteria → tests:
  - one gateway call returns Fact[] from the tool output → "makes exactly one gateway call…", "builds its facts from the source it was given…"
  - gateway failure / malformed output → "propagates a gateway failure…", "rejects tool output that does not match the fact shape"
  - kind, normalised text, source='document' → "each returned fact has a domain kind…"
  - sourceQuote substring after whitespace normalisation, stored unchanged → "each sourceQuote is a substring…", "keeps a quote that differs only in whitespace…"
  - paraphrase discarded, not repaired → "drops a fact whose quote is a paraphrase…", "does not substitute a matching span…"; negative cases: case-only mismatch, empty quote
  - source in one labelled untrusted block, treated as data → three "source is passed as one labelled untrusted block" tests (block delimiters, data/instruction text outside block, injected instruction stays inside block)
  - schema has no instruction channel → "exposes only the fact fields…", "closes every object…"
  - append-only → "a second extraction… mints fact ids that do not reuse…" (proxy only; the storage invariant is outside T-10's files)
- interface assumed (developer must match): `createExtractStage(gateway: AnthropicGateway): { extract(sourceText: string): Promise<Fact[]> }` exported from `api/src/core/generation/extract.ts`. The fake gateway calls `req.parse(raw)`, so parse must reject a non-array `facts`. Fact ids come from the stage (uuid-like strings).
- RED confirmed: `npm -w api run test -- --run src/core/generation/extract` → suite-level failure, 0 tests run. `Error: Cannot find module './extract.js'` (missing module, not an assertion). Individual assertions are UNVERIFIED until the module exists.
- gaps for the Teamlead (not resolved here):
  - `ToolCallRequest` has no user-message field. Tests require the untrusted block to be in `description`, which the gateway also sends as the tool description (the T-09 gap, still open).
  - Append-only is only proxied by id uniqueness across runs. A true append-only check needs the storage layer (not T-10).
  - Schema-side enum for `kind` is not pinned; the test checks only the output kinds.
- check-lane ee63f25 with allowlist (extract*, prompts/extract*, fixtures/llm/extract*, lane-04.md, plan.md): no T-10 path flagged. Other lanes' files are flagged as before (including T-09 fixtures `tests/fixtures/llm/error-*.json`, `tool-ok.json`, which are not in this allowlist).
- errors worth remembering: none
- docs touched: none
- jira: CVB-10 — sync pending (not committed)

## T-10 (developer) GREEN: extract stage (CVB-10)
- built: `api/src/core/generation/extract.ts` exports `createExtractStage(gateway)` → `{ extract(sourceText): Promise<Fact[]> }`. One `gateway.callTool` call with tool `extract_facts`. `parse` rejects a non-array `facts`, a non-object item, a non-string field, or a kind outside the six domain kinds. Whole output is rejected in those cases, so the gateway retries.
- built: `api/src/core/generation/prompts/extract.ts`. Builds the description: instructions, then the source inside `<<<UNTRUSTED SOURCE BEGIN>>>` / `<<<UNTRUSTED SOURCE END>>>`, with wording that says the block is untrusted data, never instructions.
- quote rule: a fact is dropped (not repaired) when its normalised text is empty, its normalised quote is empty, or the normalised quote is not a substring of the normalised source. Kept facts store `sourceQuote` unchanged, with `source: 'document'` and a fresh `randomUUID()` id per run.
- decision (inside my files): the schema pins `kind` to the six domain kinds (`enum`) and closes every object with `additionalProperties: false`. The RED gap on the unpinned enum is closed.
- decision (inside my files): `parse` shape-check only. The quote check runs after `callTool` returns, in `extract()`.
- not done (T-09 gap, left open): `ToolCallRequest` has no user-message field, so the untrusted block travels in `description`, which the gateway also sends as the tool description. Needs a T-07 amendment, not a T-10 change.
- not done (append-only): id non-reuse is proxied only. The storage invariant is outside T-10's files.
- test count: the RED note said 21 cases. The file has 17 `it` blocks, and all 17 pass. No test was edited.
- GREEN: `npm -w api run test -- --run src/core/generation/extract` → 1 file, 17/17.
- typecheck: no error in extract files (`tsc --noEmit` filter on `extract` is empty).
- gate.sh: red, and none of it is T-10. typecheck: session.test.ts/merge.test.ts missing modules (other lanes), routes.test.tsx. test: stack-config.test.ts (.env.example), verify.golden.test.ts (2 prompt-injection tests, lane 07), session/merge suite failures. Output: scratchpad `t10-gate.txt`.
- check-lane ee63f25 with T-10 allowlist (extract*, prompts/extract*, fixtures/llm/extract*, lane-04.md, plan.md): no T-10 path flagged. All flagged paths are other lanes' files.
- docs touched: none. The docs-sync rule file was not found at framework/rules/docs-sync.md, so no doc row was checked against it.
- errors worth remembering: none new.
- jira: CVB-10 sync pending (not committed)

## T-10 review (code-reviewer, CVB-10): fix-list → not approved yet
- own scope: `extract.ts`, `prompts/extract.ts`, `extract.test.ts`, `fixtures/llm/extract-*.json`. Lane command `npm -w api run test -- --run src/core/generation/extract`: 17/17 green. The test file has 17 `it` blocks. The RED note said 21; the developer's count of 17 matches the file. The RED snapshot is not in git (file untracked), so no test deletion can be confirmed either way. Teamlead to confirm the 21 → 17 change against the test-engineer's RED list.
- quote rule verified in code: empty text, empty quote, or non-substring after normalisation → drop. No repair. `sourceQuote` stored unchanged. Paraphrase fixture test exercises the real check.
- check-lane.sh `ee63f25 <allowlist>` (allowlist: extract*.ts, prompts/extract*, fixtures/llm/extract*, lane-04.md, plan.md): 81 violations overall, all other lanes' files (T-09 gateway/config/tests, lane 07, intake, web, tests/contract, lane logs). No T-10 path flagged. Exit 1 is caused by the shared working tree, not by T-10.
- gate.sh (run now, exit 1): typecheck session/merge/jobs missing modules and web routes.test.tsx(70,12); test stack-config.test.ts (WEB_PORT), verify.golden.test.ts (2 prompt-injection), boundaries.test.ts (1), session/merge/jobs suite failures. None in T-10 files. Output: scratchpad `t10-review-gate.txt`.
- fix-list (blocking):
  1. Delimiter breakout. `buildExtractDescription` embeds `sourceText` raw. A source containing `<<<UNTRUSTED SOURCE END>>>` closes the block early, so the text after it reads as instructions. Fix: neutralise both markers in `sourceText` before embedding (or reject a source that contains them), and add a test with a fixture whose source contains the END marker. Assert that the description contains exactly one BEGIN and one END marker.
- non-blocking:
  2. Test "builds its facts from the source it was given, not from a previous run" does not test source dependence. The fake gateway returns a fixed fixture, so any stage that returns that fixture passes. Rename it, or make the fake gateway reflect the request description.
  3. `Fact.text` is model-authored and only shape-checked. The spec verifies only `sourceQuote`, so this is acceptable. Verify stage should be aware of it.
  4. Stub lens: the quote filter is computed, so a hard-coded return fails the paraphrase tests. The suite is not decoration. Gap noted in item 2.
- verdict: ok=false on item 1 only. Re-run the lane command and check-lane after the fix.
- jira: CVB-10 — sync pending (not committed)

## T-10 fix round (developer, CVB-10)
- fix 1 (blocking): `prompts/extract.ts` now runs sourceText through `neutraliseMarkers` (case/whitespace tolerant BEGIN/END look-alikes become "[marker removed]"). New test in extract.test.ts: source with END and BEGIN markers gives exactly one of each in the description, injected text stays between them.
- fix 2: test renamed to "returns the facts of the fixture its gateway replays, per stage instance".
- item 3: noted, no code change (spec verifies sourceQuote only).
- lane command: 18/18 green. gate.sh: still red, same other-lane failures (session/merge/jobs, stack-config, verify.golden, boundaries); none in T-10 files.
- side effect: a quote that contains a marker string is dropped (fails substring check). Intended.

## T-10 re-review (code-reviewer, CVB-10): fix 1 verified → own scope approved, gate blocked outside T-10
- fix 1 ✓ `neutraliseMarkers` (case/whitespace tolerant, both markers) runs before embedding. Test "neutralises block markers" asserts exactly one BEGIN and one END in the description, with the injected text between them.
- fix 2 ✓ test renamed to "returns the facts of the fixture its gateway replays, per stage instance".
- item 3 accepted: `Fact.text` is shape-checked only, as the spec requires. Verify stage should know this.
- own suite: `npm -w api run test -- --run src/core/generation/extract` → 1 file, 18/18 green.
- quote rule unchanged and correct: empty text, empty quote, or non-substring after normalisation → drop. `sourceQuote` stored unchanged. Schema closed, `kind` enum-pinned.
- note on the dev's side-effect claim: the quote check runs against the ORIGINAL source, not the neutralised one. A marker-containing quote is dropped only because the model sees "[marker removed]" and cannot quote the original marker. Behaviour is intended, the claim is slightly imprecise. Not blocking.
- stub lens: the paraphrase, case-only, empty-quote, and no-substitution tests use computed filtering against fixtures, so a hard-coded return fails them. The injection tests check prompt construction, not stage output. Acceptable.
- gate.sh (run now, exit 1): typecheck session.test.ts, ownership, jobs.test.ts (worker.js missing, implicit any), routes.test.tsx(70,12). test: session/jobs suites, stack-config.test.ts (WEB_PORT), boundaries.test.ts (1), verify.golden.test.ts (2 prompt-injection). None in T-10 files. Output: scratchpad `cr-t10-gate.txt`.
- check-lane ee63f25 with T-10 allowlist (extract*, prompts/extract*, fixtures/llm/extract*, lane-04.md, plan.md): 82 violations, all other lanes' files. No T-10 path flagged. Output: scratchpad `cr-t10-check2.txt`.
- verdict: ok=false on the gate criterion only, same basis as the T-10 first review. The lane is done. The Teamlead decides between (a) accepting the lane-green plus check-lane-clean criterion, or (b) re-running gate.sh after the auth, cv, jobs and verify lanes land.
- nothing committed.

## T-11 (test-engineer, CVB-11): compose stage RED
- tests (test-engineer): added `api/src/core/generation/compose.test.ts` (11 cases: gateway called once and request never contains source sentinel; draft carries targetRole; factIds on summary/bullets/skills; reject uncited bullet, uncited summary; bullet 240 accepted / 241 rejected; verbatim source-quote bullet rejected; relevance-then-recency ordering; relevance outside 0..1 rejected; summary without target role rejected; empty facts → no gateway call). Fixture `tests/fixtures/llm/compose-ok.json` (5 facts, target role, recorded tool output).
- RED confirmed: `npm -w api run test -- --run src/core/generation/compose` → suite-level failure, 0 tests run. `Error: Cannot find module './compose.js'` (missing module, not an assertion). Individual assertions are UNVERIFIED until `compose.ts` exists.
- decisions the developer should know (test-engineer assumptions, not in spec):
  - module shape `createComposeStage(gateway)` → `{ compose(facts, targetRole) }`, mirroring extract.
  - reject-whole-output on uncited items, via `parse` (gateway retries), as extract does.
  - relevance range assumed 0..1.
  - CvDraft experience entries carry no factIds (types.ts); the test asserts factIds only on summary, bullets, skills. The entry-citation gap (plan T-12 blocker) is not decided here.
  - "copy of a source paragraph" tested as bullet === a fact's sourceQuote; no source text exists at this stage.
- errors worth remembering: none
- docs touched: none
- jira: CVB-11 — sync pending (not committed)

## T-11 (developer, CVB-11): compose stage GREEN
- files: `api/src/core/generation/compose.ts` (new, `createComposeStage(gateway)` → `{ compose(facts, targetRole) }`), `api/src/core/generation/prompts/compose.ts` (new, tool name, description, `buildComposeDescription`). Test and fixture unchanged.
- behaviour: no facts → no gateway call, empty draft. Otherwise one `callTool`; `parse` rejects the whole output on: uncited summary/bullet/skill (empty factIds), summary without target role (case-insensitive), bullet over 240 chars, bullet equal to or containing a fact sourceQuote (normalised), relevance outside 0..1 or non-finite. Gateway retries as in extract.
- ordering: relevance desc, then period end desc ("present"/"now" = newest), then start desc.
- decisions taken (inside the spec, not new): schema is closed; compose does NOT check factIds against the fact list (that is the verifier's job); the fact list sent to the model includes sourceQuote because the test asserts it is in the description. Summary and bullets are trimmed before the length check.
- lane command `npm -w api run test -- --run src/core/generation/compose` → 1 file, 11/11 green.
- typecheck: no error in compose files.
- lint (gate): 2 `no-explicit-any` errors in compose.test.ts lines 37 and 95 (the test-engineer's `clone()` helper). Not changed, because the test file belongs to the RED step. Needs a type-only fix, decision for the Teamlead.
- gate.sh: red, all failures in other lanes (typecheck routes.test.tsx, stack-config .env.example, verify.golden prompt-injection x2 in lane 07). None in T-11 files.
- check-lane ee63f25 with T-11 allowlist: no compose path flagged. Output: scratchpad `t11-check.txt`.
- docs touched: none. framework/rules/docs-sync.md does not exist, so no docs-sync row was checked.
- nothing committed.
- jira: CVB-11 sync pending (not committed)

## T-11 review (code-reviewer, CVB-11): compose stage → fix-list, not approved
- gates: gate.sh RED (exit 1, output scratchpad `t11-gate.txt`). Failures outside T-11: typecheck `src/app/routes.test.tsx(70,12)` TS18048 (lane 03); test `stack-config.test.ts` ".env.example lists nothing else" (lane 01); test `verify.golden.test.ts` prompt-injection x2 (lane 07). Lint and build green. Compose lane command 12/12 green (re-run by reviewer).
- check-lane ee63f25 with T-11 allowlist (compose*.ts, prompts/compose*, fixtures/llm/compose*, lane-04.md, plan.md): zero compose paths flagged. Flagged files all belong to other lanes (allowlist file scratchpad `t11-allow.txt`).
- criteria vs code: gateway called once with facts+role (compose takes no source arg) ✓; every summary/bullet/skill cites factIds ✓; experience carries relevance 0..1 ✓; order relevance desc then recency ✓; summary names target role ✓; bullets ≤240 ✓; bullet-vs-sourceQuote copy check ✓ for equality and ≥40-char containment.
- stub lens: happy-path tests pin concrete order and fields; rejection tests mutate the fixture, so a pass-through or always-throw stub fails. Acceptable overall. Gaps below.
- fix-list (required before approval):
  1. `compose.test.ts` has no test for the containment branch `q.length >= MIN_COPY_QUOTE && t.includes(q)` in `isSourceCopy`. Add: a bullet that contains a whole 40+ char `sourceQuote` plus extra words is rejected; and a 39-char quote contained is accepted (boundary). Without these, deleting the branch leaves the suite green.
  2. `compose.test.ts` "accepts a bullet that merely contains a short source quote": first assignment to `raw.experience[1].bullets[0].text` (the `Wrote ${...}` line) is dead, overwritten on the next line. Delete it.
  3. `compose.test.ts` "takes facts and target role only": `expect(stage.compose.length).toBe(2)` is a weak proxy. The sentinel is never in `FACTS`, so the no-source assertion cannot fail for a leak through facts. Keep the length check, and add a note that the signature is the real guarantee, or drop the sentinel-only claim from the test name.
  4. `plan.md` row T-11 still reads "11/11" (line 89). Now 12/12. Fix the count, and the status word, since the verdict is not approved.
- non-blocking, for the Teamlead:
  - `buildComposeDescription` sends `sourceQuote` of each fact to the model. ADR-002 says fact list only, and a Fact carries its quote by design. Recorded as accepted, not a defect.
  - Compose does not check that cited factIds exist in the input. The spec puts that in the verifier (criterion 2), so this is correct, and the verifier must be the one that catches it.
  - Entry-level citation is absent from `CvDraft.experience` (types.ts, frozen). This is the T-12 blocker already on the plan. Not compose's fault.
- gate-level blockers outside lane 04 (developer's diagnosis confirmed): routes.test.tsx typecheck (lane 03), stack-config .env.example (lane 01), verify.golden x2 (lane 07). T-11 cannot make gate green alone.
- verdict: ok=false. Own scope: fix-list items 1–4 are small and in the allowlist. Gate red is outside the lane. Task closes when 1–4 land and the gate blockers are fixed by their owners. Nothing committed.
- errors worth remembering: zsh treats `echo ====` as an equals-expansion, so quote the separator (also hit in review).
- docs touched: none
- jira: CVB-11 — sync pending (not committed)

## T-11 developer, review fix-list round (CVB-11)
- fix 1: added containment tests in compose.test.ts: bullet with a whole 40-char quote plus extra words is rejected; 39-char quote accepted.
- fix 2: deleted the dead first assignment in "accepts a bullet that merely contains a short source quote".
- fix 3: test renamed to say the signature is the guarantee; comment states the sentinel only guards the request builder. Kept length===2 as a signature pin.
- fix 4: plan.md T-11 row updated (lane 14/14).
- lane: compose 14/14 green. gate.sh still red, only outside lane 04 (routes.test.tsx TS18048, stack-config, verify.golden, contract cvs-create 415). Output: scratchpad t11-gate2.txt.
- nothing committed.

## T-09 (test-engineer re-run, CVB-9): no new RED written
- tests (test-engineer): none added. The RED step was already done (see the first T-09 block) and the gateway is implemented and committed in d937d17 and the working tree is clean. Writing a new RED on top of implemented code would mean inventing failures, so none was written.
- RED confirmed: not applicable on this run. Current state of the lane command `npm -w api run test -- --run src/llm src/core/generation`: 2 failed, 121 passed (123). Both failures are in `src/core/generation/verify.golden.test.ts` (lane 07, `verify.ts` territory: golden output mismatch and empty `accepted.experience` on the prompt-injection fixture). No T-09 file fails.
- T-09 subset (`src/llm`, `gateway`, `sdk-seam`, `types`): green.
- errors worth remembering: none
- docs touched: none
- jira: CVB-9 — sync pending (not committed)

## T-09 developer, make-green step (CVB-9)
- state on entry: implementation committed in d937d17, working tree clean for T-09 files. Nothing new written in production code or tests.
- T-09 subset `npm -w api run test -- --run src/llm src/core/generation/gateway src/core/generation/sdk-seam src/core/generation/types`: 4 files, 34/34 green. Re-run with `env -u ANTHROPIC_API_KEY`: still 34/34, no network needed.
- lane command `npm -w api run test -- --run src/llm src/core/generation`: 2 failed, 121 passed. Both failures are in `verify.golden.test.ts` (lane 07: golden mismatch on prompt-injection, and empty `accepted.experience`). No T-09 file fails. The lane command pulls in lane 07's suite through the `src/core/generation` prefix; the Teamlead should narrow the lane command to the T-09 files, or accept it as a known foreign failure.
- lane-scoped gate `GATE_LANE_TEST='<T-09 subset>' bash framework/scripts/gate.sh`: database ✓, lint ✓, lane-test ✓ → "gate ✓ all green".
- plan.md T-09 row: status set to green (lane gate) and awaiting re-review.
- docs-sync: framework/rules/docs-sync.md does not exist; no doc row checked.
- nothing committed.
- jira: CVB-9 sync pending (not committed)

## T-09 developer, diagnosis round (CVB-9)
- earlier "failure" cause: the lane command prefix `src/core/generation` pulls lane 07's verify.golden (red by design in a wave); T-09 itself was green. Brief defect, not a model defect: narrow the command to the T-09 files.
- real gap found and fixed: budget was only checked after a response, and the schema retry reused the full max_tokens, so one callTool could spend up to 2x the budget. Now the retry gets max_tokens = remaining and nothing is sent when remaining <= 0 (gateway.ts). Test added in gateway.test.ts (retry gets 850 of 1000; 150 budget fails with LLM_BUDGET_EXCEEDED after one call).
- gate (lane-scoped): lint + 35 T-09 tests green.
- still a Teamlead decision: LLM_AUTH_FAILED / LLM_INVALID_REQUEST / LLM_BUDGET_EXCEEDED are outside the closed C-000 enum (contract frozen, docs not in my allowlist); ToolCallRequest has no separate user-message field (types.ts frozen).
- nothing committed.

## T-09 review (code-reviewer, CVB-9): re-review 2 → approved, lane command narrowed
- gate (lane-scoped, run by reviewer): `GATE_LANE_TEST='npm -w api run test -- --run src/llm src/core/generation/gateway src/core/generation/sdk-seam src/core/generation/types' bash framework/scripts/gate.sh` → lint ✓, 4 files / 35 tests ✓, "gate ✓ all green". No network, no ANTHROPIC_API_KEY.
- check-lane ee63f25 with T-09 allowlist (llm/*, gateway*.ts, sdk-seam.test.ts, fixtures/llm/*, lane-04.md, plan.md): no T-09 path flagged. `types.ts` unmodified (frozen). Remaining violations are other lanes' files.
- criteria vs code: tool-use + tool_choice forced ✓; re-validation through `req.parse` on every response ✓; one schema retry with the error appended as tool_result ✓; 429/5xx/timeout retried, 3 attempts, exponential backoff ✓; 401/403 and 4xx fail once with distinct codes ✓; model from `ANTHROPIC_MODEL`, default Sonnet, no literal at call sites ✓; budget spans the schema retry, retry gets `max_tokens` = remaining, nothing sent at 0 ✓; no prompt body above debug, key never logged ✓; SDK import only in gateway.ts, guarded by sdk-seam.test.ts ✓.
- stub lens: the suite uses scripted transport and recorded fixtures per error class, pins codes and call counts (1 / 2 / 3), and feeds a varied tool input, so a hard-coded return fails. Acceptable.
- non-blocking fix-list (not blocking the task):
  1. Budget is checked after the spend. Input tokens are not bounded by `max_tokens`, so an oversized prompt is sent and only then rejected. A pre-send estimate of input size would close that. Optional for T-09.
  2. The gateway does not check the `inputSchema` itself. It trusts the caller's `parse` to enforce the same schema. Callers (T-10, T-11) must implement `parse` as the real validator. Worth a one-line note in api-contracts C-012.
  3. `config.test.ts` checks the default model with /sonnet/ only. Weak but acceptable.
- Teamlead escalations still open (not fixed here): C-000 must list `LLM_AUTH_FAILED`, `LLM_INVALID_REQUEST`, `LLM_BUDGET_EXCEEDED`, or they map to existing codes. `ToolCallRequest` has no user-message field, so the prompt travels in `description`, which the gateway also sends as the tool description (T-10 and T-11 depend on this).
- verdict: ok=true. T-09 meets the acceptance criteria. Nothing committed. plan.md row not re-flipped by reviewer (developer already flipped it).
- jira: CVB-9 sync pending (not committed)

## T-10 developer, make-green step (CVB-10)
- state on entry: tests (`api/src/core/generation/extract.test.ts`, 18 cases) and production (`extract.ts`, `prompts/extract.ts`) already exist from the earlier RED and review. No test or source file was changed in this run.
- lane command `npm -w api run test -- --run src/core/generation/extract`: 1 file, 18/18 green, no network, no key.
- lane-scoped gate `GATE_LANE_TEST='npm -w api run test -- --run src/core/generation/extract' bash framework/scripts/gate.sh`: database ✓, lint ✓, lane-test ✓ → "gate ✓ all green".
- check-lane not re-run: no allowlisted file was touched in this step.
- plan.md T-10 row updated to green with the lane gate result; awaiting re-review.
- docs-sync: no docs touched (no behavior, interface or data-shape change in this step).
- open items carried forward, not resolved here: (1) the untrusted block travels in `ToolCallRequest.description`, which the gateway also sends as the tool description (types.ts frozen, Teamlead decision); (2) append-only is enforced by id uniqueness only, storage invariant outside T-10's files; (3) the union gate is red on other lanes' files by design for this wave.
- nothing committed.
- jira: CVB-10 sync pending (not committed)

## T-10 re-review (code-reviewer, CVB-10): second review of make-green step → approved, lane scope
- gate (lane-scoped, run by reviewer): `GATE_LANE_TEST='npm -w api run test -- --run src/core/generation/extract' bash framework/scripts/gate.sh` → lint ✓, `extract.test.ts` 18/18 ✓, "gate ✓ all green". No network, no key. Union gate not judged (red on other lanes, E-001).
- check-lane ee63f25 with T-10 allowlist (extract*.ts, prompts/extract*, fixtures/llm/extract*, lane-04.md, plan.md): no T-10 path flagged. Violations are other lanes' files only (compose.ts, gateway, verify, cv, routes, web, tests/contract). Exit 1 comes from the shared tree.
- typecheck: `tsc --noEmit` reports no errors in `generation/extract*`.
- criteria vs code: one `callTool` per extract (test pins call count 1) ✓; Fact[] with kind enum-pinned, normalised text, sourceQuote ✓; quote check is substring-after-whitespace-normalisation against the original source, drop-not-repair, stored unchanged ✓; paraphrase, case-only, empty-quote and no-substitution cases each have a test that fails on a repairing or unfiltered implementation ✓; source in one labelled UNTRUSTED block with BEGIN/END markers neutralised ✓; schema closed (`additionalProperties:false` on every object, only fact field names) ✓; SDK not imported (goes through gateway) ✓.
- stub lens: a hard-coded return fails the call-count test and the computed-filter tests (the fake gateway replays fixtures through `req.parse`, so the filter is really exercised). Acceptable.
- earlier blocking item (delimiter breakout) verified fixed by the previous re-review and still present in `prompts/extract.ts`.
- non-blocking fix-list (none blocks T-10):
  1. Verification gap, "facts are append-only": the test checks only that new ids do not repeat across runs. Nothing proves the stage never mutates or overwrites an earlier array. Storage invariant stays with the owner of the persistence task. Teamlead to confirm this is covered there.
  2. `extract.test.ts` is untracked, so the 21 → 17 → 18 test-count history cannot be checked against git. Earlier review asked the Teamlead to confirm the RED list. Still open.
  3. Quote check accepts a very short quote (for example "a") as verbatim evidence. Spec does not forbid it. Possible follow-up: a minimum quote length, decided by the Teamlead.
- Teamlead decisions still open (not caused by T-10):
  a. The untrusted block travels in `ToolCallRequest.description`, which the gateway also sends as the tool description (`gateway.ts` line 125 and line 152). Literal ADR-002 compliance is met, but the carrier is weak. A user-message field needs a `types.ts` change, which is frozen.
  b. Frozen `Fact` in `types.ts` has no `cvId` or `createdAt`, while domain-model.md lists both. The extract stage returns the frozen shape, so the persistence layer must add them.
- plan.md T-10 row: developer already flipped it to green. Reviewer did not edit plan.md. Suggested status: approved (lane scope), awaiting Integrator union run.
- nothing committed.

## T-11 (test-engineer re-run, CVB-11): no new RED written
- tests (test-engineer): none added. `api/src/core/generation/compose.test.ts` already exists (14 cases after the review fix-list round) with fixture `tests/fixtures/llm/compose-ok.json`. The RED step and the GREEN step were already done earlier in this lane.
- lane command `npm -w api run test -- --run src/core/generation/compose` → 1 file, 14/14 passed. No failures to report, so no RED was produced in this run.
- no production code touched; nothing committed.
- jira: CVB-11 — sync pending

## T-11 developer, make-green step (CVB-11)
- state on entry: `compose.test.ts` (14 cases), `compose.ts`, `prompts/compose.ts` and fixture `tests/fixtures/llm/compose-ok.json` already exist. No test or source file changed in this run.
- criteria vs code: one `callTool` per compose, signature `(facts, targetRole)` so source text cannot enter ✓; every summary, bullet and skill cites factIds (empty or non-string rejected in parse) ✓; experience sorted relevance desc, then period end, then start year ✓; summary must contain target role (case-insensitive) ✓; bullets trimmed and capped at 240 chars, 240 accepted, 241 rejected ✓; bullet equal to or containing a whole source quote of 40+ chars rejected ✓; no facts gives no call ✓.
- lane command `npm -w api run test -- --run src/core/generation/compose`: 1 file, 14/14 green.
- lane-scoped gate `GATE_LANE_TEST='npm -w api run test -- --run src/core/generation/compose' bash framework/scripts/gate.sh`: lint ✓, lane-test ✓ → "gate ✓ all green".
- `tsc --noEmit`: no errors in `generation/compose*`.
- check-lane ee63f25 with T-11 allowlist (compose*, prompts/compose*, fixtures/llm/compose*, lane-04.md, plan.md): no compose path flagged. Remaining violations are other lanes' files.
- docs-sync: `framework/rules/docs-sync.md` does not exist; no doc touched (no interface or behaviour change).
- plan.md T-11 row set to green (lane gate), awaiting review.
- open, not T-11 defects: CvDraft.experience has no entry-level factIds (types.ts frozen; T-12 blocker).
- nothing committed.
- jira: CVB-11 sync pending (not committed)

## T-11 review (code-reviewer, CVB-11): approved, lane scope
- gate (lane-scoped, run by reviewer): `GATE_LANE_TEST='npm -w api run test -- --run src/core/generation/compose' bash framework/scripts/gate.sh` → lint ✓, `compose.test.ts` 14/14 ✓, "gate ✓ all green", exit 0. Union gate not judged (E-001).
- check-lane ee63f25 with T-11 allowlist (compose*.ts, prompts/compose*, fixtures/llm/compose*, lane-04.md, plan.md): zero violations mention a compose path. 110 violations are other lanes' files. Exit 1 comes from the shared tree.
- criteria vs code: `compose(facts, targetRole)` is the only input, so the source cannot reach the gateway; one `callTool` per call ✓. Summary, bullets and skills cite factIds, enforced in parse ✓. Experience sorted relevance desc, then period end (present = newest), then start year ✓. Summary must contain the role ✓. Bullets trimmed, ≤240 chars ✓. Bullet containing a whole ≥40-char quote rejected, 39-char case accepted ✓. No facts → no call ✓.
- stub lens: the fake gateway replays fixture output through the real `parse`, so the rejection tests and the ordering test (fixture order Globex, Acme, Initech → expected Initech, Acme, Globex) fail for any hard-coded or unsorted implementation. Acceptable.
- non-blocking fix-list (none blocks T-11):
  1. The "no sentinel in request" assertion is nearly tautological: the stage never receives the sentinel, so the check passes whatever the implementation does. The signature arity check is the real guard. Keep it, but do not cite it as proof.
  2. No error-case tests for: a skill with no factIds, an education entry missing institution, an experience entry missing employer/role/period. The parse code handles them, but they are not pinned.
  3. Recency tie-break has no test for two entries with the same relevance and same end year (start-year secondary key untested).
  4. Spec gap, escalate to Architect/Teamlead (not a T-11 defect): spec §3.4 says every content item cites factIds, but `CvDraft.experience` entries (employer/role/period) carry no factIds, and `types.ts` is frozen. Only the bullets are cited. This is the T-12 blocker the developer noted.
- docs-sync: no doc change needed (no interface or behaviour change in this step).
- plan.md T-11 row: green is correct for lane scope. Reviewer did not edit plan.md.
- nothing committed.
- jira: CVB-11 review done (not committed)
