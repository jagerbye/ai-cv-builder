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
  overlap run sequentially (see merge-policy.md, Mode B).
- **A parallel wave is bracketed, and you hold the opening bracket.** Before
  the first lane's first brief goes out: `framework/scripts/wave.sh start`,
  and note it in the sprint plan. Every lane brief exports `GATE_LANE_TEST`
  (sprint-playbook.md §2) — that is what the lane-scoped gate runs. The
  Integrator holds the closing bracket (`wave.sh end`, after the last merge);
  before you open stage 4.5 or end the session, `wave.sh status` must say
  "none". Every lane failing the same way, and the stronger model failing
  the same way after it, is not many hard tasks: check `wave.sh status`
  before you escalate anything.
- **Read the kind of block before you escalate.** A result's `blockedOn`
  decides the next actor: `code` → the ladder; `brief` → Teamlead;
  `decision` or `dependency` → Architect. A stronger model cannot settle a
  decision, and in practice almost every block is one. The ladder has two
  shapes, by who drives: the sprint runner (`.claude/workflows/sprint.js`)
  goes ONE tier up with the failure history — a script cannot rewrite a
  brief — and a second failure comes back to you with both reports; when
  you hand-drive a task, re-brief once first (the brief is usually the
  bug), then one tier up. `ok=false` with `blockedOn: none` is a `code`
  failure that named no cause, not a block to route — the runner treats it
  so. A reviewer rejection opens the fix cycle, not the ladder. Never let an
  agent grind >2 attempts on one error.

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
