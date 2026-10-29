# decisions.md — architecture decision records (ADR)

> **What this file is:** append-only log of decisions already made, so a new
> session does not re-litigate them. Without this file, every fresh agent
> "helpfully" proposes to rewrite what was chosen on purpose. An agent that
> wants to act against an ADR must stop and escalate to the owner instead.
> **Who writes it:** Architect (technical), Orchestrator (framework/process/product).
> **Who reads it:** anyone about to make or question a design choice.

Format — newest on top, one block per decision:

```
## ADR-NNN: <title>  (YYYY-MM-DD, status: accepted|superseded by ADR-MMM)
- **Context:** what forced a choice.
- **Decision:** what we chose.
- **Alternatives rejected:** A (why not), B (why not).
- **Consequences:** what this commits us to.
```

---

## ADR-029: A retry policy is dimensioned against an observed failure (2026-10-29, accepted)

- **Context:** the first full run on the current build failed at generation
  with `RATE_LIMITED`, while a hand-made call to the same provider seconds
  earlier succeeded. The provider's own message: *"could not verify available
  credits for this request in time"* — a transient condition on their side,
  not an exhausted quota and not our request size (1024, 8192 and 32000
  max_tokens all behaved the same, one failing at random). Our gateway retries
  a 429 three times with a 500 ms base, so the three attempts span about a
  second and a half, and the condition outlasts them. The policy satisfied the
  letter of F-010 — "exponential backoff up to 3 attempts" — and caught
  nothing, because 500 ms was a guess made when there was no provider to
  measure against.
- **Decision:** the policy is sized against what the provider actually does.
  `Retry-After` is honoured when the response carries one, because the server
  knows better than our constant. Otherwise exponential backoff with a base in
  seconds and jitter, and the attempt count bounded by what is left of the
  job's budget (C-005 allows 180 s; a handful of seconds of waiting is free)
  rather than by a number chosen for its roundness.
- **Alternatives rejected:** raising the base and leaving it at that (the same
  guess, bigger — and it ignores the header the provider sends); retrying
  until the budget runs out (a provider that is genuinely down then costs the
  whole budget before failing, and the user waits three minutes for an answer
  we could give in ten seconds).
- **Consequences:** F-010's wording gains the detail it lacked; the gateway's
  tests must drive it with a clock they control rather than real waiting; and
  the general lesson is already in the template from this build's harvest —
  a decision about something outside the repository needs a spike against the
  real thing before it is written down, not after it fails in front of someone.
- **Amendment A, and it is against this ADR itself.** The reviewer pointed out
  that this decision was made the way it forbids: nobody measured how long the
  provider's condition actually lasts, so 2/4/8 seconds is a better guess than
  500 ms and still a guess. Recorded rather than dressed up. The honest
  statement of what the policy now buys: it outlasts an interruption of about
  fourteen seconds where the old one outlasted one and a half, and the number
  that would replace the guess is the observed duration of a real outage,
  which this build then measured. **The spike, run the same day:** six tool-use
  requests twenty seconds apart against the proxy in use returned 429, 429,
  200, 429, 200, 429 — the condition is INTERMITTENT at roughly one success in
  three, not a sustained outage. That changes what helps: against an
  intermittent failure the number of independent attempts matters more than
  the length of each pause, and a generation needs at least two provider calls
  to succeed, so a per-call success of four in five still fails one generation
  in three. The default policy is sized for a provider that behaves; an
  environment as flaky as this one raises `ANTHROPIC_RETRY_BUDGET_SECONDS`,
  which is why it is configuration and not a constant. The defaults are
  deliberately NOT tuned to one proxy's bad afternoon. Also noted: the
  waiting budget is per provider REQUEST, and `callTool` makes two schema
  attempts, so one generation can wait roughly twice the budget — still far
  inside C-005's 180 seconds, and now written down instead of discovered.

---

## ADR-028: One name-end rule, a strict job title, and the limit written down (2026-10-29, accepted)

- **Context:** the reviewer attacked ADR-027's word boundary. Hyphen and slash leaked through it: employer `Acme`
  was grounded by "Acme-Labs" and "Acme/Labs", `MIT` by "MIT-IBM Watson AI Lab", skill `C` by "C-level", `Go` by
  "Go-Live", contact `Jane Doe` by "Jane Doe-Smith", location `Paris` by "Paris-Saclay". The role still used the
  substring test, so `Engineer` was grounded by "Engineering Manager".
- **Decision 1:** a name continues through a letter, digit or underscore, and through a `-` or `/` that is followed by a
  letter or digit. One definition (`CONTINUES`/`NAME_END` in verify-entities.ts) serves containsWord,
  containsEmployer and containsToken. "Acme - Labs" and "Acme/ " still end the name.
- **Decision 2:** the role is matched as a whole phrase (containsWord), not a substring. Only the lookahead was
  tightened; "Engineer" inside "Backend engineer" is still named.
- **Decision 3:** a test whose premise is an unset variable unsets it (testing-strategy.md).
- **Known limit, stated rather than hidden (alongside ADR-024 and ADR-025):** an employer that is only the first word
  of a longer capitalised name is dropped and asked about. `Acme` against "Acme Warsaw" drops, by the same rule that
  correctly drops `Amazon` against "Amazon Web Services"; no deterministic test can tell a branch office from a
  different company. The strict direction is the right one: the entry drops and the user is asked. Likewise a name
  preceded by a hyphen ("Ex-Acme") is not checked on the left; only the right edge is. This component is closed.
- **Separator residue (closing probe, 2026-10-29), as it stands after the fix:** the name edge was probed against each
  separator. Continue the name (a different name, so not grounded): a letter, digit, `_`, `-`, `/`, U+2212 minus and
  a doubled `--` or `/-` before a letter or digit, `.` before a letter or digit, en and em dash, U+2010 to U+2015, and
  `&`, `+`, `#` ("Acme&Co" is not `Acme`; "C++" and "C#" are not skill `C`). Ends the name, correctly: `,`, `:`, `\`,
  `·`, U+2019, a spaced dash. Written limit, deliberately NOT fixed: `'` stays a boundary, so "Acme's" grounds `Acme`
  (a legitimate possessive of a cited name) and "D'Angelo" grounds skill `D`. The second is the smaller cost; do not
  "fix" it, that would break every possessive. The list is closed. Golden fixtures hold no name joined by a separator
  (only periods like "2020-2022", which containsPeriod owns).

---

## ADR-027: A question binds to the item it is about, and "named" means a word (2026-10-29, accepted)

