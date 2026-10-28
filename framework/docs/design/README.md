# framework/docs/design — the design source of truth

> **What this folder is:** machine-readable design tokens + human-readable
> design spec. Code and Figma both derive from here (see
> `framework/process/design-playbook.md`).

## Files

- `design-tokens.json` — the tokens. Minimal expected shape:

```json
{
  "color":   { "bg": "#…", "surface": "#…", "text": "#…", "primary": "#…",
               "danger": "#…", "dark": { "bg": "#…", "text": "#…" } },
  "font":    { "body": "Family, fallback", "heading": "…",
               "scale": { "sm": "14px", "md": "16px", "lg": "20px", "xl": "28px" } },
  "space":   { "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "40px" },
  "radius":  { "sm": "4px", "md": "8px", "pill": "999px" },
  "shadow":  { "card": "0 1px 3px rgba(0,0,0,.12)" },
  "breakpoint": { "mobile": "375px", "tablet": "768px", "desktop": "1440px" }
}
```

  Extend freely, but every value used in code or Figma must exist here
  first — no orphan hex codes in components.

- `design-spec.md` — component inventory with states, layout principles,
  and notes on what was deliberately not copied from reference images.
  QA's visual yardstick.

- `references/` — owner-provided images the tokens were extracted from
  (kept for provenance; never the source of truth themselves).
