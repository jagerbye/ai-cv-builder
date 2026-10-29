import { describe, it, expect } from 'vitest';
import { verify } from './verify.js';
import { unsupportedEntity, ambiguousName } from './verify-entities.js';
import type { CvDraft, Fact } from './types.js';

// ADR-024 probes. Three silent holes (an invented entity kept with no question) and five over-fires (a legitimate
// summary deleted), plus the duration check the reviewer's mutation found untested. Two tiers: an unsupported
// multi-token capitalised sequence or acronym DROPS; a single ambiguous capitalised word raises a QUESTION.

const fact = (id: string, text: string): Fact => ({ id, kind: 'employment', text, sourceQuote: text, source: 'document' });
const base = (over: Partial<CvDraft> = {}): CvDraft => ({ targetRole: 'Senior engineer', experience: [], education: [], skills: [], ...over });
const summaryOf = (text: string, facts: Fact[], over: Partial<CvDraft> = {}) =>
  verify(base({ summary: { text, factIds: facts.map((f) => f.id) }, ...over }), facts);
const bulletOf = (text: string, facts: Fact[]) =>
  verify(
    base({
      experience: [{ employer: 'Acme Ltd', role: 'Backend engineer', period: '2019', relevance: 0.7, factIds: ['f1'], bullets: [{ text, factIds: ['f1'] }] }],
    }),
    facts,
  );
// Flagged at either tier: dropped (unsupportedEntity) or questioned (ambiguousName).
const flagged = (text: string, cited: string[], allowed: string[] = ['Senior engineer']) =>
  unsupportedEntity(text, cited, allowed) ?? ambiguousName(text, cited, allowed);

describe('ADR-024 silent holes', () => {
  it('1. sentence-initial invented name is checked: "Stripe-backed engineer ..." is flagged', () => {
    const cited = ['Backend engineer at Acme Ltd, 2015-2020, built payments'];
    expect(flagged('Stripe-backed engineer with five years building payments', cited)).toContain('Stripe');
    const r = summaryOf('Stripe-backed engineer building payments', [fact('f1', cited[0])]);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'summary.text' }));
  });

  it('1b. a sentence-initial word the facts hold, and plain English openers, stay silent', () => {
    const f = [fact('f1', 'Stripe engineer, built payments, 2019')];
    expect(flagged('Stripe engineer. Built payments. Leading teams. Experienced and calm.', [f[0].text])).toBeNull();
  });

  it('2. non-ASCII capitals are visible: "Ørsted engineer" and "Инженер в Яндексе" are flagged', () => {
    expect(flagged('Ørsted engineer leading the platform', ['Platform engineer, 2019'])).toContain('Ørsted');
    expect(flagged('Инженер в Яндексе', ['Platform engineer, 2019'])).not.toBeNull();
    expect(flagged('Инженер в Яндексе', ['Инженер в Яндексе, 2019'])).toBeNull();
    expect(flagged('Worked at Ørsted', ['Engineer at Ørsted, 2019'])).toBeNull();
  });

  it('2b. a non-ASCII multi-token invented organisation DROPS', () => {
    const r = summaryOf('Worked with Ørsted Wind Power daily', [fact('f1', 'Platform engineer, 2019')]);
    expect(r.accepted.summary).toBeUndefined();
    expect(r.dropped.map((d) => d.path)).toContain('summary');
  });

  it('3. TECHNOLOGIES is gone: a lowercase technology name is not claimed to be caught (documented limit)', () => {
    expect(flagged('Built services in kotlin', ['Built services, 2019'])).toBeNull();
    // ...and a capitalised one is judged by the generic rule, no list: held -> silent, unheld -> flagged.
    expect(flagged('Built services in Kotlin', ['Built services in Kotlin, 2019'])).toBeNull();
    expect(flagged('Built services in Kotlin', ['Built services, 2019'])).toContain('Kotlin');
  });
});

