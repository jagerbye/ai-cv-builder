// T-10 (CVB-10). Extract stage: source text -> Fact[] (spec §3.4, ADR-002, C-012).
// Goes through the AnthropicGateway only (never the SDK). Facts whose sourceQuote
// is not a substring of the source after whitespace normalisation are discarded,
// never repaired. Facts are append-only: each run mints new ids.

import { randomUUID } from 'node:crypto';
import type { AnthropicGateway, Fact, ToolCallRequest } from './types.js';
import type { TokenLedger } from './ledger.js';
import { buildExtractDescription, EXTRACT_TOOL_NAME } from './prompts/extract.js';

// Domain kinds from domain-model.md (Fact.kind). Pinned in the schema and checked in parse.
export const FACT_KINDS = ['contact', 'employment', 'education', 'skill', 'achievement', 'other'] as const;

interface RawFact {
  kind: string;
  text: string;
  sourceQuote: string;
}

// The only shape the model may return: { facts: [{ kind, text, sourceQuote }] }.
// Every object is closed, so there is no field through which an instruction could take effect.
const EXTRACT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['facts'],
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text', 'sourceQuote'],
        properties: {
          kind: { type: 'string', enum: [...FACT_KINDS] },
          text: { type: 'string' },
          sourceQuote: { type: 'string' },
        },
      },
    },
  },
};

// Shape check only. Rejects output that does not match the fact schema so the
// gateway can retry. Quote verification is a separate step in extract().
function parseFacts(raw: unknown): RawFact[] {
  const obj = raw as { facts?: unknown } | null;
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.facts)) {
    throw new Error('extract output must be an object with a facts array');
  }
  return obj.facts.map((item, i) => {
    const f = item as Partial<RawFact> | null;
    if (
      !f ||
      typeof f !== 'object' ||
      typeof f.kind !== 'string' ||
      typeof f.text !== 'string' ||
      typeof f.sourceQuote !== 'string' ||
      !(FACT_KINDS as readonly string[]).includes(f.kind)
    ) {
      throw new Error(`extract fact ${i} does not match the fact shape`);
    }
    return { kind: f.kind, text: f.text, sourceQuote: f.sourceQuote };
  });
}

// Whitespace normalisation for the quote check (domain-model Fact invariant).
const normalise = (s: string): string => s.replace(/\s+/g, ' ').trim();

export interface ExtractStage {
  extract(sourceText: string, ledger?: TokenLedger): Promise<Fact[]>;
}

export function createExtractStage(gateway: AnthropicGateway): ExtractStage {
  return {
    async extract(sourceText: string, ledger?: TokenLedger): Promise<Fact[]> {
      const req: ToolCallRequest<RawFact[]> = {
        name: EXTRACT_TOOL_NAME,
        // The untrusted source travels in the description: ToolCallRequest has no user-message field yet (T-09 gap).
        description: buildExtractDescription(sourceText),
        inputSchema: EXTRACT_SCHEMA,
        parse: parseFacts,
      };
      const raw = await gateway.callTool(req, ledger);
      const haystack = normalise(sourceText);

      const facts: Fact[] = [];
      for (const f of raw) {
        const text = normalise(f.text);
        const quote = normalise(f.sourceQuote);
        // Discard, do not repair: an empty or non-verbatim quote drops the fact.
        if (text.length === 0 || quote.length === 0 || !haystack.includes(quote)) continue;
        facts.push({
          id: randomUUID(),
          kind: f.kind,
          text,
          sourceQuote: f.sourceQuote,
          source: 'document',
        });
      }
      return facts;
    },
  };
}
