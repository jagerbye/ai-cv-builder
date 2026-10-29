import type { TokenLedger } from './ledger.js';

// C-012 (api-contracts.md). Declaration-only: no implementation in this file.
// ADR-002, structural half: compose() takes facts and a target role and nothing
// else, so the raw source text cannot reach it at compile time.

// Request handed to the one place the SDK sits behind. T is the parsed result.
export interface ToolCallRequest<T> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  parse: (raw: unknown) => T;
}

// The ONLY surface the Anthropic SDK is imported behind (C-012).
export interface AnthropicGateway {
  callTool<T>(req: ToolCallRequest<T>, ledger?: TokenLedger): Promise<T>;
}

// An atomic fact extracted from the source; sourceQuote is verbatim.
export interface Fact {
  id: string;
  kind: string;
  text: string;
  sourceQuote: string;
  source: 'document' | 'user';
}

// ADR-022: contact fields each cite the facts that establish them; verified strictly.
export type CvDraftContactField = { value: string; factIds: string[] };
export interface CvDraftContact {
  fullName?: CvDraftContactField;
  email?: CvDraftContactField;
  phone?: CvDraftContactField;
  location?: CvDraftContactField;
}

// Composed CV before verification. Every content item cites factIds.
export interface CvDraft {
  targetRole: string;
  contact?: CvDraftContact;
  summary?: { text: string; factIds: string[] };
  experience: {
    employer: string;
    role: string;
    period: string;
    location?: string;
    relevance: number;
    factIds: string[];
    bullets: { text: string; factIds: string[] }[];
  }[];
  education: { institution: string; degree?: string; period: string; factIds: string[] }[];
  skills: { name: string; group?: string; factIds: string[] }[];
}

// A question the verifier raises for the user, pointing at a draft path.
export interface QuestionDraft {
  path: string;
  text: string;
}

// An item the verifier removed, with the reason it failed.
export interface DroppedItem {
  path: string;
  reason: string;
}

export interface VerificationResult {
  accepted: CvDraft;
  questions: QuestionDraft[];
  dropped: DroppedItem[];
}

export interface GenerationPipeline {
  extract(sourceText: string, ledger?: TokenLedger): Promise<Fact[]>;
  compose(facts: Fact[], targetRole: string, ledger?: TokenLedger): Promise<CvDraft>;
  verify(draft: CvDraft, facts: Fact[]): VerificationResult;
}
