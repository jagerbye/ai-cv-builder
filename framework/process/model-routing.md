# model-routing.md — which model does what

> **What this file is:** the cost/quality routing table. The principle:
> **expensive models decide, cheap models type, middle models rescue.**
> Decomposition quality is what makes cheap models viable — a Haiku-class
> model is excellent at a well-specified ≤2h task and poor at an open-ended
> one, so the money is really spent (or saved) at the Teamlead step.

## Routing table

| Role | Model | Why |
|---|---|---|
| Orchestrator | Fable 5 (session model) | judgment, owner communication |
| Architect | Fable 5 / Opus-class | one bad architecture costs more than all dev tokens |
| BA, PM, PO | **Opus 5.5** | management writes few tokens but its output (criteria, priorities, vision) multiplies through everything downstream — quality here is cheap leverage |
| Skeptic (discovery) | **Fable 5** | adversarial judgment — cheap models agree too easily |
| designer | **Fable 5** | runs once or twice per project, and every screen inherits its taste — the cheapest place to buy design quality |
| Teamlead | **Opus 5.5** | decomposition quality IS the token economy: a better brief saves every Haiku-token below it |
| test-engineer | Haiku 5.5 | tests from written criteria = mechanical |
| developer | **Haiku 5.5** | small, fully-specified tasks |
| code-reviewer | Haiku 5.5, second pass Sonnet 5.5 on risk areas | cheap first filter |
| Integrator (merge) | **Fable 5** | conflict resolution is judgment work |
| qa-engineer | **Opus 5.5** | screenshot judgment is the product's face; heaviest of the Opus roles (vision tokens), still marginal vs dev lanes |
| hotfix developer | Haiku 5.5 (Sonnet retry) | same ladder, smaller tasks |
| debug of a stuck lane | Sonnet 5.5 → Fable 5 | see escalation ladder |

## Escalation ladder — but first, what kind of block is it

Every agent result carries `blockedOn: none | code | brief | decision |
dependency`. **Only `code` climbs the ladder.** The other three are not
capability failures and a stronger model cannot resolve them; they stop the
task and go to the Orchestrator as a one-line question (brief → Teamlead,
decision/dependency → Architect, usually an ADR).

1. `blockedOn: code` on a cheap model → same model, improved brief (the brief
   is usually the bug), ONE retry. This rung needs someone who can rewrite
   the brief; the sprint runner (`.claude/workflows/sprint.js`) cannot, so
   it skips to rung 2 and reports a second failure with both reports.
2. Fails again → Sonnet 5.5 with the full failure history in the prompt.
3. Sonnet fails → Orchestrator stops the lane, involves Architect: a task
   that defeats Sonnet is almost always mis-decomposed or under-specified,
   not "too hard".

`ok=false` with `blockedOn: none` is read as `code`: a failure that names
no cause is a capability failure until something says otherwise. The other
reading — "not a block, not a failure" — drops the task on the floor.

Why the field comes first: in the first project run on this framework, once
the ladder was wired through `blockedOn`, **not one task returned
`blockedOn: code` across two waves and three fix rounds.** Rung 2 was never
used. Every block was a brief or a decision — a dependency missing from the
approved list, a rule contradicting its own fixture, a lane test command
sweeping a sibling's suite — and four of them became ADRs instead of
improvised rules. Before the field existed, the same blocks were sent up the
ladder and paid a second model to be told the same thing. Treat an escalation
as a signal about the brief until proven otherwise.

Two costs, both real:
- **Latency.** A blocked task stalls its lane until the Orchestrator's next
  pass; the runner does not yet skip to the lane's next independent task.
  Answer blocks promptly, and keep lanes short enough that a stall is cheap.
- **Misuse.** Agents reach for `blockedOn` for defects in files they own —
  typically their own test files, which they treat as off-limits. The rule
  in the brief template: a block is valid only for what the allowlist or the
  brief cannot settle; a defect inside the allowlist is the task. The
  Orchestrator sends such a block straight back, without a tier change.

A reviewer rejection is not a block and not an escalation: it opens the fix
cycle (sprint-playbook §3) — one developer pass on the next tier with the
structured fix-list, then a re-review of that list item by item.

Every escalation and every block is logged in the lane file with its kind:
it is a signal about task quality, and `/retro` aggregates these signals.

## Token-economy rules

- A cheap agent gets file PATHS and doc SECTION names, never pasted file
  contents the files themselves could provide.
- Briefs reuse stable wording (template in sprint-playbook §2) — stable
  prefixes cache well.
- Never send a strong model to do what a report already answers.
