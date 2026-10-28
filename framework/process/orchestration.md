# orchestration.md — how a session runs the process

> **What this file is:** the Orchestrator's operating manual: how a fresh
> session picks up the owner's problem with minimal context and drives it to
> a verified result through delegation.

## Session start (every new session)

1. You already have `CLAUDE.md` (the router). Do NOT read more yet.
2. Read `framework/STATE.md` — the externalized "now" (phase, in-flight, waiting-on,
   next actions). Read `framework/sprints/backlog.md` / the sprint `plan.md` only if
   STATE.md points you there. One–two files, never the docs tree.
3. Restate the owner's request in one paragraph; if it conflicts with an ADR
   or the current sprint, say so before doing anything.

## Keeping the main session small (hard discipline)

- **State lives in STATE.md, not in chat.** Update it at every meaningful
  change; then the session is disposable — compaction or a restart loses
  nothing. Never try to "remember" across turns what a file should hold.
- **Reading many files is a delegation signal:** fan-out searches and
  multi-file questions go to an Explore-type agent that returns a
  conclusion, not file dumps.
- **Cap the returns:** every brief states "report ≤30 lines"; a report that
  needs more is split work, not a longer report. Paste nothing back into
  your own context that a path reference can carry.
- **One summary per event:** when a sub-agent finishes, extract what
  matters into the lane file / STATE.md immediately and move on — don't
  carry raw reports forward through the session.

## Delegation rules (the economy comes from here)

- **You think, agents work.** You never implement; you brief.
- **A brief is self-contained:** goal, acceptance criteria, exact file paths
  to read (not contents), the one or two docs sections that matter, what NOT
  to do, and where to write the report. An agent must never need to "look
  around" the repo.
- **Reports replace raw output.** You read lane reports and test summaries,
  never diffs or file dumps. If a report is unclear, send a follow-up
  message to the same agent instead of reading the code yourself.
- **Parallelize only independent work.** Agents whose files or contracts
  overlap run sequentially or in worktrees (see merge-policy.md).
- **Escalation ladder, not retry loops.** Same failure twice on a cheap
  model → re-brief once; still failing → escalate one model tier with the
  failure history in the brief (see model-routing.md). Never let an agent
  grind >2 attempts on the same error.

## Context budget per role (guideline)

| Role | May read |
|---|---|
| Orchestrator | plans, reports, backlog — never source |
| Architect | framework/docs/ + directory listings + chosen key files |
| Teamlead | sprint plan, architecture §components, file tree of the lane area |
| developer | ONLY the files named in its task + named doc sections |
| reviewer | the lane's diff + the task's acceptance criteria |
| Integrator | diffs of conflicting areas + both lane reports |

## Session end

- Everything worth keeping is in files (lane reports, sprint report,
  framework/knowledge/). The chat is disposable; the repo is the memory.
- Overwrite `framework/STATE.md` (phase, in-flight, waiting-on, next 3 actions) — the
  next session starts from it, not from scrollback.
- Tell the owner: outcome first, then what changed, then what's next.