describe('ADR-024 over-fires: a legitimate summary is not deleted', () => {
  it('A. "Experienced Senior Backend Developer with Python skills" is kept', () => {
    const f = [fact('f1', 'Backend developer at Acme Ltd, 2019, Python')];
    const r = summaryOf('Experienced Senior Backend Developer with Python skills', f, { targetRole: 'Engineer' });
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
    // the doubtful single word is questioned, not silent
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'summary.text' }));
  });

  it('B. "Engineer at Acme since March 2019" is kept (month names are English)', () => {
    const f = [fact('f1', 'Engineer at Acme, 2019')];
    const r = summaryOf('Engineer at Acme since March 2019', f);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
    expect(r.questions).toEqual([]);
  });

  it('C. "Engineer open to Remote roles" is kept, with a question', () => {
    const f = [fact('f1', 'Engineer at Acme, 2019')];
    const r = summaryOf('Engineer open to Remote roles', f);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'summary.text' }));
  });

  it('D. "1000 users served" is supported by a fact saying "1,000 users"; a different figure still drops', () => {
    const f = [fact('f1', 'Engineer at Acme, 2019, served 1,000 users')];
    expect(summaryOf('Engineer with 1000 users served', f).dropped).toEqual([]);
    expect(summaryOf('Engineer with 10,000 users served', f).dropped.map((d) => d.path)).toContain('summary');
    const g = [fact('f1', 'Engineer at Acme, 2019, served 1000 users')];
    expect(summaryOf('Engineer with 1,000 users served', g).dropped).toEqual([]);
  });

  it('E. a bullet "Shipped a feature in a year" with no stated period is kept', () => {
    const r = bulletOf('Shipped a feature in a year', [fact('f1', 'Backend engineer at Acme Ltd, 2019, shipped a feature')]);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience[0].bullets).toHaveLength(1);
  });
});

describe('ADR-024 tiers', () => {
  it('an unsupported multi-token capitalised sequence DROPS (injection shape)', () => {
    const r = summaryOf('Engineer at Northwind Payments', [fact('f1', 'Engineer at Acme, 2019')]);
    expect(r.accepted.summary).toBeUndefined();
    expect(r.dropped.map((d) => d.path)).toContain('summary');
  });

  it('an unsupported acronym DROPS', () => {
    const r = summaryOf('Engineer who built the QXR ledger', [fact('f1', 'Engineer at Acme, 2019')]);
    expect(r.accepted.summary).toBeUndefined();
  });

  it('a single doubtful word in a bullet keeps the bullet and raises a question', () => {
    const r = bulletOf('Built Zentrio dashboards', [fact('f1', 'Backend engineer at Acme Ltd, 2019, built dashboards')]);
    expect(r.dropped).toEqual([]);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'experience[0].bullets[0].text' }));
  });

  it('"…a decade at Stripe": dropped with no Stripe fact, kept with one', () => {
    const none = summaryOf('Senior engineer with a decade at Stripe', [fact('f1', 'Backend engineer at Acme Ltd, 2014-2024')]);
    expect(none.accepted.summary).toBeUndefined();
    const some = summaryOf('Senior engineer with a decade at Stripe', [fact('f1', 'Senior engineer at Stripe, 2014-2024')]);
    expect(some.dropped).toEqual([]);
    expect(some.accepted.summary).toBeDefined();
  });
});

describe('ADR-024 durations: envelope of the stated periods', () => {
  it('a claimed duration LONGER than the stated span is dropped (mutation: durationSupported -> true was green)', () => {
    const f = [fact('f1', 'Engineer at Acme Ltd, 2019-2021')];
    const r = summaryOf('Engineer with a decade of experience at Acme Ltd', f);
    expect(r.accepted.summary).toBeUndefined();
    expect(r.dropped.map((d) => d.path)).toContain('summary');
    expect(unsupportedEntity('Engineer with a decade at Acme Ltd', ['Engineer at Acme Ltd, 2019-2021'])).toContain('duration');
  });

  it('a real ten-year career with a gap is kept (sum of periods was 8)', () => {
    const f = [fact('f1', 'Engineer at Acme Ltd, 2010-2014'), fact('f2', 'Engineer at Acme Ltd, 2016-2020')];
    const r = summaryOf('Engineer with a decade at Acme Ltd', f);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toBeDefined();
  });

  it('overlapping periods are not double-counted (sum was 10, envelope is 6)', () => {
    const f = [fact('f1', 'Engineer at Acme Ltd, 2019-2024'), fact('f2', 'Engineer at Acme Ltd, 2020-2025')];
    const r = summaryOf('Engineer with a decade at Acme Ltd', f);
    expect(r.accepted.summary).toBeUndefined();
  });
});
