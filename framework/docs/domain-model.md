# domain-model.md — entities and their language

> **What this file is:** the nouns of the system: entities, their fields,
> relations, invariants, and the exact names everyone must use. Exists so two
> teams never invent two names (or two shapes) for the same thing — the #1
> source of merge pain in parallel AI development.
> **Who writes it:** BA (business meaning) + Architect (shapes).
> **Who reads it:** any agent touching data; Teamlead when cutting lanes.

Format — one block per entity:

```
## <Entity>
- **Meaning:** one sentence, business language.
- **Fields:** name: type — note (only non-obvious notes).
- **Relations:** belongs to / has many …
- **Invariants:** rules that must always hold (become tests).
- **Lifecycle:** states and allowed transitions, if stateful.
```

Terms used loosely in conversation but precisely here go to
`framework/knowledge/glossary.md` with a link back.

---

## User

- **Meaning:** a person who signs in and owns CVs.
- **Fields:** `id: uuid`, `email: citext` — unique, `passwordHash: text` —
  argon2id, `createdAt`.
- **Relations:** has many `Cv`, has many `Session`.
- **Invariants:** email unique case-insensitively; `passwordHash` never leaves
  the data layer and never appears in a log, a report or an error.

## Session

- **Meaning:** one signed-in browser.
- **Fields:** `id: uuid`, `userId`, `tokenHash: text` — sha256 of the opaque
  cookie value, `expiresAt`, `createdAt`.
- **Invariants:** the raw token exists only in the cookie; expired sessions are
  rejected and may be deleted at any time.

## Cv

- **Meaning:** one CV a user is building for one target role.
- **Fields:** `id: uuid`, `userId`, `title: text` — derived from
  `contact.fullName` + `targetRole`, `targetRole: text`,
  `sourceKind: 'pdf'|'text'`, `sourceText: text` — **the immutable source of
  truth**, `state`, `version: int`, `createdAt`, `updatedAt`.
- **Relations:** belongs to `User`; has many `Fact`, `CvItem`, `Question`,
  `GenerationJob`.
- **Invariants:**
  - `sourceText` is written once at intake and never modified afterwards —
    everything downstream is derived from it and can be rebuilt.
  - `version` increments on every user-visible mutation; a `PATCH` carrying a
    stale version is rejected (C-008).
  - A CV in state `ready` has at least a `contact` block; an empty CV is a
    `failed` generation, not a `ready` one.
- **Lifecycle:** `generating → ready` | `generating → failed`;
  `ready → generating` (regenerate, C-010); `failed → generating` (retry).
  No transition deletes `sourceText`.

## Fact

- **Meaning:** one atomic, checkable statement about the person, taken from the
  source or given by the user — the unit the whole anti-hallucination design
  rests on.
- **Fields:** `id: uuid`, `cvId`, `kind: 'contact'|'employment'|'education'|
  'skill'|'achievement'|'other'`, `text: text` — the normalised statement,
  `sourceQuote: text` — **verbatim** span from `Cv.sourceText` (empty only when
  `source='user'`), `source: 'document'|'user'`, `createdAt`.
- **Relations:** belongs to `Cv`; referenced by many `CvItem`.
- **Invariants:**
  - `source='document'` ⇒ `sourceQuote` is a substring of `Cv.sourceText`
    after whitespace normalisation. A fact that fails this check is discarded
    at the extract stage — the model is not permitted to paraphrase its own
    evidence.
  - `source='user'` facts come from answered questions (F-005) or manual edits
    (F-006) and are trusted without a quote.
  - Facts are append-only; a correction adds a user fact, it does not rewrite a
    document fact.

## CvItem

- **Meaning:** one rendered piece of the CV — a summary, an experience entry, a
  bullet inside it, an education entry, or a skill.
- **Fields:** `id: uuid`, `cvId`, `kind: 'summary'|'experience'|'bullet'|
  'education'|'skill'|'contact'`, `parentId: uuid?` — a bullet's experience
  entry, `path: text` — stable addressable path, e.g. `experience[1].bullets[0]`,
  `order: int`, `data: jsonb` — kind-specific fields (employer, role, period,
  text…), `factIds: uuid[]`, `relevance: numeric?` — 0..1, experience only,
  `userEdited: boolean`.
- **Relations:** belongs to `Cv`; cites many `Fact`; may have a parent `CvItem`.
- **Invariants:**
  - Every item with `userEdited=false` has at least one `factId`, and all of
    them exist on the same CV. An item violating this never reaches storage —
    the verifier drops it first (ADR-002).
  - `userEdited=true` items are never overwritten by generation or by
    answering a question; they are preserved verbatim across a regenerate.
  - `order` is unique within (`cvId`, `kind`, `parentId`).
  - Experience entries are presented sorted by `relevance` desc, then period
    end desc.

## Question

- **Meaning:** something the AI needed and did not have — asked of the user
  instead of guessed.
- **Fields:** `id: uuid`, `cvId`, `path: text` — the `CvItem.path` it will fix,
  `text: text`, `reason: 'missing'|'vague'|'unverifiable'`,
  `status: 'open'|'answered'|'dismissed'`, `answer: text?`, `answeredAt?`,
  `followUpOfId: uuid?`, `priority: int`.
- **Relations:** belongs to `Cv`; may produce one `Fact` when answered.
- **Invariants:**
  - At most 12 `open` questions per generation; `priority` orders them
    (missing employer/date before stylistic vagueness).
  - A question may have at most one follow-up (`followUpOfId` chain length ≤ 1)
    — after that the field is left empty rather than looping (F-005).
  - Answering writes a `Fact` with `source='user'` and recomposes only the
    section owning `path`.

## GenerationJob

- **Meaning:** one durable attempt to turn a source into a CV.
- **Fields:** `id: uuid`, `cvId`, `userId`, `status: 'queued'|'running'|
  'succeeded'|'failed'`, `stage: 'extracting'|'composing'|'verifying'|null`,
  `attempt: int`, `leasedUntil: timestamptz?`, `startedAt?`, `finishedAt?`,
  `errorCode: text?`, `errorMessage: text?`, `inputTokens: int?`,
  `outputTokens: int?`, `scope: 'full'|'section'`, `scopePath: text?`.
- **Relations:** belongs to `Cv` and `User`.
- **Invariants:**
  - At most one non-terminal job per CV (enforced by a partial unique index) —
    this is what makes C-010's `409 CONFLICT` reliable.
  - `running` with `leasedUntil` in the past is reclaimable; reclaim increments
    `attempt`; `attempt > 2` ⇒ `failed`.
  - `finishedAt - startedAt ≤ 180 s`, else `failed` with `JOB_TIMEOUT`.
  - A terminal job is immutable.
