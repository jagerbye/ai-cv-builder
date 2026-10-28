# patterns.md — proven solutions to reuse

> **What this file is:** the positive twin of errors.md: approaches that
> worked well here and should be copied, not reinvented. A pattern earns its
> place by being used twice. Teamlead links relevant patterns in lane briefs
> ("Read: framework/knowledge/patterns.md §P-NNN").
> **Who writes it:** `/retro`, from lane reports and review notes.

Format:

```
## P-NNN <name>  (YYYY-MM-DD)
- **Problem:** when to reach for this.
- **Solution:** the approach, with a pointer to a reference implementation
  in the codebase (path), not a code dump.
- **Trade-offs:** when NOT to use it.
```

---

## P-001 Ambiguity is resolved in the spec, as exact expected values  (2026-10-23)

- **Problem:** cheap models fail open-ended tasks; most "model is too weak"
  escalations are really ambiguity the spec left for the agent to decide
  (e.g. WHICH transliteration standard, HOW a pager marks gaps).
- **Solution:** the spec states concrete input→output pairs for every
  ambiguous point (full mapping table, literal expected arrays), and briefs
  copy them verbatim. Observed effect: cheap-model lanes go green first try
  with zero escalations when every ambiguity is pre-resolved this way.
- **Trade-offs:** spec takes longer to write; worth it whenever work is
  delegated to cheap models or parallel teams. Don't gold-plate parts no
  lane depends on.