- **Context:** the owner was about to sign off the groundedness guarantee, so
  it was attacked rather than reviewed. Three breaks, each of a sentence the
  specification actually promises.
- **Decision 1 — a question belongs to an item, not to a position.** The
  verifier numbers its paths against the **drafted** arrays; persist stores the
  **accepted** ones, with dropped entries removed; read re-sorts by relevance;
  the editor aligns by position in the response. So the moment anything is
  dropped, every later index means a different job. The prompt-injection
  fixture demonstrates it: drafted `[Google, Costa Cafe]`, accepted
  `[Costa Cafe]`, and `experience[0].employer` — "not in the cited source" —
  now sits beside the user's real employer. A question against the wrong line
  is worse than no question: it tells the user their true job is unverified.
  A stored question therefore **binds to the item id it is about**, and C-006's
  `path` is derived at read time from where that item currently sits. A
  question about something that was dropped binds to no item and names its
  section, never an index that now means something else.
- **Decision 2 — "a cited fact must name it" means a word, not a substring.**
  `containsText` is a case-insensitive substring test, so an employer `Amazon`
  is grounded by "Deployed on Amazon Web Services", an institution `MIT` by
  "Submitted 40 patches", and the skills `Go`, `C` and `SQL` by "Wrote
  JavaScript at Google; trusted with NoSQL". Contact fields already use
  `containsToken`, which respects word boundaries; the rest of the structured
  fields use the loose one. They all use the strict one now. This is the strong
  half of the guarantee and it was weaker than the sentence describing it.
- **Decision 3 — answering a priority-1 question restores what is missing.**
  ADR-026 defines priority 1 as "content is missing from the CV; only the
  user's answer brings it back", and the answer path discards the re-verify's
  questions and refreshes only an employer and a role. So the promise was
  false, and so was the brief's own sentence: *"the answer updates the relevant
  part of the CV"*. The answer's facts go back through verify, and an item the
  new evidence supports is restored.
- **Alternatives rejected:** re-indexing paths at persist time (it survives one
  transformation and breaks at the next — read already re-sorts); forbidding
  the re-sort (the ordering is a product decision and the questions must follow
  the data, not constrain it); keeping the substring test with a longer list of
  exceptions (the project has already paid three rounds to learn what lists
  cost — ADR-023).
- **Consequences:** a schema change for the question's item binding and a
  C-006 clarification of how `path` is produced; stricter matching will drop
  entries that the loose test accepted, which is the point, and a few fixtures
  move with it.

---

## ADR-026: Question priority is what it costs to ignore it (2026-10-29, accepted)

- **Context:** C-006 serves `questions` with a priority, the editor orders by
  it, and nothing ever defined what the three values mean. A developer asked to
  make priority follow the question's reason — "1 missing, 2 unverifiable,
  3 vague" — implemented it, found it broke twenty-one assertions, and brought
  the conflict back instead of rewriting them. The conflict is real: flagged
  prose is `unverifiable` and sits at priority 1 because ADR-025 put it there,
  while an entry dropped for having no citation at all is `missing` and sits
  at 2. The stated rule does not describe the code and never did; the values
  were assigned case by case as each path was written.
- **Decision:** priority is defined by **what it costs the user to ignore the
  question**, which is the only thing a sort order can usefully mean.
  - **1 — content is missing from your CV.** A dropped entry, education,
    skill or contact field. The CV is incomplete and only the user's answer
    brings it back. Nothing else is more urgent.
  - **2 — content is present but your source does not support it.** Flagged
    prose, a kept entry whose period the facts do not state. Ignoring it means
    sending out a claim that cannot be backed.
  - **3 — content is present and vague.** The weak form of 2.
  The reason stays what it is on every path; only the number is derived, in one
  place, from this table — so the two cannot drift apart again. C-006 states
  the meanings, because a consumer sorts by them.
- **This amends ADR-025**, which put flagged prose at priority 1. That was my
  call and it was made to signal prominence, not urgency. Under this rule a
  flag is a 2: the text is still in the CV, where a dropped entry is not.
- **Alternatives rejected:** priority follows the reason (the rule nobody could
  apply, because `missing` describes both a dropped item and an uncited line
  that was kept); leaving the values ad hoc (an ordering a consumer relies on
  and no one can explain is an ordering that will be sorted wrongly).
- **Consequences:** about twenty assertions move, which is the cost of having
  never defined this; the editor's question column now puts "something is gone"
  above "something is unproven", which is the order a user would choose.

---

## ADR-025: Prose asks, structure drops — and the loop stops here (2026-10-29, accepted)

- **Context:** three adversarial rounds on one component. ADR-023 deleted a
  list of company names; ADR-024 fixed the heuristic that replaced it; the
  third attack returned fifteen more probes and the reviewer's verdict in four
  words: *the guarantee does not hold*. `eBay` and `iRobot` hide their capital
  inside the word; Japanese names have no case for `\p{Lu}` to see; `Fastly`
  is exempted by its `-ly` ending; numerals written as words are unchecked;
  possessives miss the vocabulary. And the other way: "Strong Communication
  skills" deleted, "Python 3" deleted against a fact saying "Python 3.11",
  "40 percent" deleted against "40%". Each fix spawned two findings. That is
  the signature of a wrong mechanism, not of insufficient effort — detecting
  invented entities in free prose is named-entity recognition, and it was being
  attempted with regular expressions.
- **Decision:** **prose raises questions; structure drops.**
  - **Structured fields keep the strong guarantee.** An experience entry, an
    education entry, a skill, a contact field — each is a discrete claim with
    its own cited facts, and an entity those facts do not establish still
    removes it. That is where a CV's factual assertions live, and it is where
    recombination is caught.
  - **Prose — the summary and bullet text — is never deleted.** It is checked
    best-effort, and anything the cited facts do not support raises a
    priority-1 question beside the field. The injected "decade at Stripe"
    survives as visible, flagged, unanswered text rather than as a silent
    deletion of the user's own writing.
  - The two-tier capitalisation machinery goes with it. Less code, no
    over-fire class, and no promise the implementation cannot keep.
- **Why this is not a retreat:** it is what the brief asked for. *"The AI may
  rephrase and restructure, but must not invent facts. Anything missing or
  vague becomes a question to the user, and the answer updates the relevant
  part of the CV."* The product's model is the question. We built a deleter,
  then spent three rounds fixing the damage it did to legitimate text.
- **Alternatives rejected:** a fourth round against the seven remaining probes
  (the eighth would have produced seven more; the mechanism cannot close);
  shipping ADR-024 as it stands (code carrying a guarantee its own reviewer
  says is false is worse than code with a stated limit); a model-based entity
  check (a second model's opinion is not evidence, and ADR-002 requires the
  verifier to be deterministic).
