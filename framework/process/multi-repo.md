# multi-repo.md — scaling the framework past one repository

> **What this file is:** how the framework works when the product is several
> repos (front, API, infra, …). The principle: ONE source of truth for
> everything cross-repo, copies nowhere.

## Layout

- **Platform repo** (or a `platform-framework/docs/` repo): owns the cross-repo truth —
  `framework/docs/api-contracts.md`, `framework/docs/domain-model.md`, `framework/knowledge/` and the
  framework/process/ files. This framework template lives here.
- **Each code repo:** its own `CLAUDE.md` router (≤40 lines: "this repo is
  component X; cross-repo truth lives at <platform repo>; local spec below"),
  its own `framework/docs/spec.md` slice, runbooks, `framework/scripts/gate.sh` + config, hooks.
- A repo NEVER copies a contract into its own docs — it references C-NNN.
  Contract tests in each repo pin the contract version they implement.

## Cross-repo sprints

- A lane = a repo (natural isolation: no merge conflicts possible).
- Order of work = dependency order: contracts frozen first (platform repo),
  then provider repo, then consumer repos; the consumer may start against
  the frozen contract in parallel, using mocks derived from it.
- One Orchestrator session drives all repos; one Integrator per repo; the
  cross-repo "merge" is the contract-test run of every consumer against the
  provider's staging — that run is the sprint's union gate.

## Knowledge

`framework/knowledge/errors.md` and `patterns.md` live ONLY in the platform repo —
a lesson paid for in one repo must protect all of them. Lane briefs in any
repo point their grep at the platform copy.
