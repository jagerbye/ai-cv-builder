import { describe, it, expect } from 'vitest';
import { verify } from './verify.js';
import type { CvDraft, Fact } from './types.js';

// ADR-030. The defect this file exists for: a live run produced a CV with no name on it and no question about it.
// Compose leaves out any contact field no fact states, and the verifier only looked at the fields the draft
// carried — so the omission was invisible to both. The spec's rule is that anything MISSING becomes a question,
// and "missing" includes "never drafted".

const fact = (id: string, text: string, kind = 'contact'): Fact => ({ id, kind, text, sourceQuote: text, source: 'document' });

const base = (over: Partial<CvDraft> = {}): CvDraft => ({
  targetRole: 'Backend engineer',
  experience: [],
  education: [],
  skills: [],
  ...over,
});

const pathsOf = (qs: readonly { path: string }[]): string[] => qs.map((q) => q.path);

describe('verify — a required contact field the draft does not carry (ADR-030)', () => {
  it('asks for the full name at priority 1 when the draft omits it', () => {
    const facts = [fact('f1', 'Email is ada@example.com')];
    const draft = base({ contact: { email: { value: 'ada@example.com', factIds: ['f1'] } } });

    const r = verify(draft, facts);

    expect(r.questions).toContainEqual(
      expect.objectContaining({ path: 'contact.fullName', reason: 'missing', priority: 1 }),
    );
    expect(r.questions.find((q) => q.path === 'contact.fullName')!.text).toMatch(/full name/i);
    // The email it did ground is kept: the new question is about the absence, not about the block.
    expect(r.accepted.contact).toEqual({ email: { value: 'ada@example.com', factIds: ['f1'] } });
  });

  it('asks for the email at priority 1 when the draft omits it', () => {
    const facts = [fact('f1', 'Ada Lovelace')];
    const draft = base({ contact: { fullName: { value: 'Ada Lovelace', factIds: ['f1'] } } });

    expect(verify(draft, facts).questions).toContainEqual(
      expect.objectContaining({ path: 'contact.email', reason: 'missing', priority: 1 }),
    );
  });

  it('asks for both when the draft carries no contact block at all', () => {
    const r = verify(base(), []);

    expect(pathsOf(r.questions).sort()).toEqual(['contact.email', 'contact.fullName']);
    expect(r.accepted.contact).toBeUndefined();
  });

  it('asks for neither when both are drafted and grounded', () => {
    const facts = [fact('f1', 'Ada Lovelace'), fact('f2', 'Email is ada@example.com')];
    const draft = base({
      contact: {
        fullName: { value: 'Ada Lovelace', factIds: ['f1'] },
        email: { value: 'ada@example.com', factIds: ['f2'] },
      },
    });

    expect(pathsOf(verify(draft, facts).questions)).toEqual([]);
  });

  it('does not ask for phone or location, which a CV can do without', () => {
    const facts = [fact('f1', 'Ada Lovelace'), fact('f2', 'Email is ada@example.com')];
    const draft = base({
      contact: {
        fullName: { value: 'Ada Lovelace', factIds: ['f1'] },
        email: { value: 'ada@example.com', factIds: ['f2'] },
      },
    });

    const paths = pathsOf(verify(draft, facts).questions);
    expect(paths).not.toContain('contact.phone');
    expect(paths).not.toContain('contact.location');
  });

  it('asks once, not twice, when a drafted name is present but ungrounded', () => {
    const facts = [fact('f1', 'Email is ada@example.com')];
    const draft = base({
      contact: {
        fullName: { value: 'Grace Hopper', factIds: ['f1'] },
        email: { value: 'ada@example.com', factIds: ['f1'] },
      },
    });

    const r = verify(draft, facts);

    expect(pathsOf(r.questions).filter((p) => p === 'contact.fullName')).toHaveLength(1);
    expect(r.dropped).toContainEqual(expect.objectContaining({ path: 'contact.fullName' }));
  });
});
