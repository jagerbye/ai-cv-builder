import { describe, it, expect } from 'vitest';
import { verify } from './verify.js';
import type { CvDraft, Fact } from './types.js';

// ADR-027 decision 2. "A cited fact must name it" means a WORD, not a substring. An employer, an institution and a
// skill are discrete claims (ADR-025): the cited facts must name them as a whole word, or the item is dropped and
// questioned. Each reproduction below was accepted by the loose containsText test before the fix. The positive
// controls are legitimate matches and must stay accepted.

const fact = (id: string, text: string, kind = 'achievement'): Fact => ({
  id,
  kind,
  text,
  sourceQuote: text,
  source: 'document',
});

const base = (over: Partial<CvDraft> = {}): CvDraft => ({
  targetRole: 'Engineer',
  experience: [],
  education: [],
  skills: [],
  ...over,
});

describe('verify — an employer must be named by a cited fact as a word (ADR-027)', () => {
  it('employer "Amazon" is NOT named by "Deployed on Amazon Web Services": the entry is dropped and questioned', () => {
    const facts = [fact('f1', 'Deployed on Amazon Web Services, 2019')];
    const r = verify(
      base({ experience: [{ employer: 'Amazon', role: 'Engineer', period: '2019', relevance: 0.5, factIds: ['f1'], bullets: [] }] }),
      facts,
    );
    expect(r.accepted.experience).toEqual([]);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0]']);
    expect(r.questions.filter((q) => q.path === 'experience[0].employer')).toHaveLength(1);
  });

  it('positive control: employer "Acme Ltd" named by "Backend engineer at Acme Ltd, 2019" is accepted', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const r = verify(
      base({ experience: [{ employer: 'Acme Ltd', role: 'Backend engineer', period: '2019', relevance: 0.5, factIds: ['f1'], bullets: [] }] }),
      facts,
    );
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience.map((e) => e.employer)).toEqual(['Acme Ltd']);
  });
});

describe('verify — an institution must be named by a cited fact as a word (ADR-027)', () => {
  it('institution "MIT" is NOT named by "Submitted 40 patches": the education entry is dropped and questioned', () => {
    const facts = [fact('f1', 'Submitted 40 patches in 2015', 'education')];
    const r = verify(base({ education: [{ institution: 'MIT', period: '2015', factIds: ['f1'] }] }), facts);
    expect(r.accepted.education).toEqual([]);
    expect(r.dropped.map((d) => d.path)).toEqual(['education[0]']);
    expect(r.questions.filter((q) => q.path === 'education[0].institution')).toHaveLength(1);
  });

  it('positive control: institution "MIT" named by "BSc at MIT, 2010-2014" is accepted', () => {
    const facts = [fact('f1', 'BSc at MIT, 2010-2014', 'education')];
    const r = verify(base({ education: [{ institution: 'MIT', period: '2010-2014', factIds: ['f1'] }] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.education.map((e) => e.institution)).toEqual(['MIT']);
  });
});

describe('verify — a skill must be named by a cited fact as a word (ADR-027)', () => {
  const facts = [fact('f1', 'Wrote JavaScript at Google; trusted with NoSQL')];

  // Each of these is a substring of the fact and none is a word in it: Go (Google), Java (JavaScript),
  // C (JavaScript), SQL (NoSQL), Rust (trusted).
  it.each(['Go', 'Java', 'C', 'SQL', 'Rust'])('skill "%s" is NOT named by the cited fact: dropped and questioned', (name) => {
    const r = verify(base({ skills: [{ name, factIds: ['f1'] }] }), facts);
    expect(r.accepted.skills).toEqual([]);
    expect(r.dropped.map((d) => d.path)).toEqual(['skills[0]']);
    expect(r.questions.filter((q) => q.path === 'skills[0].name')).toHaveLength(1);
  });

  it('positive control: skill "Go" named by "Wrote Go services at Acme" is accepted', () => {
    const r = verify(base({ skills: [{ name: 'Go', factIds: ['f2'] }] }), [fact('f2', 'Wrote Go services at Acme')]);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.skills.map((s) => s.name)).toEqual(['Go']);
  });

  it('positive control: skill "SQL" named by "Wrote SQL queries" is accepted', () => {
    const r = verify(base({ skills: [{ name: 'SQL', factIds: ['f2'] }] }), [fact('f2', 'Wrote SQL queries')]);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.skills.map((s) => s.name)).toEqual(['SQL']);
  });
});

