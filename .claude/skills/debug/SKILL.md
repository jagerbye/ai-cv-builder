---
name: debug
description: Systematic debugging with memory — grep framework/knowledge/errors.md first, reproduce, bisect the cause, fix via a failing test, record the lesson. Use for any non-trivial bug.
---

# /debug — bugs are paid for once

1. **Memory first:** grep `framework/knowledge/errors.md` for the symptom (error text
   fragment, component). A hit → verify its Fix applies; done in minutes.
2. **Reproduce:** a bug you can't reproduce you can't verify fixed. Capture
   the exact failing command/input; ideally as a failing test immediately.
3. **Localize before fixing:** recent changes (`git log` on the area),
   then narrow by evidence — logs, one hypothesis at a time, cheapest check
   first. No shotgun edits; before any state-changing action (restart,
   delete, migrate) confirm the evidence supports THAT action.
4. **Fix via test:** the reproducing test goes red → fix → green → full
   gates (a fix that breaks something else is not a fix).
5. **Record:** root cause → fix → prevention as an E-NNN entry in
   `framework/knowledge/errors.md` (or strengthen the existing entry that failed to
   prevent this). If prevention = a new rule/check, add it to the rule file
   or the gates in the same change.

Two failed hypotheses on a cheap model → escalate with the full history
(`framework/process/model-routing.md`), don't grind.
