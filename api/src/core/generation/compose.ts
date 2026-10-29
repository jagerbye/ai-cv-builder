// T-11 (CVB-11). Compose stage: Fact[] + target role -> CvDraft (spec §3.4, ADR-002, C-012).
// The stage never receives the source text. Output that breaks a rule (uncited item,
// bullet over 240 characters, bullet copying a fact sourceQuote, relevance outside 0..1,
// summary missing the target role) is rejected in parse, so the gateway retries.
// Verification of cited facts is the verifier's job, not this stage's.

import type { AnthropicGateway, CvDraft, Fact, ToolCallRequest } from './types.js';
import type { TokenLedger } from './ledger.js';
import { buildComposeDescription, COMPOSE_TOOL_NAME } from './prompts/compose.js';

export const BULLET_MAX_CHARS = 240;

const cited = { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } };

const CONTACT_KEYS = ['fullName', 'email', 'phone', 'location'] as const;
const contactField = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'factIds'],
  properties: { value: { type: 'string', minLength: 1 }, factIds: cited },
};

// Closed objects only, so no field outside the draft shape can take effect.
const COMPOSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'experience', 'education', 'skills'],
  properties: {
    contact: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(CONTACT_KEYS.map((k) => [k, contactField])),
    },
    summary: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'factIds'],
      properties: { text: { type: 'string' }, factIds: cited },
    },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['employer', 'role', 'period', 'relevance', 'factIds', 'bullets'],
        properties: {
          employer: { type: 'string' },
          role: { type: 'string' },
          period: { type: 'string' },
          location: { type: 'string' },
          relevance: { type: 'number', minimum: 0, maximum: 1 },
          factIds: cited,
          bullets: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'factIds'],
              properties: { text: { type: 'string' }, factIds: cited },
            },
          },
        },
      },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['institution', 'period', 'factIds'],
        properties: {
          institution: { type: 'string' },
          degree: { type: 'string' },
          factIds: cited,
          period: { type: 'string' },
        },
      },
    },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'factIds'],
        properties: { name: { type: 'string' }, group: { type: 'string' }, factIds: cited },
      },
    },
  },
};

type RawDraft = Omit<CvDraft, 'targetRole'>;

const normalise = (s: string): string => s.replace(/\s+/g, ' ').trim();

const isStr = (v: unknown): v is string => typeof v === 'string';

// ADR-013: an entry's employer or institution must appear in one of the facts it cites.
// Case-insensitive, whitespace-normalised substring over each cited fact's text and sourceQuote.
function establishedBy(name: string, factIds: string[], byId: Map<string, Fact>): boolean {
  const needle = normalise(name).toLowerCase();
  if (needle.length === 0) return false;
  return factIds.some((id) => {
    const f = byId.get(id);
    return !!f && [f.text, f.sourceQuote].some((s) => normalise(s).toLowerCase().includes(needle));
  });
}

function checkCitations(factIds: unknown, where: string): string[] {
  if (!Array.isArray(factIds) || factIds.length === 0 || !factIds.every((id) => isStr(id) && id.length > 0)) {
    throw new Error(`compose ${where} must cite at least one factId`);
  }
  return factIds as string[];
}

// Recency key: the end of the period. "present" or "now" counts as newest.
// The start year is the secondary key, so the order is total.
function periodYears(period: string): { end: number; start: number } {
  const years = period.match(/\d{4}/g)?.map(Number) ?? [];
  const start = years.length > 0 ? years[0] : -Infinity;
  if (/present|current|now/i.test(period)) return { end: Infinity, start };
  const end = years.length > 0 ? years[years.length - 1] : -Infinity;
  return { end, start };
}

export interface ComposeStage {
  compose(facts: Fact[], targetRole: string, ledger?: TokenLedger): Promise<CvDraft>;
}

const MIN_COPY_QUOTE = 40;

