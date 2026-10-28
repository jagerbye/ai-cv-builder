# discovery-playbook.md — from a raw idea to a fundable spec

> **What this file is:** the zero-stage for projects started from scratch:
> the owner may not know what they want, and the team's job is to turn an
> abstract idea into a product hypothesis worth building — honestly. Three
> design principles: (1) options and drafts instead of interrogation,
> (2) artifacts + one adversarial skeptic instead of agent "meetings",
> (3) hypotheses with validation plans instead of promised profits.

## Stage 1 — Intake (Orchestrator, rounds)

- Per round: at most 3–4 questions, each with proposed answer options AND a
  recommendation ("I'd guess B, because…") — never an open "tell me about
  your audience". Prefer showing a draft to asking a question: "here are
  three positioning variants — which resonates?"
- After each round the PO updates `framework/docs/product/vision.md`; stop when the
  vision draft stabilizes (usually 2–3 rounds). Owner fatigue is a real
  cost: every question must earn its place.

## Stage 2 — Research (PO + BA, web search)

- Competitors into `framework/docs/product/competitors.md`: who, what they do well
  and badly, pricing, positioning — **every claim with a source URL or an
  explicit "assumption, unverified" mark** (rules/research-integrity.md).
  No invented market numbers, ever.
- User/problem evidence the same way.

## Stage 3 — Feature map (PO, with BA)

`framework/docs/product/feature-map.md`: every candidate feature classified
**table-stakes** (must have, everyone has it) / **improve** (competitors
have it, we do it better — say HOW) / **differentiate** (nobody has it —
say WHY nobody does: often there's a reason). Each tied to user value and
a rough effort guess from the Architect.

## Stage 4 — Business model (PO)

Into `vision.md`: lean canvas (problem, segments, UVP, channels, revenue,
costs, key metrics) and 2–3 monetization options with trade-offs — as
options for the owner, not a decision made for them.

## Stage 5 — Skeptic pass (skeptic agent, strongest model)

The skeptic attacks all artifacts: who actually pays? why hasn't a
competitor done this? which assumption kills the project first? Output: a
ranked risk list + demanded evidence. PO/BA revise; unresolved items become
entries in `framework/docs/product/assumptions.md` with a cheapest-validation plan.

## Stage 6 — Owner gate (mandatory)

The owner approves: vision, MVP scope cut, monetization choice. Recorded as
an ADR ("Discovery outcome"). **No architecture, no sprints before this
gate** — otherwise the team builds on invented requirements.

## Stage 7 — Handoff

BA converts the approved scope into `framework/docs/spec.md` features (testable
criteria); PM seeds `framework/sprints/backlog.md` (and Jira, when configured —
framework/process/integrations.md); design starts per `framework/process/design-playbook.md`;
Architect takes over. Discovery artifacts stay live: assumptions.md is
re-checked at every retro — a validated/killed assumption is progress.