// ADR-028 decision 1. A hyphen, slash or underscore followed by a letter or digit continues the name, exactly as a
// letter does: "Acme-Labs" is not "Acme". Each case below was accepted before the fix.
describe('verify — a name that continues through - / _ is a different name (ADR-028)', () => {
  const exp = (employer: string, text: string) =>
    verify(base({ experience: [{ employer, role: 'Engineer', period: '2019', relevance: 0.5, factIds: ['f1'], bullets: [] }] }), [fact('f1', text)]);

  it.each([
    ['Acme', 'Worked at Acme-Labs, 2019'],
    ['Acme', 'Worked at Acme/Labs, 2019'],
    ['Acme', 'Worked at Acme_Labs, 2019'],
  ])('employer "%s" is NOT named by "%s": dropped and questioned', (employer, text) => {
    const r = exp(employer, text);
    expect(r.accepted.experience).toEqual([]);
    expect(r.questions.filter((q) => q.path === 'experience[0].employer')).toHaveLength(1);
  });

  it('institution "MIT" is NOT named by "MIT-IBM Watson AI Lab"', () => {
    const r = verify(base({ education: [{ institution: 'MIT', period: '2015', factIds: ['f1'] }] }), [fact('f1', 'Research at MIT-IBM Watson AI Lab, 2015', 'education')]);
    expect(r.accepted.education).toEqual([]);
    expect(r.questions.filter((q) => q.path === 'education[0].institution')).toHaveLength(1);
  });

  it.each([['C', 'Led C-level strategy'], ['Go', 'Ran the Go-Live']])('skill "%s" is NOT named by "%s"', (name, text) => {
    const r = verify(base({ skills: [{ name, factIds: ['f1'] }] }), [fact('f1', text)]);
    expect(r.accepted.skills).toEqual([]);
    expect(r.questions.filter((q) => q.path === 'skills[0].name')).toHaveLength(1);
  });

  it.each([
    ['fullName', 'Jane Doe', 'Contact: Jane Doe-Smith'],
    ['location', 'Paris', 'Based in Paris-Saclay'],
  ] as const)('contact %s "%s" is NOT named by "%s"', (key, value, text) => {
    const r = verify(base({ contact: { [key]: { value, factIds: ['f1'] } } }), [fact('f1', text, 'contact')]);
    expect(r.accepted.contact).toBeUndefined();
    expect(r.dropped.map((d) => d.path)).toEqual([`contact.${key}`]);
  });

  it('positive controls: a hyphen or slash NOT followed by a letter or digit still ends the name', () => {
    expect(exp('Acme', 'Worked at Acme - Labs lead, 2019').accepted.experience).toHaveLength(1);
    expect(exp('Acme', 'Worked at Acme, 2019').accepted.experience).toHaveLength(1);
    expect(exp('Acme', 'Worked at Acme/ 2019').accepted.experience).toHaveLength(1);
    const r = verify(base({ skills: [{ name: 'Go', factIds: ['f1'] }] }), [fact('f1', 'Wrote Go, Rust')]);
    expect(r.accepted.skills).toHaveLength(1);
  });
});