- **Amendment A (same day, from the review).** Two consequences of the rule
  that the rule itself had not reached.
  1. **An uncited bullet is prose too.** The verifier still deleted a bullet
     whose citations were empty or pointed at an unknown fact — and a bullet is
     prose, so that contradicted this ADR inside its own implementation. It is
     kept with a priority-1 question saying it cites no source. One rule and no
     exception: an exception would have to be explained in three files, and
     this ADR exists so the guarantee fits in two sentences.
  2. **A skill keeps the strong guarantee, aliases and all.** Skills are
     structured items, so an unsupported one is still removed — which means a
     draft writing "JS" against a fact saying "JavaScript" loses a true skill,
     with a question raised. No alias dictionary: this build has just paid
     three rounds to learn what a closed list costs, and a synonym table is the
     same object with a different name.
- **Consequences:** the guarantee is now stated in two sentences a reader can
  check — *every structured claim is grounded in a cited fact or it is gone;
  every unsupported phrase in prose is flagged where the user will see it* —
  and the spec says so instead of implying something stronger. The golden
  fixture for prompt injection asserts what actually matters: the injected
  instruction does not change the output's structure, and its claim arrives
  flagged.

---

## ADR-024: Two tiers for prose, and no second closed list (2026-10-29, accepted)

- **Context:** ADR-023 deleted the list of company names and the reviewer
  attacked what replaced it. Eleven probes: three silent holes and five
  over-fires. The holes — a sentence-initial invented organisation skipped
  before the vocabulary is consulted, any non-ASCII capital invisible to an
  `[A-Z]` regex, and **a second closed list, `TECHNOLOGIES`, still sitting
  beside the one we deleted**. The over-fires — "Senior Backend Developer"
  dropped on *Senior*, "since March 2019" dropped on *March*, "1000 users"
  dropped against a fact saying "1,000 users". The diagnosis is one sentence:
  the check was doing named-entity recognition with regular expressions, and a
  token-level capitalisation heuristic fails in both directions at once.
- **Decision:** stop classifying tokens as names, and grade by signal strength.
  1. **Two tiers.** An unsupported thing shaped like a proper name — a
     multi-token capitalised sequence, or an acronym — **drops** the section:
     that is the injection shape and it is unambiguous. A single ambiguous
     capitalised word **raises a question** instead. The product's own line,
     again: a lie is removed, a doubt is shown.
  2. **Unicode.** `\p{Lu}` with the `u` flag. A guarantee that holds only for
     Latin names is not a guarantee; it is a locale.
  3. **Sentence-initial tokens are checked like any other**, against the
     vocabulary. Only genuinely English words are exempt, and the stoplist
     grows month names — a language artefact, which is what that list is for.
  4. **Numbers are compared after normalising separators**, so a fact saying
     "1,000" supports a draft saying "1000". Formatting is not a claim.
  5. **Durations use the envelope of the stated periods, not their sum.** A
     real ten-year career with a gap was being rejected, and overlapping
     periods were over-accepted.
  6. **`TECHNOLOGIES` is deleted, like `COMPANIES` before it, and nothing
     replaces it.** A lowercase technology name cannot be told from ordinary
     prose by any deterministic rule, so this check does not catch one — and
     that is written down as a limit rather than faked with a list that
     catches the dozen someone thought of.
- **Alternatives rejected:** growing the stoplist until the over-fires stop
  (it would fill with proper nouns and become the thing ADR-023 deleted,
  inverted); dropping on any unsupported capitalised word (it deletes real
  summaries over *Senior* and *March*, and a product that eats the user's text
  to protect them has misunderstood the job).
- **Known limit, stated rather than hidden:** prose is checked token by token,
  so a composite can still be assembled from two facts — "Engineer at Northwind
  Payments" from one fact naming Northwind and another naming Payments. That is
  why employer, period and institution are **structured fields** with their own
  cited facts, and why recombination is caught there. Prose carries the weaker
  guarantee, and now says so.

---

## ADR-023: The facts are the vocabulary — no list of known organisations (2026-10-29, accepted)

- **Context:** the reviewer attacked ADR-022's new rule instead of reading it
  and found that `unsupportedEntity` recognises an invented organisation by
  consulting a **closed list of company names**. "Senior engineer with a decade
  at Google" is dropped because Google is on the list; "…at Stripe" is kept
  with no question at all, because Stripe is not. A product whose single claim
  is *the AI cannot add a fact you did not give it* was enforcing that claim
  only against companies somebody had thought to enumerate.
- **Decision:** the check becomes closed-world over the evidence. The allowed
  vocabulary of a generated section is **the text of its cited facts**, plus
  the target role the user supplied. A capitalised name, an acronym or a figure
  in the output that appears in neither is unsupported — whatever it is, and
  whether or not anyone has heard of it. No list of organisations is
  maintained, because any such list is a list of the inventions we happen to
  catch.
- **Alternatives rejected:** growing the list (the next unlisted company is
  always one edit away, and the failure is silent); a named-entity model (a
  second model's opinion is not evidence, and it would make the verifier
  non-deterministic, which ADR-002 forbids); accepting the gap and documenting
  it (the gap is the product).
