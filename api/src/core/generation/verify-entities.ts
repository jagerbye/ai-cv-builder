// Text helpers and the best-effort prose check for the verifier (spec §3.4, ADR-023, ADR-025).
//
// What the prose check IS: a flag. unsupportedPhrase() looks at free text (the summary, a bullet) and names the first
// number, capitalised name, acronym or duration that the cited facts do not hold. The caller turns that into a
// priority-1 QUESTION beside the field and the drafted text stays. It is deterministic: no NLP, no LLM, no list of
// known names; the vocabulary is the text of the cited facts plus the target role.
// What it is NOT: a guarantee and never a deleter. Detecting invented entities in free prose is named-entity
// recognition, and three adversarial rounds showed regular expressions cannot close it (ADR-025). Names with an
// internal capital ("eBay"), names in uncased scripts, lowercase technologies, numerals written as words and
// possessives can pass unflagged; legitimate wording ("Python 3" against "Python 3.11") can be flagged. Both are
// acceptable BECAUSE the outcome is only ever a question. The strong guarantee lives in structured fields
// (experience, education, skills, contact), which verify.ts grounds with containsText/containsPeriod/containsToken.

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

// Words capitalised for a reason of the language, carrying no claim.
const ENGLISH_STOPLIST: ReadonlySet<string> = new Set([
  'I', 'CV',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
]);

// Every English word is capitalised at the start of a sentence, so a plain sentence-initial word ("Built", "Worked")
// carries no signal and is skipped. A sentence-initial acronym, hyphen compound ("Stripe-backed") or non-ASCII word
// is still checked. Known limit: an invented plain-looking name that opens a sentence ("Stripe engineer ...") passes.
const PLAIN_WORD = /^[A-Z][a-z]*$/;

// A duration ("five years", "a decade", "3 months") is a claim like any other: flagged unless a cited fact says it
// verbatim. "a year" / "a month" is idiom, not a claimed career length, and is not matched.
const DURATION = /(?<![\w.])(?:\d+\+?|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s*(?:years?|yrs?|months?|decades?)(?!\w)/gi;
const durationPhrases = (text: string): string[] =>
  [...text.matchAll(DURATION)].map((m) => m[0]).filter((p) => !/^a\s/i.test(p) || /decade/i.test(p));

// The first phrase in `text` that the cited facts (plus `allowed`, the target role) do not support, or null.
// Best-effort and question-only (see the header): it never decides a deletion.
export function unsupportedPhrase(text: string, citedTexts: readonly string[], allowed: readonly string[] = []): string | null {
  const cited = citedTexts.join('\n');
  const vocabulary = [cited, ...allowed].join('\n');

  let rest = text;
  const durations = durationPhrases(text);
  for (const d of durations) rest = rest.replace(d, ' ');

  const citedNumbers = new Set(numberTokens(cited));
  for (const n of numberTokens(rest)) {
    if (!citedNumbers.has(n)) return `number "${n}"`;
  }

  for (const m of rest.matchAll(/(?<![\p{L}\p{N}_])\p{Lu}[\p{L}\p{N}_&']*(?:\.[\p{L}\p{N}_]+)*/gu)) {
    const tok = m[0];
    if (ENGLISH_STOPLIST.has(tok)) continue;
    const before = rest.slice(0, m.index ?? 0).trimEnd();
    const sentenceInitial = before === '' || /[.!?:;\n]$/.test(before);
    const hyphenated = rest[(m.index ?? 0) + tok.length] === '-';
    if (sentenceInitial && PLAIN_WORD.test(tok) && !hyphenated) continue;
    if (wholeWord(tok, 'i').test(vocabulary)) continue;
    return `name "${tok}"`;
  }

  const unstated = durations.find((d) => !containsText(cited, d));
  return unstated === undefined ? null : `duration "${unstated}"`;
}

// Contact values are matched as whole tokens (ADR-022): "jane@example.co" is not in "jane@example.com" and a
// truncated phone number is not in the full one. A trailing sentence period is allowed; ".com" is not.
export const containsToken = (haystack: string, value: string): boolean => {
  const v = normalize(value);
  if (v.length === 0) return false;
  return new RegExp(`(?<![\\w@])${escapeRegExp(v)}(?![\\w@]|\\.\\w)`).test(normalize(haystack));
};