// ADR-028 decision 2. The role is a title: "Engineer" is not "Engineering Manager".
describe('verify — a job title must be named by a cited fact as a phrase (ADR-028)', () => {
  const roleQuestions = (role: string, text: string) =>
    verify(
      base({ experience: [{ employer: 'Acme', role, period: '2019', relevance: 0.5, factIds: ['f1'], bullets: [] }] }),
      [fact('f1', text)],
    ).questions.filter((q) => q.path === 'experience[0].role');

  it('role "Engineer" is NOT named by "Engineering Manager at Acme, 2019": asked', () => {
    expect(roleQuestions('Engineer', 'Engineering Manager at Acme, 2019')).toHaveLength(1);
  });
  it('role "Lead Engineer" is NOT named by "Lead Engineering Analyst at Acme, 2019": asked', () => {
    expect(roleQuestions('Lead Engineer', 'Lead Engineering Analyst at Acme, 2019')).toHaveLength(1);
  });
  it('positive control: role "Lead Engineer" named by "Lead Engineer at Acme, 2019" raises no role question', () => {
    expect(roleQuestions('Lead Engineer', 'Lead Engineer at Acme, 2019')).toEqual([]);
  });
  it('positive control: role "Engineer" named by "Backend engineer at Acme, 2019" raises no role question', () => {
    expect(roleQuestions('Engineer', 'Backend engineer at Acme, 2019')).toEqual([]);
  });
});

// ADR-028 decision 4: the stated limit. The strict direction is right and cannot be improved deterministically.
describe('verify — known limit: an employer that is the first word of a longer capitalised name (ADR-028)', () => {
  it('employer "Acme" against "Acme Warsaw" is dropped and questioned, the same rule that drops "Amazon" against "Amazon Web Services"', () => {
    const r = verify(
      base({ experience: [{ employer: 'Acme', role: 'Engineer', period: '2019', relevance: 0.5, factIds: ['f1'], bullets: [] }] }),
      [fact('f1', 'Engineer at Acme Warsaw, 2019')],
    );
    expect(r.accepted.experience).toEqual([]);
    expect(r.questions.filter((q) => q.path === 'experience[0].employer')).toHaveLength(1);
  });
});

// ADR-028 separator residue. Each symbol below leaked before the fix: the name ended at the symbol and was grounded.
describe('verify — a name joined by & + # U+2212 or a doubled separator is a different name (ADR-028)', () => {
  const emp = (employer: string, text: string) =>
    verify(base({ experience: [{ employer, role: 'Engineer', period: '2019', relevance: 0.5, factIds: ['f1'], bullets: [] }] }), [fact('f1', text)]);
  const skill = (name: string, text: string) => verify(base({ skills: [{ name, factIds: ['f1'] }] }), [fact('f1', text)]);

  it('employer "Acme" is NOT named by "Acme&Co" (ampersand)', () => {
    expect(emp('Acme', 'Worked at Acme&Co, 2019').accepted.experience).toEqual([]);
  });
  it('skill "C" is NOT named by "C++" (plus)', () => {
    expect(skill('C', 'Wrote C++ services').accepted.skills).toEqual([]);
  });
  it('skill "C" is NOT named by "C#" (hash)', () => {
    expect(skill('C', 'Wrote C# services').accepted.skills).toEqual([]);
  });
  it('employer "Acme" is NOT named by "Acme\u2212Labs" (U+2212 minus sign)', () => {
    expect(emp('Acme', 'Worked at Acme\u2212Labs, 2019').accepted.experience).toEqual([]);
  });
  it('employer "Acme" is NOT named by "Acme--Labs" (doubled hyphen)', () => {
    expect(emp('Acme', 'Worked at Acme--Labs, 2019').accepted.experience).toEqual([]);
  });
  it('employer "Acme" is NOT named by "Acme/-Labs" (slash then hyphen)', () => {
    expect(emp('Acme', 'Worked at Acme/-Labs, 2019').accepted.experience).toEqual([]);
  });
  it('skill "C++" is still named by its own cited fact "Wrote C++ services"', () => {
    expect(skill('C++', 'Wrote C++ services').accepted.skills).toHaveLength(1);
  });
  it('positive control: "Acme\'s platform" still grounds employer "Acme" (possessive, a stated limit)', () => {
    expect(emp('Acme', "Built Acme's platform, 2019").accepted.experience).toHaveLength(1);
  });
  it('positive control: "Wrote Go, Rust" still grounds skill "Go"', () => {
    expect(skill('Go', 'Wrote Go, Rust').accepted.skills).toHaveLength(1);
  });
  it('positive control: "Acme - Labs" still grounds employer "Acme"', () => {
    expect(emp('Acme', 'Worked at Acme - Labs, 2019').accepted.experience).toHaveLength(1);
  });
});
