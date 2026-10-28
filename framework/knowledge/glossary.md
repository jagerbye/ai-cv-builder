# glossary.md — the project's words

> **What this file is:** the shared vocabulary. A term is here when the same
> thing has been called two names in conversation, or when a common word is
> used narrowly in this project. Entities and their fields live in
> `framework/docs/domain-model.md`; this file points at it.

| Term | Means here | Not to be confused with |
|---|---|---|
| **Source** | the immutable text a CV was built from: the extracted PDF text or the pasted free text (`Cv.sourceText`) | the uploaded file, which is discarded after extraction |
| **Fact** | one atomic statement with a verbatim quote from the source, or supplied by the user — see domain-model.md `Fact` | a CV line; a line *cites* facts |
| **Item** | one rendered piece of the CV (summary, experience entry, bullet, education entry, skill) — `CvItem` | a field of the CV's JSON; items are rows |
| **Path** | the stable address of an item, e.g. `experience[1].bullets[0]` — questions and patches target paths | a URL path |
| **Grounded** | every claim in the output traces to at least one fact, checked by code | "the prompt told it not to lie" |
| **Verify / verifier** | the deterministic, LLM-free check in `core/generation` (ADR-002) | code review; QA |
| **Stage** | one of `extracting` / `composing` / `verifying` — what the user sees as progress | sprint stage; job status |
| **Job** | one durable generation attempt (`generation_jobs` row) | a CV; a request |
| **Question** | a gap the system refused to guess, bound to a path (F-005) | an open question in spec.md §5 |
| **userEdited** | a flag on an item the user touched by hand; generation never overwrites it | a dirty-form flag in the UI |
| **Gate** | `framework/scripts/gate.sh` — the one definition of green | a CI job; a review |
| **Lane** | one team's disjoint file area within a sprint | a git branch (a lane may use one) |
