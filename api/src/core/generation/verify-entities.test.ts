import { describe, it, expect } from 'vitest';
import { unsupportedEntity } from './verify-entities.js';

// ADR-023: the vocabulary is the text of the cited facts. No list of organisations is consulted, so an organisation
// nobody enumerated is flagged exactly like one everybody has heard of. The stoplist is about English only.

describe('unsupportedEntity — closed world over the cited facts (ADR-023)', () => {
  it('returns null when every capitalised name in the text is held by a cited fact', () => {
    expect(unsupportedEntity('Backend engineer at Acme Ltd', ['Backend engineer at Acme Ltd, 2019'])).toBeNull();
  });

  it('flags an organisation no cited fact names, though it is on no list (the defect ADR-023 deletes)', () => {
    const r = unsupportedEntity('Senior engineer at Stripe', ['Senior engineer, 2019']);
    expect(r).not.toBeNull();
    expect(r).toContain('Stripe');
  });

  it('treats a listed and an unlisted organisation alike', () => {
    const listed = unsupportedEntity('Senior engineer at Google', ['Senior engineer, 2019']);
    const unlisted = unsupportedEntity('Senior engineer at Stripe', ['Senior engineer, 2019']);
    expect(listed).not.toBeNull();
    expect(unlisted).not.toBeNull();
  });

  it('flags an unlisted acronym that no cited fact contains', () => {
    const r = unsupportedEntity('Built the QXR ledger', ['Built the ledger']);
    expect(r).not.toBeNull();
    expect(r).toContain('QXR');
  });

  it('flags a made-up product name that no cited fact contains', () => {
    const r = unsupportedEntity('Built Zentrio dashboards', ['Built dashboards']);
    expect(r).not.toBeNull();
    expect(r).toContain('Zentrio');
  });

  it('accepts a made-up product name that a cited fact holds', () => {
    expect(unsupportedEntity('Built Zentrio dashboards', ['Built Zentrio dashboards'])).toBeNull();
  });

  it('does not treat sentence-initial capitals as entities (stoplist, ADR-023 point 2)', () => {
    expect(unsupportedEntity('Built payments. Mentored juniors.', ['Built payments and mentored juniors'])).toBeNull();
  });

  it('flags a figure no cited fact holds, as ADR-022 requires', () => {
    const r = unsupportedEntity('Led 200 engineers', ['Led a team']);
    expect(r).not.toBeNull();
    expect(r).toContain('200');
  });
});
