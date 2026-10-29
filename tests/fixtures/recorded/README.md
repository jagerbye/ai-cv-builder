# tests/fixtures/recorded/ — recorded, not written

One real exchange per external dependency, captured by
`framework/scripts/record.sh <dependency> <case>` into
`<dependency>/<YYYY-MM-DD>-<case>.<ext>` with a `.request.txt` sidecar
(`.claude/rules/testing.md`, "recorded, not written"). The original is never
edited; adversarial and error cases are copies that name their source
recording. The reviewer runs `record.sh --scan` on every file here before it
lands. Empty until the first capture: the LLM fixtures that predate this rule
live in `../llm/` and are replayed by the fake gateway.
