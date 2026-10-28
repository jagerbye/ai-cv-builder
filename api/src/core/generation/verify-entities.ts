// Deterministic entity extraction for the verifier (spec §3.4). No NLP, no LLM: the lexicons are
// closed lists, so an unknown name is never mistaken for a grounded one by a model.

const TECHNOLOGIES = [
  'Kafka', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'RabbitMQ', 'GraphQL',
  'Kubernetes', 'Docker', 'Terraform', 'AWS', 'Azure', 'GCP', 'Java', 'JavaScript', 'TypeScript',
  'Python', 'Rust', 'React', 'Node.js', 'Django',
];

// "Go" is matched case-sensitively so the verb "go" is not read as a technology.
const CASE_SENSITIVE_TECHNOLOGIES = ['Go'];

const COMPANIES = [
  'Google', 'Microsoft', 'Amazon', 'Meta', 'Apple', 'Netflix', 'IBM', 'Oracle', 'Salesforce',
  'Uber', 'Facebook', 'Tesla', 'Nvidia', 'Intel', 'Accenture', 'Deloitte',
];

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

const companiesIn = (text: string): string[] => COMPANIES.filter((c) => wholeWord(c, '').test(text));

// Returns the first entity in `text` that no cited fact text supports, or null when all are supported.
export function unsupportedEntity(text: string, citedTexts: readonly string[]): string | null {
  const cited = citedTexts.join('\n');

  const citedNumbers = new Set(numberTokens(cited));
  for (const n of numberTokens(text)) {
    if (!citedNumbers.has(n)) return `number "${n}"`;
  }

  for (const m of text.matchAll(LEGAL_SUFFIX)) {
    const words = m[1].split(/\s+/);
    const supported = words.some((_, k) =>
      containsText(cited, [...words.slice(k), m[2]].join(' ')),
    );
    if (!supported) return `organisation "${m[0].trim()}"`;
  }

  for (const c of companiesIn(text)) {
    if (!wholeWord(c, '').test(cited)) return `organisation "${c}"`;
  }

  const citedTech = technologiesIn(cited);
  for (const t of technologiesIn(text)) {
    if (!citedTech.has(t)) return `technology "${t}"`;
  }

  return null;
}
