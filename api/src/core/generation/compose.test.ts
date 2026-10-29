import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createComposeStage } from './compose.js';
import { buildComposeDescription } from './prompts/compose.js';
import type { AnthropicGateway, CvDraft, Fact, ToolCallRequest } from './types.js';

// T-11 (CVB-11). Spec §3.4 (F-004), ADR-002 compose stage, C-012 (GenerationPipeline.compose).
// The gateway is a fake that replays the recorded tool output through the request's own
// parse(), as the real gateway does after schema validation. No network, no key.
// Fixture: tests/fixtures/llm/compose-ok.json.

const FIXTURE_DIR = fileURLToPath(new URL('../../../../tests/fixtures/llm/', import.meta.url));

interface ComposeFixture {
  targetRole: string;
  facts: Fact[];
  toolInput: Record<string, unknown>;
}
const fixture = JSON.parse(readFileSync(FIXTURE_DIR + 'compose-ok.json', 'utf8')) as ComposeFixture;
const FACTS = fixture.facts;
const ROLE = fixture.targetRole;

// Held by the test only. It is never passed to compose, so it must never reach the gateway request.
const SOURCE_SENTINEL = 'SOURCE-ONLY-SENTINEL-7731 never in any fact';

function fakeGateway(raw: unknown): { calls: ToolCallRequest<unknown>[]; gateway: AnthropicGateway } {
  const calls: ToolCallRequest<unknown>[] = [];
  const gateway: AnthropicGateway = {
    async callTool<T>(req: ToolCallRequest<T>): Promise<T> {
      calls.push(req as ToolCallRequest<unknown>);
      return req.parse(raw);
    },
  };
  return { calls, gateway };
}

interface RawDraft {
  summary: { text: string; factIds: string[] };
  experience: {
    employer: string;
    relevance: number;
    factIds: string[];
    bullets: { text: string; factIds: string[] }[];
  }[];
  education: { institution: string; factIds: string[] }[];
}
const clone = (): RawDraft => structuredClone(fixture.toolInput) as unknown as RawDraft;