export function createComposeStage(gateway: AnthropicGateway): ComposeStage {
  return {
    async compose(facts: Fact[], targetRole: string, ledger?: TokenLedger): Promise<CvDraft> {
      // No facts means nothing to compose from. Make no call and invent nothing.
      if (facts.length === 0) return { targetRole, experience: [], education: [], skills: [] };

      const quotes = facts.map((f) => normalise(f.sourceQuote)).filter((q) => q.length > 0);
      const factById = new Map(facts.map((f) => [f.id, f] as const));
      const isSourceCopy = (text: string): boolean => {
        const t = normalise(text);
        // A short quote (a skill name, a number) may legitimately recur inside a bullet;
        // only a long quote contained whole counts as a pasted source passage.
        return quotes.some((q) => t === q || (q.length >= MIN_COPY_QUOTE && t.includes(q)));
      };

      const parse = (raw: unknown): RawDraft => {
        const obj = raw as Partial<RawDraft> | null;
        if (!obj || typeof obj !== 'object') throw new Error('compose output must be an object');

        const summary = obj.summary;
        if (!summary || !isStr(summary.text) || summary.text.trim().length === 0) {
          throw new Error('compose summary must have text');
        }
        checkCitations(summary.factIds, 'summary');
        if (!summary.text.toLowerCase().includes(targetRole.toLowerCase())) {
          throw new Error('compose summary must mention the target role');
        }

        if (!Array.isArray(obj.experience)) throw new Error('compose experience must be an array');
        const experience = obj.experience.map((e, i) => {
          if (!e || !isStr(e.employer) || !isStr(e.role) || !isStr(e.period)) {
            throw new Error(`compose experience ${i} is missing employer, role or period`);
          }
          if (typeof e.relevance !== 'number' || !Number.isFinite(e.relevance) || e.relevance < 0 || e.relevance > 1) {
            throw new Error(`compose experience ${i} relevance must be a number in 0..1`);
          }
          const entryFactIds = checkCitations(e.factIds, `experience ${i}`);
          if (!establishedBy(e.employer, entryFactIds, factById)) {
            throw new Error(`compose experience ${i} employer is not established by its cited facts`);
          }
          if (!Array.isArray(e.bullets)) throw new Error(`compose experience ${i} bullets must be an array`);
          const bullets = e.bullets.map((b, j) => {
            if (!b || !isStr(b.text) || b.text.trim().length === 0) {
              throw new Error(`compose bullet ${i}.${j} must have text`);
            }
            const text = b.text.trim();
            if (text.length > BULLET_MAX_CHARS) {
              throw new Error(`compose bullet ${i}.${j} exceeds ${BULLET_MAX_CHARS} characters`);
            }
            if (isSourceCopy(text)) throw new Error(`compose bullet ${i}.${j} copies a source quote`);
            return { text, factIds: checkCitations(b.factIds, `bullet ${i}.${j}`) };
          });
          return {
            employer: e.employer,
            role: e.role,
            period: e.period,
            ...(isStr(e.location) ? { location: e.location } : {}),
            relevance: e.relevance,
            factIds: entryFactIds,
            bullets,
          };
        });

        if (!Array.isArray(obj.education)) throw new Error('compose education must be an array');
        const education = obj.education.map((d, i) => {
          if (!d || !isStr(d.institution) || !isStr(d.period)) {
            throw new Error(`compose education ${i} is missing institution or period`);
          }
          const entryFactIds = checkCitations(d.factIds, `education ${i}`);
          if (!establishedBy(d.institution, entryFactIds, factById)) {
            throw new Error(`compose education ${i} institution is not established by its cited facts`);
          }
          return {
            institution: d.institution,
            period: d.period,
            factIds: entryFactIds,
            ...(isStr(d.degree) ? { degree: d.degree } : {}),
          };
        });

        if (!Array.isArray(obj.skills)) throw new Error('compose skills must be an array');
        const skills = obj.skills.map((s, i) => {
          if (!s || !isStr(s.name)) throw new Error(`compose skill ${i} must have a name`);
          return {
            name: s.name,
            factIds: checkCitations(s.factIds, `skill ${i}`),
            ...(isStr(s.group) ? { group: s.group } : {}),
          };
        });

        let contact: CvDraft['contact'];
        if (obj.contact !== undefined) {
          const rawContact = obj.contact as Record<string, { value?: unknown; factIds?: unknown } | undefined>;
          if (rawContact === null || typeof rawContact !== 'object') throw new Error('compose contact must be an object');
          contact = {};
          for (const key of CONTACT_KEYS) {
            const c = rawContact[key];
            if (c === undefined) continue;
            if (!c || !isStr(c.value) || c.value.trim().length === 0) throw new Error(`compose contact ${key} must have a value`);
            contact[key] = { value: c.value, factIds: checkCitations(c.factIds, `contact ${key}`) };
          }
        }

        return {
          ...(contact ? { contact } : {}),
          summary: { text: summary.text, factIds: summary.factIds as string[] },
          experience,
          education,
          skills,
        };
      };

      const req: ToolCallRequest<RawDraft> = {
        name: COMPOSE_TOOL_NAME,
        description: buildComposeDescription(facts, targetRole),
        inputSchema: COMPOSE_SCHEMA,
        parse,
      };
      const raw = await gateway.callTool(req, ledger);

      // Relevance first, recency as tie-break (a "present" end date is the newest).
      const experience = [...raw.experience].sort((a, b) => {
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        const pa = periodYears(a.period);
        const pb = periodYears(b.period);
        if (pb.end !== pa.end) return pb.end > pa.end ? 1 : -1;
        if (pb.start !== pa.start) return pb.start > pa.start ? 1 : -1;
        return 0;
      });

      return { targetRole, ...(raw.contact ? { contact: raw.contact } : {}), summary: raw.summary, experience, education: raw.education, skills: raw.skills };
    },
  };
}
