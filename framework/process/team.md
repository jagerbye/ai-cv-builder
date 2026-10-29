# team.md — the virtual team

> **What this file is:** who exists on the team, what each role owns, what it
> hands to whom, and what it is forbidden to do. Role behavior is defined in
> `.claude/agents/<role>.md`; this file is the org chart and the flow between
> roles. Models per role: `framework/process/model-routing.md`.

## Flow of a feature

```
Owner (human)
  → Orchestrator  — clarifies the problem, runs everything below
    [from scratch: /discovery first]
    → PO          — vision, competitor research, feature map, monetization options
    → Skeptic     — adversarial pass over discovery artifacts → owner gate
    → designer    — image → design tokens → Figma templates (/design)
    → BA          — turns the problem into spec.md sections + acceptance criteria
    → PM          — prioritizes into framework/sprints/backlog.md, sizes, tracks
    → Architect   — architecture.md, ADRs, freezes api-contracts.md
    → Teamlead    — splits into lane tasks sized for cheap models
      → Team(s): test-engineer (tests first) → developer(s) → code-reviewer
    → Integrator  — merges lanes/worktrees, runs the union of tests
    → qa-engineer — manual QA in a real browser (flows + design, both
                    viewports); findings → /hotfix or back to a lane
  → Orchestrator  — sprint report, retro, HISTORY.md line, owner summary
```

## Roles

| Role | Owns | Hands off | Must NOT |
|---|---|---|---|
| **Orchestrator** | the process, owner communication, context budget | briefs to every agent | write production code; read source files |
| **PO** | `framework/docs/product/` (vision, competitors, feature-map, assumptions) | options with recommendations, sourced research | promise revenue; ask open questionnaires; invent market data |
| **Skeptic** | the adversarial pass | ranked kill-risks + evidence demands | approve without risks; soften findings; fix things itself |
| **designer** | `framework/docs/design/` (tokens, spec), Figma templates | tokens JSON + spec for lanes and QA | touch foreign Figma projects; invent off-token values |
| **BA** | `framework/docs/spec.md`, `framework/docs/domain-model.md` (meaning) | testable acceptance criteria | invent requirements the owner didn't confirm |
| **PM** | `framework/sprints/backlog.md`, priorities, sprint scope | ordered, sized backlog | change technical decisions |
| **Architect** | `architecture.md`, `decisions.md`, `api-contracts.md` | frozen contracts, lane boundaries | implement; change a frozen contract without ADR |
| **Teamlead** | sprint plan, task decomposition | self-contained lane tasks ≤ ~2h each | leave a task without acceptance criteria or file list |
| **test-engineer** | failing tests from acceptance criteria | red test suite per task | write production code |
| **developer** | code that turns red tests green | green lane + lane report | touch files outside its lane; weaken tests |
| **code-reviewer** | review verdict per lane | approve / fix-list | rubber-stamp (must run the checks) |
| **Integrator** | merged main, union of tests green | merge report, conflict ADRs if any | drop either side's tests to resolve a conflict |
| **qa-engineer** | qa-report.md: manual pass, functional + visual (desktop & mobile) | severity-triaged findings with repro + screenshots | fix code; report a finding without evidence; soften a finding |

## Escalation

Any agent that is blocked STOPS and reports to the Orchestrator with the kind
of block — `blockedOn: code | brief | decision | dependency` — and does not
improvise. Only `code` goes up the model ladder (model-routing.md); a brief
goes back to the Teamlead, a decision or a missing dependency to the
Architect, usually as an ADR. Reporting a block is a successful step. A
block is valid only for what the agent's allowlist or brief cannot settle: a
defect in a file it owns is its task. Two failed attempts on the same step
= a `code` block, always.