describe('compose stage (T-11)', () => {
  it('takes facts and target role only (the signature is the guarantee): one gateway call, no sentinel in the request', async () => {
    const { calls, gateway } = fakeGateway(fixture.toolInput);
    const stage = createComposeStage(gateway);
    // The signature (facts, targetRole, optional ledger: ADR-021) is what keeps the source out; the sentinel check below
    // only guards the request builder against inventing a source of its own.
    expect(stage.compose.length).toBe(3);

    await stage.compose(FACTS, ROLE);

    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).not.toContain(SOURCE_SENTINEL);
    expect(JSON.stringify(calls[0].description)).toContain(FACTS[0].sourceQuote);
  });

  it('returns a draft carrying the target role and the composed content', async () => {
    const { gateway } = fakeGateway(fixture.toolInput);
    const draft: CvDraft = await createComposeStage(gateway).compose(FACTS, ROLE);

    expect(draft.targetRole).toBe(ROLE);
    expect(draft.experience.map((e) => e.employer)).toEqual(['Initech', 'Acme Corp', 'Globex']);
    expect(draft.skills).toEqual([{ name: 'TypeScript', factIds: ['f-ts'] }]);
  });

  it('cites factIds on the summary, every bullet and every skill', async () => {
    const { gateway } = fakeGateway(fixture.toolInput);
    const draft = await createComposeStage(gateway).compose(FACTS, ROLE);

    expect(draft.summary?.factIds.length).toBeGreaterThan(0);
    for (const e of draft.experience) {
      for (const b of e.bullets) expect(b.factIds.length).toBeGreaterThan(0);
    }
    for (const s of draft.skills) expect(s.factIds.length).toBeGreaterThan(0);
  });

  it('rejects the whole output when a bullet cites no facts (gateway retries)', async () => {
    const raw = clone();
    raw.experience[1].bullets[0].factIds = [];
    const { calls, gateway } = fakeGateway(raw);
    await expect(createComposeStage(gateway).compose(FACTS, ROLE)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('rejects the whole output when the summary cites no facts', async () => {
    const raw = clone();
    raw.summary.factIds = [];
    const { gateway } = fakeGateway(raw);
    await expect(createComposeStage(gateway).compose(FACTS, ROLE)).rejects.toThrow();
  });

  it('rejects a bullet longer than 240 characters and accepts exactly 240', async () => {
    const tooLong = clone();
    tooLong.experience[1].bullets[0].text = 'x'.repeat(241);
    await expect(createComposeStage(fakeGateway(tooLong).gateway).compose(FACTS, ROLE)).rejects.toThrow();

    const atLimit = clone();
    atLimit.experience[1].bullets[0].text = 'x'.repeat(240);
    const draft = await createComposeStage(fakeGateway(atLimit).gateway).compose(FACTS, ROLE);
    const bullet = draft.experience.find((e) => e.employer === 'Acme Corp')!.bullets[0];
    expect(bullet.text.length).toBe(240);
  });

  it('rejects a bullet that is a verbatim copy of a fact source quote', async () => {
    const raw = clone();
    raw.experience[1].bullets[0].text = FACTS[3].sourceQuote;
    await expect(createComposeStage(fakeGateway(raw).gateway).compose(FACTS, ROLE)).rejects.toThrow();
  });

  it('accepts a bullet that merely contains a short source quote', async () => {
    const raw = clone();
    const short = { ...FACTS[4], sourceQuote: 'TypeScript' };
    raw.experience[1].bullets[0].text = 'Built services in TypeScript and cut latency.';
    const draft = await createComposeStage(fakeGateway(raw).gateway).compose([...FACTS.slice(0, 4), short, FACTS.find((f) => f.id === 'f-edu')!], ROLE);
    expect(draft.experience.length).toBeGreaterThan(0);
  });

  it('rejects a bullet containing a whole 40+ char source quote plus extra words', async () => {
    const quote = 'Led the billing migration '.padEnd(40, 'x');
    expect(quote.length).toBe(40);
    const facts = [...FACTS.slice(0, 4), { ...FACTS[4], sourceQuote: quote }, FACTS.find((f) => f.id === 'f-edu')!];
    const raw = clone();
    raw.experience[1].bullets[0].text = `Proudly ${quote} to a new platform.`;
    await expect(createComposeStage(fakeGateway(raw).gateway).compose(facts, ROLE)).rejects.toThrow();
  });

  it('accepts a bullet containing a 39 char source quote plus extra words', async () => {
    const quote = 'Led the billing migration '.padEnd(39, 'x');
    expect(quote.length).toBe(39);
    const facts = [...FACTS.slice(0, 4), { ...FACTS[4], sourceQuote: quote }, FACTS.find((f) => f.id === 'f-edu')!];
    const raw = clone();
    raw.experience[1].bullets[0].text = `Proudly ${quote} to a new platform.`;
    const draft = await createComposeStage(fakeGateway(raw).gateway).compose(facts, ROLE);
    expect(draft.experience.length).toBeGreaterThan(0);
  });

  it('orders experience by relevance first, recency as tie-break', async () => {
    // Fixture order is Globex (0.4), Acme (0.9, 2019-2021), Initech (0.9, 2023-present).
    // Expected: Initech and Acme tie on relevance, Initech is more recent, then Globex.
    const { gateway } = fakeGateway(fixture.toolInput);
    const draft = await createComposeStage(gateway).compose(FACTS, ROLE);
    expect(draft.experience.map((e) => [e.employer, e.relevance])).toEqual([
      ['Initech', 0.9],
      ['Acme Corp', 0.9],
      ['Globex', 0.4],
    ]);
  });

  it('rejects a relevance score outside 0..1', async () => {
    const raw = clone();
    raw.experience[0].relevance = 1.5;
    await expect(createComposeStage(fakeGateway(raw).gateway).compose(FACTS, ROLE)).rejects.toThrow();
  });

  it('rejects a summary that does not mention the target role', async () => {
    const raw = clone();
    raw.summary.text = 'A hard-working engineer who likes building things.';
    await expect(createComposeStage(fakeGateway(raw).gateway).compose(FACTS, ROLE)).rejects.toThrow();
  });

  it('with no facts, makes no gateway call and invents no content', async () => {
    const { calls, gateway } = fakeGateway(fixture.toolInput);
    const draft = await createComposeStage(gateway).compose([], ROLE);
    expect(calls).toHaveLength(0);
    expect(draft).toEqual({ targetRole: ROLE, experience: [], education: [], skills: [] });
  });
});

// T-11 rework (ADR-013). Experience and education entries carry factIds; an entry's facts must
// establish its employer or institution. Fixture facts: f-acme, f-globex, f-initech, f-edu.
describe('compose stage: entry-level factIds (T-11, ADR-013)', () => {
  interface ComposeSchemaShape {
    properties: {
      experience: { items: { required: string[]; properties: Record<string, unknown> } };
      education: { items: { required: string[]; properties: Record<string, unknown> } };
    };
  }

  it('the request schema requires factIds on every experience entry and every education entry', async () => {
    const { calls, gateway } = fakeGateway(fixture.toolInput);
    await createComposeStage(gateway).compose(FACTS, ROLE);

    const schema = calls[0].inputSchema as unknown as ComposeSchemaShape;
    expect(schema.properties.experience.items.required).toContain('factIds');
    expect(schema.properties.experience.items.properties.factIds).toMatchObject({ type: 'array', minItems: 1 });
    expect(schema.properties.education.items.required).toContain('factIds');
    expect(schema.properties.education.items.properties.factIds).toMatchObject({ type: 'array', minItems: 1 });
  });

  it('returns factIds on every experience entry and education entry, carried from the output', async () => {
    const { gateway } = fakeGateway(fixture.toolInput);
    const draft = await createComposeStage(gateway).compose(FACTS, ROLE);

    expect(draft.experience.map((e) => [e.employer, e.factIds])).toEqual([
      ['Initech', ['f-initech']],
      ['Acme Corp', ['f-acme']],
      ['Globex', ['f-globex']],
    ]);
    expect(draft.education).toEqual([
      { institution: 'University of Lisbon', degree: 'MSc Computer Science', period: '2015 – 2017', factIds: ['f-edu'] },
    ]);
  });

  it('rejects the whole output when an experience entry cites no facts (gateway retries)', async () => {
    const raw = clone();
    raw.experience[1].factIds = [];
    const { calls, gateway } = fakeGateway(raw);
    await expect(createComposeStage(gateway).compose(FACTS, ROLE)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('rejects the whole output when an education entry cites no facts', async () => {
    const raw = clone();
    raw.education[0].factIds = [];
    await expect(createComposeStage(fakeGateway(raw).gateway).compose(FACTS, ROLE)).rejects.toThrow();
  });

  it('does not produce an experience entry whose employer appears in none of its cited facts', async () => {
    // Employer "Umbrella Corp" is not in any fact at all; it cites the Globex fact.
    const raw = clone();
    raw.experience[0].employer = 'Umbrella Corp';
    await expect(createComposeStage(fakeGateway(raw).gateway).compose(FACTS, ROLE)).rejects.toThrow();
  });

  it('does not produce a mis-paired experience entry (ADR-013: employer from one fact, cited fact is another)', async () => {
    // "Acme Corp" is real (f-acme) but the entry cites only f-initech. Every token is real, the pair is invented.
    const raw = clone();
    const initech = raw.experience.find((e) => e.employer === 'Initech')!;
    initech.employer = 'Acme Corp';
    await expect(createComposeStage(fakeGateway(raw).gateway).compose(FACTS, ROLE)).rejects.toThrow();
  });

  it('does not produce an education entry whose institution appears in none of its cited facts', async () => {
    const raw = clone();
    raw.education[0].institution = 'University of Porto';
    await expect(createComposeStage(fakeGateway(raw).gateway).compose(FACTS, ROLE)).rejects.toThrow();
  });
});

// ADR-022. Compose emits the contact block with factIds per field; the prompt forbids derived quantities.
describe('compose stage: contact and derived quantities (ADR-022)', () => {
  const contactRaw = (): RawDraft & { contact: Record<string, { value: string; factIds: string[] }> } => ({
    ...clone(),
    contact: {
      fullName: { value: 'Jane Doe', factIds: ['f-acme'] },
      email: { value: 'jane@example.com', factIds: ['f-acme'] },
    },
  });

  it('the request schema declares contact with a value and a factIds array on every field', async () => {
    const { calls, gateway } = fakeGateway(fixture.toolInput);
    await createComposeStage(gateway).compose(FACTS, ROLE);

    const schema = calls[0].inputSchema as unknown as {
      properties: { contact: { properties: Record<string, { required?: string[]; properties?: Record<string, unknown> }> } };
    };
    for (const key of ['fullName', 'email', 'phone', 'location']) {
      expect(schema.properties.contact.properties[key].required).toEqual(['value', 'factIds']);
      expect(schema.properties.contact.properties[key].properties?.factIds).toMatchObject({ type: 'array', minItems: 1 });
    }
  });

  it('carries each contact field with the factIds it cites', async () => {
    const draft = await createComposeStage(fakeGateway(contactRaw()).gateway).compose(FACTS, ROLE);
    expect(draft.contact).toEqual({
      fullName: { value: 'Jane Doe', factIds: ['f-acme'] },
      email: { value: 'jane@example.com', factIds: ['f-acme'] },
    });
  });

  it('rejects the whole output when a contact field cites no facts (gateway retries)', async () => {
    const raw = contactRaw();
    raw.contact.email.factIds = [];
    const { calls, gateway } = fakeGateway(raw);
    await expect(createComposeStage(gateway).compose(FACTS, ROLE)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('a draft without contact composes with no contact (contact is not invented)', async () => {
    const draft = await createComposeStage(fakeGateway(fixture.toolInput).gateway).compose(FACTS, ROLE);
    expect(draft.contact).toBeUndefined();
  });

  it('the compose prompt forbids derived quantities and names the contact block', () => {
    const text = buildComposeDescription(FACTS, ROLE);
    expect(text).toMatch(/derive|compute|calculat/i);
    expect(text).toMatch(/quantit/i);
    expect(text).toMatch(/contact/i);
  });
});
