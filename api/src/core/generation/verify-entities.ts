// Deterministic entity check for the verifier (spec §3.4, ADR-023, ADR-024). No NLP, no LLM, no list of known names:
// the vocabulary is the text of the cited facts. Two tiers: an unsupported multi-token capitalised sequence or an
// acronym DROPS (unsupportedEntity); a single ambiguous capitalised word raises a QUESTION (ambiguousName).
// KNOWN LIMIT (ADR-024): a lowercase technology name ("kotlin", "built services in rust") cannot be told from prose by
// any deterministic rule, so this check does NOT claim to catch one. There is deliberately no technology list.

const LEGAL_SUFFIX = /((?:\p{Lu}[\p{L}\p{N}_&'.-]*\s+){0,2}\p{Lu}[\p{L}\p{N}_&'.-]*)\s+(Ltd|Inc|Corp|LLC|GmbH|PLC|Limited|Corporation)\b\.?/gu;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Unicode-aware word boundaries: \w is ASCII-only and would make every non-Latin name invisible.
const wholeWord = (term: string, flags: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(term)}(?![\\p{L}\\p{N}_])`, `${flags}u`);

// Dashes (incl. en/em) are hyphens; whitespace collapses; comparison is case-insensitive.
export const normalize = (s: string): string =>
  s.replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

export const containsText = (haystack: string, needle: string): boolean => {
  const n = normalize(needle);
  return n.length > 0 && normalize(haystack).includes(n);
};

// A period is one token: "2017-2019" is not supported by facts that mention 2017 and 2019 separately.
export const containsPeriod = (haystack: string, period: string): boolean => {
  const p = normalize(period).replace(/\s*-\s*/g, '-');
  if (p.length === 0) return false;
  const h = normalize(haystack).replace(/\s*-\s*/g, '-');
  return new RegExp(`(?<!\\d)${escapeRegExp(p)}(?!\\d)`).test(h);
};

// Formatting is not a claim: "1,000" and "1000" are the same figure.
const normaliseNumber = (t: string): string => (/^\d{1,3}(?:,\d{3})+/.test(t) ? t.replace(/,(?=\d{3})/g, '') : t);

const numberTokens = (text: string): string[] =>
  (text.match(/\d+(?:[.,]\d+)*(?:\s*%)?/g) ?? []).map((t) => normaliseNumber(t.replace(/\s+/g, '')));

// STOPLIST (ADR-023 point 2, ADR-024 point 3). It is about English, not about the world: words capitalised for a
// reason of the language, carrying no claim. If a proper noun ever lands here, this list has become the COMPANIES
// list ADR-023 deleted.
const ENGLISH_STOPLIST: ReadonlySet<string> = new Set([
  'I', 'CV',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
]);

// A sentence-initial word is checked against the vocabulary like any other; only a word that is plainly English is
// exempt: a function word, an irregular verb a CV opens with, or an ASCII word with a regular English ending.
const ENGLISH_OPENERS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'with', 'at', 'in', 'on', 'for', 'to', 'of', 'by', 'from', 'as', 'my', 'our',
  'we', 'he', 'she', 'it', 'they', 'this', 'that', 'these', 'those', 'who', 'while', 'when', 'where', 'also', 'both',
  'built', 'led', 'ran', 'wrote', 'drove', 'grew', 'made', 'taught', 'won', 'cut', 'set', 'got', 'took', 'gave',
  'brought', 'began', 'kept', 'sold', 'spoke', 'wrote', 'drew', 'held', 'put', 'shaped', 'owned',
]);
const ENGLISH_SHAPE = /^[A-Z][a-z]+(?:ed|ing|ly|ful|ous|ive|able)$/;
const isEnglishOpener = (tok: string): boolean => ENGLISH_OPENERS.has(tok.toLowerCase()) || ENGLISH_SHAPE.test(tok);

const ACRONYM = /^\p{Lu}[\p{Lu}\p{N}]+$/u;

interface NameRun {
  tokens: string[];
  // True when the run stands where an organisation stands ("at X", "for X", "@ X", "joined X"): that position is a
  // claim of employment, not ambiguity, so a single unsupported word there still DROPS ("a decade at Stripe").
  employer: boolean;
}

const EMPLOYER_POSITION = /(?:^|[\s(])(?:at|for|joined|@)\s*$/i;

// Capitalised tokens of `text` that are not supported by `vocabulary`, grouped into runs of adjacent tokens. A hyphen
// separates parts ("Stripe-backed" -> "Stripe"). Sentence-initial tokens are checked, not skipped.
function unsupportedRuns(text: string, vocabulary: string): { runs: NameRun[]; acronym: string | null } {
  const runs: NameRun[] = [];
  let acronym: string | null = null;
  let current: NameRun | null = null;
  let prevEnd = -1;
  for (const m of text.matchAll(/(?<![\p{L}\p{N}_])\p{Lu}[\p{L}\p{N}_&']*(?:\.[\p{L}\p{N}_]+)*/gu)) {
    const tok = m[0];
    const idx = m.index ?? 0;
    const gap = prevEnd < 0 ? '' : text.slice(prevEnd, idx);
    prevEnd = idx + tok.length;
    if (!/^[ \t]+$/.test(gap)) current = null;
    if (ENGLISH_STOPLIST.has(tok)) {
      current = null;
      continue;
    }
    const before = text.slice(0, idx).trimEnd();
    const sentenceInitial = before === '' || /[.!?:;\n]$/.test(before);
    const isAcronym = ACRONYM.test(tok);
    if (sentenceInitial && !isAcronym && isEnglishOpener(tok)) {
      current = null;
      continue;
    }
    if (wholeWord(tok, 'i').test(vocabulary)) {
      current = null;
      continue;
    }
    if (isAcronym) acronym ??= tok;
    if (current === null) {
      current = { tokens: [], employer: EMPLOYER_POSITION.test(before) };
      runs.push(current);
    }
    current.tokens.push(tok);
  }
  return { runs, acronym };
}

// --- Durations vs quantified results (ADR-023 closing section) ---------------------------------------------------
// A DURATION ("five years", "a decade", "3 months") is derived from the periods facts state: kept and questioned.
// A QUANTIFIED RESULT ("99% accuracy", "200 engineers") is a claim about the world: it is just a number, and it is
// dropped unless a cited fact holds it. durationClaims() finds the first kind; everything else stays a number.

const WORD_NUMBERS: Record<string, number> = {
  a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};
const NUMBER_WORD = Object.keys(WORD_NUMBERS).join('|');
const DURATION = new RegExp(
  `(?<![\\w.])(?:(\\d+)\\+?|(${NUMBER_WORD}))\\s*(years?|yrs?|months?|decades?)(?!\\w)|(?<!\\w)(a|one)\\s+(decade)(?!\\w)`,
  'gi',
);

export interface DurationClaim {
  phrase: string;
  years: number;
}

export function durationClaims(text: string): DurationClaim[] {
  const claims: DurationClaim[] = [];
  for (const m of text.matchAll(DURATION)) {
    const n = m[1] !== undefined ? Number(m[1]) : WORD_NUMBERS[(m[2] ?? m[4]).toLowerCase()];
    const unit = (m[3] ?? m[5]).toLowerCase();
    // "in a year" / "a month" is idiom, not a claimed career length; only "a decade" is a claim.
    if (n === 1 && (m[2] ?? m[4])?.toLowerCase() === 'a' && !unit.startsWith('decade')) continue;
    const years = unit.startsWith('decade') ? n * 10 : unit.startsWith('m') ? n / 12 : n;
    claims.push({ phrase: m[0], years });
  }
  return claims;
}

// Years the facts' periods span, as the ENVELOPE (earliest start to latest end), not the sum (ADR-024): a career
// with a gap is not shortened and overlapping periods are not counted twice. `open` means a period has no end
// ("Since 2019", "2019 - Present"); with no clock (ADR-002) its length cannot be computed, so any claim is derivable
// from it. `null` = no period is stated.
function statedSpan(cited: string): { years: number; open: boolean } | null {
  let start = Infinity;
  let end = -Infinity;
  let found = false;
  let open = false;
  for (const m of cited.matchAll(/(?<!\d)((?:19|20)\d\d)\s*[-‐-―]\s*((?:19|20)\d\d|present|now|current)/gi)) {
    found = true;
    start = Math.min(start, Number(m[1]));
    if (/^\d/.test(m[2])) end = Math.max(end, Number(m[2]));
    else open = true;
  }
  if (/\bsince\s+(?:19|20)\d\d\b/i.test(cited)) {
    found = true;
    open = true;
  }
  return found ? { years: end > start ? end - start : 0, open } : null;
}

// A duration is supported when a cited fact says it verbatim, or the stated periods are long enough to derive it.
function durationSupported(c: DurationClaim, cited: string): boolean {
  if (containsText(cited, c.phrase)) return true;
  const span = statedSpan(cited);
  if (span === null) return false;
  return span.open || c.years <= span.years + 1;
}

// A derived duration present in `text` and held by no fact verbatim: kept, and the caller asks about it.
export function hasDerivedDuration(text: string, citedTexts: readonly string[]): boolean {
  const cited = citedTexts.join('\n');
  return durationClaims(text).some((c) => !containsText(cited, c.phrase) && durationSupported(c, cited));
}

// Returns the first entity in `text` that nothing supports, or null. The vocabulary is the cited facts' text plus
// `allowed` (the target role the user supplied): ADR-023, closed world, no list of known organisations.
export function unsupportedEntity(text: string, citedTexts: readonly string[], allowed: readonly string[] = []): string | null {
  const cited = citedTexts.join('\n');
  const vocabulary = [cited, ...allowed].join('\n');

  let rest = text;
  let badDuration: string | null = null;
  for (const c of durationClaims(text)) {
    if (!durationSupported(c, cited)) badDuration ??= `duration "${c.phrase}"`;
    rest = rest.replace(c.phrase, ' ');
  }

  const citedNumbers = new Set(numberTokens(cited));
  for (const n of numberTokens(rest)) {
    if (!citedNumbers.has(n)) return `number "${n}"`;
  }

  for (const m of rest.matchAll(LEGAL_SUFFIX)) {
    const words = m[1].split(/\s+/);
    const supported = words.some((_, k) =>
      containsText(vocabulary, [...words.slice(k), m[2]].join(' ')),
    );
    if (!supported) return `organisation "${m[0].trim()}"`;
  }

  // Tier 1 (drop): an acronym, or a run of two or more adjacent unsupported capitalised tokens: the injection shape.
  const { runs, acronym } = unsupportedRuns(rest, vocabulary);
  if (acronym !== null) return `name "${acronym}"`;
  const multi = runs.find((r) => r.tokens.length >= 2 || r.employer);
  if (multi !== undefined) return `name "${multi.tokens.join(' ')}"`;

  return badDuration;
}

// Tier 2 (question): a single unsupported capitalised word is ambiguous: an invented employer, or just "Senior" or
// "Remote". The caller keeps the text and asks. Call after unsupportedEntity() returned null.
export function ambiguousName(text: string, citedTexts: readonly string[], allowed: readonly string[] = []): string | null {
  const vocabulary = [citedTexts.join('\n'), ...allowed].join('\n');
  let rest = text;
  for (const c of durationClaims(text)) rest = rest.replace(c.phrase, ' ');
  const single = unsupportedRuns(rest, vocabulary).runs.find((r) => !r.employer);
  return single === undefined ? null : `name "${single.tokens[0]}"`;
}

// Contact values are matched as whole tokens (ADR-022): "jane@example.co" is not in "jane@example.com" and a
// truncated phone number is not in the full one. A trailing sentence period is allowed; ".com" is not.
export const containsToken = (haystack: string, value: string): boolean => {
  const v = normalize(value);
  if (v.length === 0) return false;
  return new RegExp(`(?<![\\w@])${escapeRegExp(v)}(?![\\w@]|\\.\\w)`).test(normalize(haystack));
};
