import { describe, it, expect } from 'vitest';
import { verify } from './verify.js';
import type { CvDraft, Fact } from './types.js';

// ADR-023: the allowed vocabulary of a generated section is the text of its cited facts plus the target role the user
// supplied. No list of organisations is consulted. ADR-025: in prose (summary, bullets) an unsupported phrase, figure
// or duration is KEPT and raises a priority-2 question; structured fields (entries, skills, contact) still drop.

const fact = (id: string, text: string, kind = 'employment'): Fact => ({
  id,
  kind,
  text,
  sourceQuote: text,
  source: 'document',
});

const base = (over: Partial<CvDraft> = {}): CvDraft => ({
  targetRole: 'Senior engineer',
  experience: [],
  education: [],
  skills: [],
  ...over,
});

const entryWithBullet = (bulletText: string, bulletFactIds: string[] = ['f1']): CvDraft['experience'][number] => ({
  employer: 'Acme Ltd',
  role: 'Backend engineer',
  period: '2019',
  relevance: 0.7,
  factIds: ['f1'],
  bullets: [{ text: bulletText, factIds: bulletFactIds }],
});

// ADR-030 adds two completeness questions (contact.fullName, contact.email) to any draft that omits them, and the
// drafts here omit them. Those are covered in verify.required-contact.test.ts; these assertions are about the
// groundedness verdict, so they read the content questions only.
const contentQuestions = <Q extends { path: string }>(r: { questions: Q[] }): Q[] =>
  r.questions.filter((q) => !q.path.startsWith('contact.'));

describe('ADR-023/025 — an organisation no cited fact names is flagged in prose, listed or not', () => {
  it('keeps "…a decade at Stripe" and questions it when no cited fact names Stripe (the attack that found the defect)', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2014-2024')];
    const r = verify(base({ summary: { text: 'Senior engineer with a decade at Stripe', factIds: ['f1'] } }), facts);
    expect(r.accepted.summary).toEqual({ text: 'Senior engineer with a decade at Stripe', factIds: ['f1'] });
    expect(r.dropped).toEqual([]);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'summary.text', priority: 2, text: expect.stringContaining('Stripe') }));
  });

  it('asks nothing about the same sentence when a cited fact names Stripe and states the decade', () => {
    const facts = [fact('f1', 'Senior engineer at Stripe, a decade')];
    const r = verify(base({ summary: { text: 'Senior engineer with a decade at Stripe', factIds: ['f1'] } }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toEqual({ text: 'Senior engineer with a decade at Stripe', factIds: ['f1'] });
    expect(contentQuestions(r)).toEqual([]);
  });

  it('keeps a duration-free Stripe sentence with no question when a cited fact names Stripe', () => {
    const facts = [fact('f1', 'Senior engineer at Stripe, 2019')];
    const r = verify(base({ summary: { text: 'Senior engineer with deep experience at Stripe', factIds: ['f1'] } }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
    expect(r.questions.some((q) => q.path === 'summary.text')).toBe(false);
  });

  it('keeps a bullet naming Stripe and questions it when the bullet\'s cited facts do not name it', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019, built payments')];
    const r = verify(base({ experience: [entryWithBullet('Scaled payments at Stripe')] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience[0].bullets).toHaveLength(1);
    expect(r.questions).toContainEqual(
      expect.objectContaining({ path: 'experience[0].bullets[0].text', reason: 'unverifiable' }),
    );
  });

  it('keeps a bullet with an unlisted acronym that no cited fact contains, and questions it', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019, built the ledger')];
    const r = verify(base({ experience: [entryWithBullet('Built the QXR ledger')] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience[0].bullets).toHaveLength(1);
    expect(r.questions).toContainEqual(
      expect.objectContaining({ path: 'experience[0].bullets[0].text', reason: 'unverifiable' }),
    );
  });

  it('keeps a bullet with a made-up product name and asks; a two-word one is kept and asked the same way', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019, built dashboards')];
    const r = verify(base({ experience: [entryWithBullet('Built Zentrio dashboards')] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'experience[0].bullets[0].text' }));
    const two = verify(base({ experience: [entryWithBullet('Built Zentrio Quark dashboards')] }), facts);
    expect(two.dropped).toEqual([]);
    expect(two.questions).toContainEqual(expect.objectContaining({ path: 'experience[0].bullets[0].text', priority: 2 }));
  });

  it('keeps a made-up product name that a cited fact holds', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019, built Zentrio dashboards')];
    const r = verify(base({ experience: [entryWithBullet('Built Zentrio dashboards')] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience[0].bullets).toHaveLength(1);
  });
});

describe('ADR-023 — the target role is vocabulary, not an invention', () => {
  it('keeps a summary whose acronym is the target role the user supplied', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const r = verify(base({ targetRole: 'ML engineer', summary: { text: 'ML engineer focused on delivery', factIds: ['f1'] } }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
  });

  it('keeps a summary whose capitalised words are all words of the target role', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const r = verify(
      base({ targetRole: 'Senior Backend Engineer', summary: { text: 'Senior Backend Engineer focused on payments', factIds: ['f1'] } }),
      facts,
    );
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
  });
});

describe('ADR-023 — the stoplist does not fire on English (false-positive guard)', () => {
  it('keeps a vague summary with no entities at all, and does not drop it', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const r = verify(
      base({ summary: { text: 'Pragmatic engineer who ships reliable software. Careful, calm and curious.', factIds: ['f1'] } }),
      facts,
    );
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
  });

  it('keeps sentence-initial capitals in a bullet whose facts hold the words', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019, built payments, mentored juniors, shipped weekly')];
    const r = verify(base({ experience: [entryWithBullet('Built payments. Mentored juniors. Shipped weekly.')] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience[0].bullets).toHaveLength(1);
  });
});

describe('ADR-025 — durations and quantified results in prose are kept and questioned', () => {
  it('keeps "five years" derived from a stated period, and raises its question', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019-2024')];
    const r = verify(base({ summary: { text: 'Backend engineer with five years of experience at Acme Ltd', factIds: ['f1'] } }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
    expect(r.questions.some((q) => q.path === 'summary.text')).toBe(true);
  });

  it('keeps "a decade" derived from stated periods spanning ten years, and raises its question', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2014-2024')];
    const r = verify(base({ summary: { text: 'Backend engineer with a decade of experience at Acme Ltd', factIds: ['f1'] } }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
    expect(r.questions.some((q) => q.path === 'summary.text')).toBe(true);
  });

  it('keeps "a decade" and questions it when no cited fact states any period to derive it from', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd')];
    const r = verify(base({ summary: { text: 'Backend engineer with a decade of experience at Acme Ltd', factIds: ['f1'] } }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'summary.text', priority: 2 }));
  });

  it('keeps a quantified result no cited fact states ("200 engineers") and questions it', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019-2024')];
    const r = verify(base({ summary: { text: 'Backend engineer at Acme Ltd who led 200 engineers', factIds: ['f1'] } }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'summary.text', priority: 2, text: expect.stringContaining('200') }));
  });

  it('keeps a percentage claim no cited fact states ("99% accuracy") and questions it', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const r = verify(base({ experience: [entryWithBullet('Reached 99% accuracy on models')] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience[0].bullets).toHaveLength(1);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'experience[0].bullets[0].text', priority: 2, text: expect.stringContaining('99') }));
  });
});
