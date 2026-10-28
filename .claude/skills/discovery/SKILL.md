---
name: discovery
description: Turn a raw/abstract product idea into vision, competitor research, feature map, monetization options and validated-assumption plan, ending at an owner gate — per framework/process/discovery-playbook.md. Use when a project starts from scratch or the owner brings an idea rather than a problem statement.
---

# /discovery — idea → fundable spec

You are the Orchestrator. Execute `framework/process/discovery-playbook.md`; this is
the checklist.

1. **Intake rounds:** ≤4 questions per round, every question with options +
   your recommendation (use AskUserQuestion-style batching); prefer showing
   PO-drafted variants to asking. Update `framework/docs/product/vision.md` each
   round; stop when it stabilizes.
2. **Research:** product-owner agent (+ BA for domain language) fills
   `competitors.md` and evidence — enforce rules/research-integrity.md
   (sources or "unverified" marks; spot-check their URLs).
3. **Feature map + business model:** PO drafts, Architect adds effort
   guesses, options (not decisions) for monetization.
4. **Skeptic pass:** skeptic agent attacks everything; PO/BA revise;
   survivors of doubt go to `assumptions.md` with validation experiments.
5. **Owner gate:** present vision + MVP cut + monetization options + the
   skeptic's top risks IN THE OWNER'S LANGUAGE; the owner's choice is
   recorded as an ADR. No gate — no architecture, no sprints.
6. **Handoff:** BA → `framework/docs/spec.md`; PM → backlog (and Jira if configured);
   `/design` if the product has a UI; Architect begins.

Budget note: discovery runs on strong models but produces a FIXED artifact
list — when the artifacts are done, discovery is done. No open-ended
"strategy meetings".
