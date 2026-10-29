// Deterministic entity check for the verifier (spec §3.4, ADR-023). No NLP, no LLM: the vocabulary is the text of the
// cited facts, so an unknown name is never mistaken for a grounded one. TECHNOLOGIES below only normalises case.

const TECHNOLOGIES = [
  'Kafka', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'RabbitMQ', 'GraphQL',
  'Kubernetes', 'Docker', 'Terraform', 'AWS', 'Azure', 'GCP', 'Java', 'JavaScript', 'TypeScript',
  'Python', 'Rust', 'React', 'Node.js', 'Django',
];

// "Go" is matched case-sensitively so the verb "go" is not read as a technology.
const CASE_SENSITIVE_TECHNOLOGIES = ['Go'];

const LEGAL_SUFFIX = /((?:[A-Z][\w&'.-]*\s+){0,2}[A-Z][\w&'.-]*)\s+(Ltd|Inc|Corp|LLC|GmbH|PLC|Limited|Corporation)\b\.?/g;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wholeWord = (term: string, flags: string): RegExp =>
  new RegExp(`(?<!\\w)${escapeRegExp(term)}(?!\\w)`, flags);

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

const numberTokens = (text: string): string[] =>
  (text.match(/\d+(?:[.,]\d+)*(?:\s*%)?/g) ?? []).map((t) => t.replace(/\s+/g, ''));

const technologiesIn = (text: string): Set<string> => {
  const found = new Set<string>();
  for (const t of TECHNOLOGIES) if (wholeWord(t, 'i').test(text)) found.add(t);
  for (const t of CASE_SENSITIVE_TECHNOLOGIES) if (wholeWord(t, '').test(text)) found.add(t);
  return found;
};


// STOPLIST (ADR-023 point 2). It is about English, not about the world: words that are capitalised for a reason
// of the language and carry no claim. Sentence-initial position is handled structurally (see capitalisedTokens),
// not by listing words. If a proper noun ever lands here, this list has become the COMPANIES list ADR-023 deleted.
const ENGLISH_STOPLIST: ReadonlySet<string> = new Set(['I', 'CV']);

const ACRONYM = /^[A-Z][A-Z0-9]+$/;

// Capitalised tokens of `text` that could be a name, an acronym or a product. A single capitalised word that opens a
// sentence is English, not an entity; an acronym is an entity wherever it stands.
function capitalisedTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\w])[A-Z][\w&-]*(?:\.\w+)*/g)) {
    const tok = m[0];
    if (ENGLISH_STOPLIST.has(tok)) continue;
    const before = text.slice(0, m.index).trimEnd();
    const sentenceInitial = before === '' || /[.!?:;\n]$/.test(before);
    if (sentenceInitial && !ACRONYM.test(tok)) continue;
    out.push(tok);
  }
  return out;
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
    const years = unit.startsWith('decade') ? n * 10 : unit.startsWith('m') ? n / 12 : n;
    claims.push({ phrase: m[0], years });
  }
  return claims;
}

// Total years the facts' periods span. `open` means a period has no end ("Since 2019", "2019 - Present"); with no
// clock (ADR-002) its length cannot be computed, so any claim is derivable from it. `null` = no period is stated.
function statedSpan(cited: string): { years: number; open: boolean } | null {
  let years = 0;
  let found = false;
  let open = false;
  for (const m of cited.matchAll(/(?<!\d)((?:19|20)\d\d)\s*[-‐-―]\s*((?:19|20)\d\d|present|now|current)/gi)) {
    found = true;
    if (/^\d/.test(m[2])) years += Math.max(0, Number(m[2]) - Number(m[1]));
    else open = true;
  }
  if (/\bsince\s+(?:19|20)\d\d\b/i.test(cited)) {
    found = true;
    open = true;
  }
  return found ? { years, open } : null;
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

  for (const tok of capitalisedTokens(rest)) {
    if (!wholeWord(tok, 'i').test(vocabulary)) return `name "${tok}"`;
  }

  const citedTech = technologiesIn(vocabulary);
  for (const t of technologiesIn(rest)) {
    if (!citedTech.has(t)) return `technology "${t}"`;
  }

  return badDuration;
}

// Contact values are matched as whole tokens (ADR-022): "jane@example.co" is not in "jane@example.com" and a
// truncated phone number is not in the full one. A trailing sentence period is allowed; ".com" is not.
export const containsToken = (haystack: string, value: string): boolean => {
  const v = normalize(value);
  if (v.length === 0) return false;
  return new RegExp(`(?<![\\w@])${escapeRegExp(v)}(?![\\w@]|\\.\\w)`).test(normalize(haystack));
};
