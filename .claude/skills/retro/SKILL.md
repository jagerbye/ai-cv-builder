---
name: retro
description: Harvest a finished sprint's lane reports into organizational memory — errors.md, patterns.md, playbook fixes. Use at sprint close or when the owner asks for a retro.
---

# /retro — turn a sprint into memory

You are the Orchestrator. Input: the sprint folder (plan, lanes, report).

1. **Errors:** collect every "errors worth remembering" block from lane
   files; deduplicate by root cause; append as E-NNN entries to
   `framework/knowledge/errors.md` (symptom keywords first — they must be greppable).
   A repeat of an existing E-NNN → strengthen that entry's Prevention line
   instead of duplicating.
2. **Patterns:** anything used successfully twice (per reports/reviews) →
   P-NNN in `framework/knowledge/patterns.md` with a codebase pointer.
3. **Contended resources:** list every fix of the sprint that added or
   tightened a coordination mechanism (a lock, a cleanup rule, a guard, an
   ordering convention, a "remember to") and group them by the RESOURCE they
   protect, not by their symptom. One resource with two mechanisms is not two
   errors — it is an isolation decision, and it goes to an ADR. This is the
   step that finds a recurring cause on its second occurrence instead of its
   fourth (patterns.md P-002, errors.md E-009).
4. **Process signals:** escalations and reworked briefs from `report.md` —
   if a cause repeats across sprints, fix the source: the brief template or
   playbook (`framework/process/sprint-playbook.md`), a rule file, or model routing.
   Process fixes are edits to those files, not notes.
5. **Output:** 5-line summary to the owner — what the project learned, what
   process changed. No ceremony.