- **Consequences:** false positives are now possible — a word the model
  capitalises that no fact contains raises a question on a field the user can
  see, which is the failure direction this project has chosen everywhere else.
  The stoplist that prevents the obvious ones (sentence-initial words, the
  target role's own terms) is small, inspectable, and about English, not about
  companies.
- **Related, decided with it:** ADR-022 Amendment A said "a number no cited
  fact holds" drops a summary. That is too blunt. A **duration** — "five
  years", "a decade" — is derived from periods the facts do state, so it is
  kept and questioned like any other derivation. A **quantified result** —
  "99% accuracy", "200 engineers" — is a claim about the world and is dropped.
  The line is the same one this project keeps drawing: an invented entity is a
  lie, a derived phrase is a question.

---

## ADR-022: A reformatted date is a question, not a deletion — and the CV has a head (2026-10-29, accepted)

- **Context:** the first end-to-end run on a real model produced a CV with
  **zero experience entries, zero education entries, no contact block and no
  summary** — from a source that plainly states two jobs, a degree, a name, an
  email, a phone and a city. The pipeline did not malfunction. Extract found
  all fifteen facts with verbatim quotes; the verifier applied ADR-013's rule —
  employer and period must co-occur in one cited fact — and the model had
  written `2019 - Present` where the source says `Since 2019`. Not a substring,
  so the entry was dropped. The same for `2016 - 2019` against "from 2016 to
  2019", and for the degree. The question it raised was exactly right: *"What
  were the exact dates of this role? The drafted dates are not in the cited
  source."* It then deleted the job it had just asked about.
- **Decision:** three changes.
  1. **The employer stays strict; the period becomes lenient.** An entry is
     kept when a cited fact names the **employer** (or the institution). A
     period the cited facts do not state is kept, marked unverified, and raises
     its question — the user is told, not silently robbed of a job. The
     anti-recombination guarantee is untouched: the entry still has to be
     established by a fact naming its employer, so the mis-pairing ADR-013
     forbade — one employer's name with another's dates — still surfaces as a
     question on a field the user can see.
  2. **Compose emits the contact block.** It never did: `compose.ts` has no
     mention of contact, so a CV could not carry a name, an email or a phone,
     while F-004 requires them and the facts for them were extracted. Contact
     fields are verified **strictly** — a wrong email is a real harm, unlike a
     reformatted date — and an unsupported field is dropped with a question.
  3. **The summary is kept with its question** rather than dropped. It is one
     editable text field, and a CV with no head is worse than a CV whose
     summary is flagged. The compose prompt also forbids derived quantities:
     the model wrote "5+ years of experience", which no fact states, and
     deriving it is the kind of invention this product exists to prevent.
- **Alternatives rejected:** normalising dates before comparing (guessing what
  "Since 2019" should become is the model's job, and a normaliser that is wrong
  is a silent fabricator); loosening the rule to "occurs in any fact" (that is
  the recombination hole ADR-013 closed, and it is not reopened here —
  the employer remains bound to the entry's own cited facts).
- **Consequences:** a verified-looking CV can now contain an unverified period,
  so the question beside it is the guarantee and the UI must keep showing it;
  the golden fixtures gain a case for a reformatted date, which is the input
  this build met on its first contact with a real model.
- **Amendment A (same day, from the review).** Two corrections, both found by
  attacking the rule rather than reading it.
  1. **A kept summary must not keep an invented entity.** The
     prompt-injection fixture went red: the injected "Senior ML engineer with a
     decade at Google" now survived behind a question, because point 3 keeps
     every failing summary. The reason for keeping it was that a CV needs a
     head and a vague phrase is not a lie — but an organisation the person
     never worked for is. So the same line as everywhere else in this ADR: an
     unsupported **entity** — an organisation, a number, a named technology
     that no cited fact holds — drops the summary; unsupported phrasing or
     derivation keeps it and raises its question.
  2. **The co-occurrence rule has a blind spot, and it is stated rather than
     papered over.** One fact reading "Acme Ltd 2019-2021 and Globex Corp
     2015-2018" lets a draft claim "Acme Ltd, 2015-2018" and pass silently,
     because both strings occur inside that single fact. This predates ADR-022
     — it is ADR-013's rule, not this one — but this ADR's claim that
     mis-pairing always surfaces was false, and the honest fix is at the other
     end: the extract stage emits **one employment fact per employer**, which
     keeps the two apart where the rule can see them. A proximity heuristic
     inside one fact was rejected: it would pass and fail on the distance
     between two strings, which is not evidence of anything.
- **Also found by the review and fixed with it:** compose now produces the
  contact block and `persist.ts` never stored one — `read.ts` reads an item
  nothing writes — so F-004 was unmet end to end and a `contact.email` question
  would have pointed at a field the CV does not have.

---

## ADR-021: The output cap and the spend budget are two numbers, and running out of budget says so (2026-10-29, accepted)

- **Context:** the first real model call this project ever made failed, and the
  failure was ours. `tokenBudgetPerCall` is one number, 4096, used for two
  unrelated jobs: it caps `max_tokens` on the request AND bounds
  `input + output` afterwards. An ordinary CV — fifteen facts, a schema, the
  instructions, and a full draft coming back — crosses 4096 on the compose
  stage every time, so the gateway cut itself off and reported
  `LLM_INVALID_OUTPUT`: "the generation service returned an unusable result".
  The service had returned a perfectly good result. Proven by raising the
  number alone: compose then succeeded, with the summary naming the target
  role, experience ordered by relevance, and every bullet citing its facts.
- **Decision:** three changes, one theme — say what you mean.
  1. **Output cap** (`max_tokens`) is its own configurable number, sized so a
     full CV fits. It bounds one response.
  2. **The spend budget is per JOB**, which is what F-010 actually asks for.
     It accumulates across the job's calls — extract, compose, and any schema
     retry — and the job fails when it is gone. C-012 gains an optional ledger
     parameter for this; the amendment is additive and a stage called without
     one behaves exactly as before.
  3. **`LLM_BUDGET_EXCEEDED` joins the C-000 enum** with its own safe message.
     Stopping on budget is not invalid output, and telling a user their CV
     failed because the model misbehaved — when the truth is that we declined
     to spend more — is the same lie ADR-018 and ADR-020 were written to stop.
- **Also:** the gateway logs its own validation message on the schema-retry
  path. It already builds `problem` — our text, never the provider's — and
  then throws it away, so nothing on the server can say WHAT was invalid. That
  is the silent catch the coding rule forbids, in the one place where it costs
  a live debugging session.
- **Alternatives rejected:** raising the single number (keeps two meanings in
  one knob, and the next person meets the same confusion); a per-call budget
  large enough for any stage (bounds nothing — the spec asks for a bound per
  job, and a runaway retry loop is exactly what per-call misses).
- **Consequences:** the enum's CHECK constraint covers the new code; the web's
  copy of the enum follows, enforced by the sync test; the budget's default is
  a configuration decision an operator can make without touching code.
- **Amendment A (same day, after review).** The first draft called the ledger
  parameter "optional, so a stage called without one behaves exactly as
  before". That was wrong in the direction that matters: before this ADR every
  call was bounded at 4096, and a call without a ledger is now bounded by
  **nothing**. The reviewer found a production caller in that state — the
  C-009 answer recompose. So: the parameter is optional in the type and
  mandatory in practice. Every production call site passes a ledger, the answer
  path gets one per answer sized like a job's, and a guard test fails any
  production call that omits it. The optional shape exists for tests, which
  genuinely do not want a bound.

---

## ADR-020: C-009's 503 carries the real code (2026-10-29, accepted)

- **Context:** writing the README against a running key-less stack showed that
  answering a question reports a missing API key as
  `503 LLM_UNAVAILABLE — try again later`. A bare `catch` in
  `core/cv/answer.ts` maps every recompose failure to that one code. "Try again
  later" is advice that cannot work: nobody will configure the key by waiting,
  and the one person who can fix it is told nothing. This is the same defect
  ADR-017 and ADR-018 closed on the job path, left open on the answer path.
- **Decision:** the status stays 503 — a recompose that cannot run does make
  the service unavailable, and C-009's status set is frozen — but the envelope
  carries the code the failure actually had: `CONFIG_MISSING`,
  `LLM_AUTH_FAILED`, `LLM_INVALID_REQUEST`, or `LLM_UNAVAILABLE` when it really
  is transient. The answer is still stored and the question still answered,
  exactly as before.
- **Alternatives rejected:** a 500 for configuration errors (it is not a fault
  in the request, and 500 is what we spent ADR-018 getting away from); leaving
  it (the status is the part a client branches on, and nothing branched wrong —
  but a human reads the message, and the message was useless).
- **Consequences:** C-009's error list names the codes rather than the one
  code; the web already renders an unknown code's message, so nothing on the
  client needs to know them first.

---

## ADR-019: The test suite gets its own database (2026-10-29, accepted)

- **Context:** the suite and the running dev stack share one database, and the
  bill for that has now come in four times. E-002: two suites' workers stealing
  each other's queued jobs. E-004: a suite leaking fifty rows for the next
  suite's worker to drain, which cost a day disguised as a flake. E-005: a
  cleanup heuristic deleting 54 rows it had not created. And now, since T-28
  made the api actually start a worker, the **running container** competes with
  the suite for queued jobs — `runOnce()` returns null because the stack
  claimed the row first. Each was fixed individually: a suite lock, a leak
  guard, a cleanup rule. They are one defect wearing four hats.
- **Decision:** `npm test` and the gate run against their own database
  (`ai_cv_builder_test`), created and migrated by the gate, never the one
  `docker compose up` serves. The suite lock, the leak guard and the delete-by-id
  rule all stay — they are still right when two suites run in parallel — but
  they stop being the only thing standing between a test run and a developer's
  running app.
- **Alternatives rejected:** a flag that disables the container's worker during
  tests (the dev stack needs its worker, and the flag is one more thing to
  remember — the same class of fix that has already failed three times here);
  running the suite only with the stack down (turns a shared machine into a
  mutex and does not survive CI or a second developer); schema-per-run (more
  machinery than a second database, for the same effect).
- **Consequences:** the gate's database step creates and migrates the test
  database as well; `DATABASE_URL` for a bare `vitest` run points there, and
  the smoke suite still uses the real stack, because its whole subject is the
  stack. Tests stop seeing the fixtures of an app someone is clicking through,
  which is also why QA's seeded CV will no longer appear in a test run.

---

## ADR-018: The error enum gains the two provider failures F-010 asks to distinguish (2026-10-29, accepted)

- **Context:** reviewing ADR-017's implementation, the reviewer noticed that
  `gateway.ts` classifies a provider auth failure as `LLM_AUTH_FAILED` and a
  rejected request as `LLM_INVALID_REQUEST`, and that neither is in the closed
  C-000 enum — so both collapse to `INTERNAL` by the time they reach a job row
  or a CV. F-010 asks for exactly the opposite: "invalid-request and auth
  errors fail the job immediately with a **distinct code**".
- **Decision:** `LLM_AUTH_FAILED` and `LLM_INVALID_REQUEST` join `ERROR_CODES`
  with their own fixed safe messages. `INTERNAL` goes back to meaning what it
  should mean — a fault on our side — instead of covering a mis-set API key,
  which is the owner's to fix and is the single most likely failure in a fresh
  deployment.
- **Alternatives rejected:** leaving them as INTERNAL (loses the distinction
  the spec names, and makes a configuration problem look like a bug); mapping
  them both onto `CONFIG_MISSING` (an invalid request is not a missing key, and
  a wrong key is not an absent one).
- **Consequences:** adding codes to a closed enum is additive — a client that
  does not know a code still renders its `message`, which is why the envelope
  carries both. The gateway's internal codes and the contract's enum are now
  the same list, so the next one that diverges is a compile error rather than
  a silent downgrade.

---

## ADR-017: A failed CV carries its own error, not a job id to go fetch (2026-10-29, accepted)

- **Context:** QA-10 left the CV in `generating` forever when its job failed;
  that is fixed, the CV now reaches `failed`. But C-006 carries no error, and
  the job's code is reachable only through C-005 `GET /api/jobs/:jobId` — and
  C-006 does not carry a job id either. So the editor can say a CV failed and
  cannot say why, on the most ordinary failure there is: no API key.
- **Decision:** a CV in state `failed` carries `lastError: { code, message }`
  in C-006, mirroring the terminal job row. `code` is from the closed C-000
  enum; `message` is the fixed safe string that already belongs to that code —
  never a provider, driver or parser message, and never prompt content
  (rules/security.md, F-010). The field is absent for any other state. The web
  shows it with the retry the user actually has, which is regenerate (C-010).
- **Alternatives rejected:** exposing `lastJobId` and letting the browser fetch
  C-005 (two round trips to render one line, and it leaks job identity into a
  document contract); a generic "generation failed, try again" with no code
  (the distinction the user needs is exactly the one it throws away — a
  missing key is the owner's problem to fix, a bad source text is theirs).
- **Consequences:** C-006 gains an optional field, so existing consumers are
  unaffected; the read model reads the CV's own columns, not a join to the job
  table, because a CV outlives its jobs.

---

## ADR-016: A question's path names the field it is about (2026-10-29, accepted)

- **Context:** QA-05. The verifier emitted question paths `summary` and
  `skills[i]`, and the web editor aligns a question to the field its path names
  (`summary.text`, `skills[i].name`). Two lanes had each picked a reasonable
  grammar, and the contract never wrote one down. Two of three questions on the
  seeded CV landed beside the wrong fields or six thousand pixels down on mobile.
- **Decision:** a question's `path` names the FIELD the question is about, because
  that is what the question asks ("which period?" is about the period). C-006 now
  states the grammar and its examples. Whole-entry drops with no citation or an
  unknown citation are questioned on `experience[i].employer` and
  `education[i].institution`, the identifying fields. `DroppedItem.path` keeps its
  item-level spelling; only question paths change. The co-occurrence rule,
  inheritance and determinism are unchanged.
- **Alternatives rejected:** A — make the web accept item-level paths and infer
  the field (pushes the grammar into the editor and forks it per consumer); B —
  change `DroppedItem.path` too (no reader needs it changed and it would widen the
  diff beyond QA-05).
- **Consequences:** golden fixtures `first-person` and `prompt-injection` moved
  with the verifier. Any future question kind must name a field from the C-006
  grammar; the mixed-draft test in `verify.question-paths.test.ts` enforces it.

## ADR-015: Answering a question bumps the CV's version (2026-10-29, accepted)

- **Context:** C-009 says the answer response is the full C-006 shape and that
  "only the section owning the question's path may differ; everything else is
  unchanged". The implementation bumps the top-level `version`, and the
  reviewer stopped the lane to ask whether that violates a frozen contract.
- **Decision:** it bumps, and C-009 now says so. `version` is not content — it
  is the optimistic-concurrency token of C-008. A CV whose section changed
  while its version stayed still is a CV an editor can overwrite with stale
  data: the browser holding version N would PATCH that same section and get
  200 instead of the 409 C-008 exists to produce. The contract's "unchanged"
  is about what the user wrote and what the generator wrote, not about the
  token that protects them. The same holds for regenerate (C-010).
- **Alternatives rejected:** leaving the version still (re-introduces exactly
  the lost update C-008 prevents, and silently); returning a separate
  `answerVersion` (two tokens for one document, and every client has to learn
  which one PATCH checks).
- **Consequences:** a contract test pins the bump, so the next implementation
  cannot quietly drop it; the web editor must take the version from the answer
  response, which T-27 already does by replacing the section from the server
  copy.

---

## ADR-014: The job-queue suite lock becomes a helper, not a convention (2026-10-28, accepted)

- **Context:** `claimNext` is global by design (ADR-004: one queue table,
  `SKIP LOCKED`), so any test file that commits a non-terminal
  `generation_jobs` row can have it stolen by another file's worker running in
  parallel. Four suites avoid this today by remembering to take the advisory
  lock in `api/src/core/jobs/test-lock.ts`. A convention a cheap model must
  remember is a convention that will be forgotten, and the failure does not
  surface in the lane gate — only in the union, at integration, where it reads
  as a flake (E-002).
- **Decision:** enqueueing a non-terminal job from a test goes through a helper
  in the same module, which takes the suite lock itself; a guard test fails any
  test file that writes such a row without it. Measured first, assumed nothing:
  turning off file parallelism for `api` costs **12.5s against 4.0s**, and the
  gate is the hottest loop in the project — every agent runs it at every turn
  end — so that tax would land hundreds of times per wave.
- **Alternatives rejected:** disabling api file parallelism (3× on the hottest
  loop, for a hazard that affects four files); a separate serial vitest project
  (moves the convention from "remember to call the lock" to "remember to list
  the file" — same class of defect, new place to forget it); leaving it as
  documentation (it already was documentation, and E-002 still happened).
- **Consequences:** the helper's module path and the `acquireJobSuiteLock`
  export stay stable, because other lanes' tests import them; the guard is a
  grep-shaped assertion over test sources, so it also catches the next suite
  that hand-rolls an INSERT. Implemented as T-25 (CVB-28).

---

## ADR-011: Six parallel lanes in one wave; no worktrees (2026-10-28, accepted)

- **Context:** the owner asked to go faster by adding teams. Three sequential
  sprints would have cost roughly six more hours of wall-clock, most of it
  spent waiting on lanes that have no dependency on each other.
- **Decision:** collapse sprints 2 and 3 into **two waves** inside SPRINT-001.
  Wave A runs **six** lanes in parallel after a three-task blocking
  foundation; wave B runs the four tasks that genuinely depend on wave A's
  output. The playbook's "≤3 lanes unless the Integrator budget is raised on
  purpose" is raised here on purpose, and this ADR is that purpose.
- **Alternatives rejected:** git worktrees per lane — the tool isolates a
  *single agent*, and a lane is three agents (test-engineer → developer →
  reviewer) that must share one tree, so the developer would not see the
  tests. Worktrees are therefore unavailable at lane granularity, which means
  lane isolation has to be bought with strictly disjoint file areas instead.
  Also rejected: running sprints 1 and 2 as two concurrent runners (two
  runners editing one tree with no shared dependency graph).
- **Consequences:** (1) every lane owns a disjoint path set, enforced by
  `check-lane.sh`; (2) the only shared files — `api/src/server.ts` and the
  cross-lane TypeScript interfaces — are created up front by foundation task
  T-07, so no lane ever edits a file another lane owns; (3) wall-clock is now
  set by the one chain that cannot be parallelised: gateway → extract →
  compose → verifier; (4) the Integrator merges six lanes instead of three,
  but against disjoint paths, so the cost moves from conflict resolution to
  running the union of tests after each merge.

## ADR-010: The dependency list must include the toolchain (2026-10-28, accepted; the Node/@types/node pin superseded by ADR-012)

- **Context:** `architecture.md` §1 listed only runtime libraries. The
  scaffold task therefore had no linter, no DOM test environment and no web
  bundler available, and — forbidden from adding dependencies — substituted
  `tsc` with extra flags for `lint`, ran web tests in a Node environment, and
  made the web "build" a type-check. The reviewer caught all three.
- **Decision:** ESLint + typescript-eslint, `happy-dom`, `@vitejs/plugin-react`
  and an exact `@types/node` are first-class entries in §1. (The version named
  here was 22.x; ADR-012 moved the project to Node 24 and the pin with it. The
  principle is what this ADR decides; the number lives in architecture.md §1
  and in the toolchain test, which T-24 realigned.) `lint` in
  `gate.config.sh` means a real linter.
- **Alternatives rejected:** keeping `tsc --noUnusedLocals` as "lint" (it
  passes style and correctness rules silently, so the gate would be green on
  code no linter would accept); jsdom (heavier, nothing here needs it).
- **Consequences:** a "no new dependencies" rule is only safe when the
  approved list is complete — an incomplete list does not prevent improvisation,
  it forces it. The Architect owns that completeness.

## ADR-009: Jira is virtual, and the Orchestrator commits (2026-10-28, accepted)

- **Context:** the owner has no Atlassian instance for this task and asked for
  the tracker to be imagined. Separately,
  `framework/process/task-lifecycle.md` makes pushing the owner's act and
  forbids agents from committing — a rule written for a team working against a
  shared remote, which does not fit a single-person test task where the
  deliverable is explicitly "a repository with a readable commit history".
- **Decision:** (1) the tracker is `framework/sprints/board.md`, key `CVB`,
  maintained by the Orchestrator with the same honesty rule as a real mirror —
  a status may never be ahead of local reality; (2) the Orchestrator commits,
  one commit per completed task, after the gate is green and the review is
  approved. Sub-agents still never commit: they write code and lane reports,
  the Orchestrator turns a finished task into a commit. Nothing is pushed
  anywhere until the owner says so.
- **Alternatives rejected:** letting each lane agent commit (an unreadable
  history of half-tasks, and merge order stops being the Integrator's
  decision); one commit per sprint (hides the TDD loop that the history is
  supposed to show); a real Jira (nothing to connect to).
- **Consequences:** the staging half of `task-lifecycle.md` does not apply —
  there is no deployment, so `Ready for test` means "merged and green" and QA
  runs locally against `docker compose up`. The `jira:` line in lane reports
  refers to a `CVB-N` row in `board.md`. Commit messages carry the issue key
  and say what changed; no hashes are quoted in reports.

## ADR-008: Framework ceremony is trimmed to three sprints, QA once per UI sprint (2026-10-28, accepted)

- **Context:** the framework is built for long-lived products; this is a test
  task with a 10-hour human reference budget. Full ceremony (discovery, PO,
  skeptic, per-sprint retro) would cost more than the build.
- **Decision:** skip `/discovery` and `framework/docs/product/` except
  `assumptions.md`; one designer pass for tokens; three sprints of ≤3 lanes;
  manual QA after sprints 2 and 3 only; one `/retro` at the end.
  Everything else — tests-first, gate.sh, docs-sync, ADRs, lane isolation —
  stays, because those are what the evaluation actually looks at.
- **Alternatives rejected:** full ceremony (process cost ≈ build cost);
  `/implement-feature` with no sprints at all (loses lane parallelism and the
  written record that demonstrates ownership of AI-generated code).
- **Consequences:** `framework/docs/product/vision.md`, `competitors.md` and
  `feature-map.md` stay as template stubs on purpose — a reader should not
  mistake them for abandoned work; this ADR is the reason.

## ADR-007: Session cookie, not a JWT (2026-10-28, accepted)

- **Context:** F-001 needs login that survives reloads and works from any
  device; the brief rules out OAuth and password reset.
- **Decision:** opaque random session id in an `httpOnly`, `SameSite=Lax`
  cookie; the hash of the id is stored in `sessions` with an expiry; logout
  deletes the row.
- **Alternatives rejected:** JWT in `localStorage` (XSS-readable, and the
  "log out everywhere" story becomes a revocation list anyway); JWT in a
  cookie (same cookie work, plus key management, for no gain at this size).
- **Consequences:** one extra DB read per authenticated request — irrelevant
  locally; revocation is a `DELETE`.

## ADR-006: Anthropic calls use tool-use with strict schemas, and output is treated as untrusted (2026-10-28, accepted)

- **Context:** the brief evaluates handling of untrusted input "including LLM
  output". Free-text parsing of model responses is the classic failure.
- **Decision:** both LLM stages use the Anthropic SDK's tool-use with an
  explicit input schema and `tool_choice` forcing that tool; the response is
  then re-validated in code against the same schema (never trusting that the
  provider enforced it). One retry with the validation error appended, then
  the job fails. Model id lives in config (`ANTHROPIC_MODEL`, default Sonnet
  5.5), so swapping models is not a code change.
- **Alternatives rejected:** "respond in JSON" prompting + `JSON.parse` (breaks
  on prose preambles and markdown fences); streaming partial parse (complexity
  with no user-visible gain, since the UI shows stages, not tokens).
- **Consequences:** schemas are duplicated as a single source (zod → JSON
  Schema) shared by the tool definition, the validator and the TS types.

## ADR-005: Server-side PDF via @react-pdf/renderer, not headless Chrome (2026-10-28, accepted)

- **Context:** F-007 demands A4 with selectable text, and the image must stay
  small enough that `docker compose up` on a clean machine is quick.
- **Decision:** render with `@react-pdf/renderer` in the api process; embed a
  Unicode-capable font (DejaVu/Noto subset) so Cyrillic and diacritics work.
- **Alternatives rejected:** Puppeteer/Chromium (≈400 MB in the image, slow
  cold start, fonts still need solving); client-side jsPDF with `html2canvas`
  (produces a raster — fails the selectable-text criterion outright);
  server-side LaTeX (absurd dependency for one template).
- **Consequences:** the CV template is React components with a constrained
  style subset, not HTML/CSS; pagination is the library's, which is why F-007
  tests for clipping explicitly.

## ADR-004: Postgres is the queue — SELECT … FOR UPDATE SKIP LOCKED (2026-10-28, accepted)

- **Context:** F-003 needs durable, reload-proof background work, and the
  constraint list allows no Redis or broker.
- **Decision:** `generation_jobs` table; an in-process worker loop leases rows
  with `FOR UPDATE SKIP LOCKED`, writes a `leased_until`, and renews it; a
  lease that expires is reclaimed and retried once.
- **Alternatives rejected:** BullMQ/Redis (new infra service, forbidden by the
  constraint list); in-memory `setTimeout` (a restart loses the job — exactly
  the failure F-003 exists to prevent); doing it in the request (the brief
  names the frozen screen as a failure).
- **Consequences:** one worker per api container; scaling out is possible but
  unneeded. The lease logic needs its own tests (dead-worker reclaim).

## ADR-003: Job state lives in the database, the browser polls (2026-10-28, accepted)

- **Context:** "reloading the page must not lose the work in progress".
- **Decision:** the job row is the only state; `GET /api/jobs/:id` returns
  status + a named stage; the SPA polls every 2 s with TanStack Query and
  rebuilds the progress view from the server on mount.
- **Alternatives rejected:** WebSockets/SSE (a connection to manage, and a
  reload still has to re-fetch state — so the server-state path must exist
  anyway; SSE may be layered on later for latency, never as the source of
  truth); `localStorage` progress (lies after a restart, invisible to a
  second device).
- **Consequences:** progress is coarse (3 named stages, no percentage) — which
  is also the honest thing to show.

## ADR-013: CvDraft entries and education carry factIds; amendment A is superseded (2026-10-28, accepted)

- **Context:** T-12 could not implement the §3.4 entity rule, and its developer
  diagnosed why correctly: `CvDraft` (frozen by T-07) gives `factIds` to
  summary, bullets and skills, but not to experience entries or education, so
  "occurs in one of its **cited** facts" has no referent for an employer or a
  period. The developer then wrote itself an amendment relaxing the rule for
  those fields to "occurs in *some* extracted fact", pinned the resulting hole
  with an honest test, and marked the amendment accepted on its own authority.
- **Decision:** the diagnosis is accepted, the resolution is not. The relaxed
  rule permits **mis-pairing**: facts "Intern at Acme Ltd, 2015–2017" and
  "Backend engineer at Globex, 2019" would accept the entry
  `{Acme Ltd, Backend engineer, 2019}` — every token real, the combination
  invented. That is exactly the failure this product exists to prevent, and it
  is the kind an interviewer catches. So the contract changes instead:
  `CvDraft.experience[]` and `CvDraft.education[]` each gain
  `factIds: string[]`, the compose stage must cite them, and the verifier
  checks entry fields against the entry's own facts, with the one level of
  parent→child inheritance from the ADR-002 amendment.
- **Alternatives rejected:** keep amendment A (ships the mis-pairing hole as
  the product's behaviour, and a test would enshrine it); drop the entity rule
  for entries entirely (an employer could then be pure invention); infer the
  entry's facts from its bullets' citations (an entry with no bullets has
  none, and bullets do not cite the employer — that is the bug that started
  this).
- **Amended 2026-10-28, same day, before any of it shipped:** per-field
  checking over a *set* of cited facts does not close the hole it was written
  to close. T-12's developer demonstrated it: cite f1 and f2 on one entry and
  employer, role and period each occur in *a* cited fact, so
  `{Acme Ltd, Backend engineer, 2019}` is accepted again. Recombination is
  defeated by **co-occurrence**, not by citation — which is the whole reason
  facts are atomic in the first place:
  - **Experience entry:** at least one cited fact must contain **both** the
    employer and the period. No such fact → drop the entry, priority-1
    question. This is the binding claim; everything else about a job hangs
    off "this employer, during this time".
  - **Role:** must occur in a cited fact that also names the employer; if it
    occurs only in a fact that does not, the entry is **kept** and a vague
    question is raised. A source often names the employer and the title in
    separate sentences ("Globex, 2019–2022" / "I was a backend engineer
    there"), and dropping a real job over that costs more than asking.
  - **Education entry:** at least one cited fact must contain both the
    institution and the period, same failure direction.
  The developer stopped and asked rather than inventing this rule, which is
  the behaviour FF-11's `blockedOn` field was added to make cheap.
- **Consequences:** C-012 is unfrozen for this one change and refrozen; T-11
  (compose) and T-12 (verify) reopen, and T-11 runs first because T-12 reads
  what it emits. The prompt-injection golden fixture must cite its entry's
  facts. Amendment A is **superseded** and its pinned mis-pairing test is
  replaced by one asserting the pairing is now rejected. A free lesson kept
  from it: a brief that needs a rule the frozen types cannot express is an
  architect decision, not a development task — see FF-11.

## ADR-012: Node 24 LTS, and argon2id comes from the standard library (2026-10-28, accepted)

- **Context:** T-03 implemented argon2id with `node:crypto.argon2`, which
  exists from Node 24.7. The project pinned Node 22 in `.nvmrc`, the api
  Dockerfile and both `engines` fields, so registration answers 500 inside the
  container while passing locally on this machine's Node 24.18 — the worst
  shape of bug, green in development and broken in the artifact.
- **Decision:** move the project to Node 24 LTS everywhere: `.nvmrc`,
  `api/Dockerfile`, `web/Dockerfile`, both `engines`, CI, and
  `architecture.md` §1. `@types/node` tracks it.
- **Alternatives rejected:** add `@node-rs/argon2` (a native dependency with
  install scripts, to replace something the standard library already provides
  — and §1 has now been found incomplete three times, so the cheapest
  dependency is the one not added); weaken the hash to scrypt or bcrypt
  (spec F-001 says argon2id, and ADR-007 chose it deliberately).
- **Consequences:** the container and this machine run the same major version,
  which is also what made the discrepancy invisible until review. T-03 carries
  the bump, and its allowlist widens to the files that pin the version.

## ADR-002: Groundedness is a three-stage pipeline with a deterministic verifier (2026-10-28, accepted)

- **Context:** "The AI may rephrase and restructure, but must not invent
  facts." This is the product's core promise and the main evaluation criterion.
  A prompt that says "do not invent" is unverifiable and therefore worthless as
  an engineering answer.
- **Decision:** (1) **extract**: the model turns the source into atomic facts,
  each carrying the verbatim `sourceQuote` it came from; (2) **compose**: a
  second call builds the CV from the *fact list only* — it never receives the
  source text, so it has nothing to embroider; every item cites `factIds`;
  (3) **verify**: ordinary code checks that each item's cited facts exist and
  that every organisation, date, number and named technology in the item's text
  occurs in one of those facts. Failures are dropped and become questions
  (F-005). The user can see the source quote behind any line.
- **Alternatives rejected:** a single "write a CV from this, don't lie" call
  (nothing to check against); LLM-as-judge over the output (a second model's
  opinion is not evidence, and it doubles cost for a weaker guarantee — it may
  be added later as a *signal*, never as the gate); RAG/embedding similarity
  (approximate where an exact check is available).
- **Amended 2026-10-28 (T-12):** the check is per *item tree*, not per item.
  A bullet is verified against its own cited facts plus its parent experience
  entry's; the entry's employer and period must be covered by the entry's own
  facts. The first implementation dropped a true bullet ("Served about 200
  customers a day") because the employer and period it sat under were cited by
  its parent and not by itself. Dropping a true statement is a failure of the
  verifier in the expensive direction — it costs the user a real line and
  raises a pointless question — so the rule gained one level of inheritance,
  parent → child only.
- **Consequences:** two LLM calls per generation instead of one, so latency and
  cost roughly double — accepted, this is the feature. The verifier is the most
  test-dense module in the project and owns the adversarial golden fixtures.
  A legitimate rephrasing that the verifier cannot match degrades to a question
  rather than to a silent invention — the right direction to fail in.

## ADR-001: Project adopts ai-dev-framework as-is (2026-10-28, accepted)

- **Context:** the task is built by an orchestrated agent team; the framework
  template was copied into this repo on 2026-10-28.
- **Decision:** `CLAUDE.md` router, docs as source of truth, `gate.sh` as the
  single definition of green, model routing per
  `framework/process/model-routing.md`, sprints with disjoint lanes.
- **Alternatives rejected:** ad-hoc prompting (no record of decisions — and the
  brief explicitly evaluates whether the author can own AI-generated code).
- **Consequences:** `framework/scripts/gate.config.sh` must be filled before
  any lane runs, otherwise nothing is enforced; docs are updated in the same
  change as code.
