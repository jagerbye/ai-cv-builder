import { describe, it, expect } from 'vitest';
import { unsupportedPhrase } from './verify-entities.js';

// ADR-023/025: the vocabulary is the text of the cited facts. No list of organisations is consulted. The detector is
// best-effort and only ever feeds a QUESTION on prose; it never decides a deletion.

describe('unsupportedPhrase — closed world over the cited facts', () => {
  it('returns null when every capitalised name in the text is held by a cited fact', () => {
    expect(unsupportedPhrase('Backend engineer at Acme Ltd', ['Backend engineer at Acme Ltd, 2019'])).toBeNull();
  });

  it('flags an organisation no cited fact names, though it is on no list', () => {
    const r = unsupportedPhrase('Senior engineer at Stripe', ['Senior engineer, 2019']);
    expect(r).toContain('Stripe');
  });

  it('treats a listed and an unlisted organisation alike', () => {
    expect(unsupportedPhrase('Senior engineer at Google', ['Senior engineer, 2019'])).not.toBeNull();
    expect(unsupportedPhrase('Senior engineer at Stripe', ['Senior engineer, 2019'])).not.toBeNull();
  });

  it('flags an unlisted acronym that no cited fact contains', () => {
    expect(unsupportedPhrase('Built the QXR ledger', ['Built the ledger'])).toContain('QXR');
  });

  it('flags a made-up product name that no cited fact contains', () => {
    expect(unsupportedPhrase('Built Zentrio dashboards', ['Built dashboards'])).toContain('Zentrio');
  });

  it('accepts a made-up product name that a cited fact holds', () => {
    expect(unsupportedPhrase('Built Zentrio dashboards', ['Built Zentrio dashboards'])).toBeNull();
  });

  it('does not treat sentence-initial English openers as entities', () => {
    expect(unsupportedPhrase('Built payments. Mentored juniors.', ['Built payments and mentored juniors'])).toBeNull();
  });

  it('flags a figure no cited fact holds', () => {
    expect(unsupportedPhrase('Led 200 engineers', ['Led a team'])).toContain('200');
  });

  it('flags a duration no cited fact states verbatim, even when the periods would derive it', () => {
    const r = unsupportedPhrase('Engineer with five years at Acme Ltd', ['Engineer at Acme Ltd, 2019-2024']);
    expect(r).toContain('five years');
  });

  it('accepts a duration a cited fact states verbatim', () => {
    expect(unsupportedPhrase('Engineer with five years at Acme Ltd', ['Engineer at Acme Ltd, five years'])).toBeNull();
  });
});
