# feature-map.md — every candidate feature, honestly classified

> **What this file is:** the bridge from competitor research to the backlog.
> Three classes, each with its own burden of proof: **table-stakes** (users
> expect it — list who else has it), **improve** (competitors have it — say
> HOW ours is better, specifically), **differentiate** (nobody has it — say
> WHY nobody does; "they didn't think of it" needs the skeptic's sign-off).
> **Who writes it:** PO; Architect adds effort guesses; owner's MVP cut at
> the gate decides what enters `framework/docs/spec.md`.

> **Not used by this project.** Discovery was skipped on purpose: the owner
> supplied a written brief, not a raw idea (see ADR-008 in
> `framework/docs/decisions.md`). This file is left as the framework's
> template so it is clear it was never started, not abandoned halfway.
> The only live product doc here is `assumptions.md`.


Format:

```
## FM-NN <feature>  — class: table-stakes | improve | differentiate
- Value: <which segment, what changes for them>
- Evidence: <competitor refs / user evidence, sourced>
- For "improve": how exactly ours is better; for "differentiate": why the
  gap exists (skeptic-checked)
- Effort guess (Architect): S / M / L
- Verdict: MVP | later | dropped (why)
```

---

<!-- Features go here. -->
