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

## Escalation ladder

1. Haiku fails task → same model, improved brief (the brief is usually the
   bug), ONE retry.
2. Fails again → Sonnet 5.5 with the full failure history in the prompt.
3. Sonnet fails → Orchestrator stops the lane, involves Architect: a task
   that defeats Sonnet is almost always mis-decomposed or under-specified,
   not "too hard".

Every escalation is logged in the lane file: it is a signal about task
quality, and `/retro` aggregates these signals.

## Token-economy rules

- A cheap agent gets file PATHS and doc SECTION names, never pasted file
  contents the files themselves could provide.
- Briefs reuse stable wording (template in sprint-playbook §2) — stable
  prefixes cache well.
- Never send a strong model to do what a report already answers.
