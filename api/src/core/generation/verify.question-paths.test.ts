import { describe, it, expect } from 'vitest';
import { verify } from './verify.js';
import type { CvDraft, Fact } from './types.js';

// QA-05 (sprint 001, ADR-013, api-contracts.md C-006). A question's `path` names the FIELD the question is
// about, so the web editor can align the question beside that field: `summary.text`, `skills[3].name`,
// `experience[1].period`, `experience[0].bullets[2].text`, `education[0].period`. Whole items (an entry, a
// skill, a summary) never appear as a question path. Dropped-item paths (`DroppedItem.path`) are NOT
// questions and keep their item-level spelling; the binding test in verify.test.ts relies on that.

const fact = (id: string, text: string, kind = 'achievement'): Fact => ({
  id,
  kind,
  text,
  sourceQuote: text,
  source: 'document',
});

const base = (over: Partial<CvDraft> = {}): CvDraft => ({
  targetRole: 'Backend engineer',
  experience: [],
  education: [],
  skills: [],
  ...over,
});

const facts = [
  fact('f1', 'Backend engineer at Acme Ltd, 2019, built APIs'),
  fact('f2', 'BSc at Warsaw University, 2010-2014', 'education'),
];

const validEntry = {
  employer: 'Acme Ltd',
  role: 'Backend engineer',
  period: '2019',
  relevance: 0.8,
  factIds: ['f1'],
  bullets: [] as { text: string; factIds: string[] }[],
};

const pathsOf = (r: { questions: { path: string }[] }): string[] => r.questions.map((q) => q.path);

describe('verify — question paths name the field (QA-05, C-006 path grammar)', () => {
  it('summary with unknown citations is kept and raises summary.text (unverifiable, ADR-022)', () => {
    const r = verify(base({ summary: { text: 'Backend engineer at Acme Ltd', factIds: ['f404'] } }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.summary).toEqual({ text: 'Backend engineer at Acme Ltd', factIds: ['f404'] });
    expect(pathsOf(r)).toEqual(['summary.text']);
    expect(r.questions[0]).toMatchObject({ path: 'summary.text', reason: 'unverifiable' });
  });

  it('summary with no citations raises summary.text (missing)', () => {
    const r = verify(base({ summary: { text: 'Backend engineer at Acme Ltd', factIds: [] } }), facts);
    expect(pathsOf(r)).toEqual(['summary.text']);
    expect(r.questions[0]).toMatchObject({ path: 'summary.text', reason: 'missing' });
  });

  it('a skill whose name no cited fact holds is STILL dropped with its question (ADR-025 Amendment A)', () => {
    const r = verify(base({ skills: [{ name: 'Kubernetes', factIds: ['f1'] }] }), facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['skills[0]']);
    expect(r.accepted.skills).toEqual([]);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'skills[0].name', reason: 'unverifiable' }));
  });

  it('skill with unknown citations raises skills[3].name (unverifiable), index preserved', () => {
    const skills = [
      { name: 'Alpha', factIds: [] },
      { name: 'Beta', factIds: [] },
      { name: 'Gamma', factIds: [] },
      { name: 'Delta', factIds: ['f404'] },
    ];
    const r = verify(base({ skills }), facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['skills[0]', 'skills[1]', 'skills[2]', 'skills[3]']);
    expect(pathsOf(r)).toEqual(['skills[0].name', 'skills[1].name', 'skills[2].name', 'skills[3].name']);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'skills[3].name', reason: 'unverifiable' }));
  });

  it('experience period that no cited fact holds keeps experience[1] and raises experience[1].period (missing, priority 2, ADR-022)', () => {
    const entry1 = { ...validEntry, period: '2015-2016' };
    const r = verify(base({ experience: [validEntry, entry1] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience.map((e) => e.period)).toEqual(['2019', '2015-2016']);
    expect(pathsOf(r)).toEqual(['experience[1].period']);
    expect(r.questions[0]).toMatchObject({ path: 'experience[1].period', reason: 'missing', priority: 2 });
  });

  it('unsupported bullet raises experience[0].bullets[2].text (unverifiable)', () => {
    const entry = {
      ...validEntry,
      bullets: [
        { text: 'Built APIs at Acme Ltd', factIds: ['f1'] },
        { text: 'Built APIs at Acme Ltd', factIds: ['f1'] },
        { text: 'Built APIs at Acme Ltd', factIds: ['f404'] },
      ],
    };
    const r = verify(base({ experience: [entry] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience[0].bullets).toHaveLength(3);
    expect(pathsOf(r)).toEqual(['experience[0].bullets[2].text']);
    expect(r.questions[0]).toMatchObject({ path: 'experience[0].bullets[2].text', reason: 'unverifiable', priority: 2 });
  });

  it('bullet with no citations raises experience[0].bullets[0].text (missing)', () => {
    const entry = { ...validEntry, bullets: [{ text: 'Built APIs at Acme Ltd', factIds: [] }] };
    const r = verify(base({ experience: [entry] }), facts);
    expect(r.dropped).toEqual([]);
    expect(pathsOf(r)).toEqual(['experience[0].bullets[0].text']);
    expect(r.questions[0]).toMatchObject({ reason: 'missing', priority: 2 });
  });

  it('education period that no cited fact holds raises education[0].period (missing, priority 2)', () => {
    const r = verify(
      base({ education: [{ institution: 'Warsaw University', period: '2001-2005', factIds: ['f2'] }] }),
      facts,
    );
    expect(pathsOf(r)).toEqual(['education[0].period']);
    expect(r.questions[0]).toMatchObject({ reason: 'missing', priority: 2 });
  });

  it('education with no citations raises education[0].institution, not the entry path', () => {
    const r = verify(base({ education: [{ institution: 'Warsaw University', period: '2010-2014', factIds: [] }] }), facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['education[0]']);
    expect(pathsOf(r)).toEqual(['education[0].institution']);
    expect(r.questions[0]).toMatchObject({ reason: 'missing', priority: 1 });
  });

  it('experience entry with no citations raises experience[0].employer, not the entry path', () => {
    const r = verify(base({ experience: [{ ...validEntry, factIds: [] }] }), facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0]']);
    expect(pathsOf(r)).toEqual(['experience[0].employer']);
    expect(r.questions[0]).toMatchObject({ reason: 'missing' });
  });

  it('experience entry with an unknown citation raises experience[0].employer (unverifiable)', () => {
    const r = verify(base({ experience: [{ ...validEntry, factIds: ['f404'] }] }), facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0]']);
    expect(pathsOf(r)).toEqual(['experience[0].employer']);
    expect(r.questions[0]).toMatchObject({ reason: 'unverifiable' });
  });

  it('vague role keeps the entry and raises experience[0].role (vague, priority 3)', () => {
    const r = verify(base({ experience: [{ ...validEntry, role: 'Platform engineer' }] }), facts);
    expect(r.dropped).toEqual([]);
    expect(pathsOf(r)).toEqual(['experience[0].role']);
    expect(r.questions[0]).toMatchObject({ reason: 'vague', priority: 3 });
  });

  it('every question path in a mixed draft matches the C-006 field grammar', () => {
    const draft = base({
      summary: { text: 'Backend engineer at Acme Ltd', factIds: ['f404'] },
      skills: [{ name: 'Delta', factIds: [] }],
      experience: [
        { ...validEntry, factIds: [] },
        {
          ...validEntry,
          period: '2019',
          bullets: [{ text: 'Built APIs at Acme Ltd', factIds: ['f404'] }],
        },
      ],
      education: [{ institution: 'Warsaw University', period: '2001-2005', factIds: ['f2'] }],
    });
    const r = verify(draft, facts);
    const grammar =
      /^(summary\.text|contact\.(fullName|email|phone|location)|skills\[\d+\]\.name|experience\[\d+\]\.(employer|role|period)|experience\[\d+\]\.bullets\[\d+\]\.text|education\[\d+\]\.(institution|period))$/;
    expect(r.questions.length).toBeGreaterThan(0);
    for (const q of r.questions) {
      expect(q.path, `question path "${q.path}" must name a field`).toMatch(grammar);
    }
    expect(pathsOf(r).sort()).toEqual(
      [
        'education[0].period',
        'experience[0].employer',
        'experience[1].bullets[0].text',
        'skills[0].name',
        'summary.text',
      ].sort(),
    );
  });
});

// ADR-026: priority is what ignoring the question costs, whatever the reason says.
describe('verify: priority follows what is lost (ADR-026)', () => {
  it('a dropped skill and a dropped contact field are 1; flagged summary prose and a kept uncited bullet are 2', () => {
    const entry = { ...validEntry, bullets: [{ text: 'Built APIs at Acme Ltd', factIds: [] }] };
    const r = verify(
      base({
        skills: [{ name: 'Haskell', factIds: ['f1'] }],
        contact: { email: { value: 'x@nowhere.test', factIds: ['f1'] } },
        summary: { text: 'A decade at Stripe', factIds: ['f1'] },
        experience: [entry],
      }),
      facts,
    );
    const byPath = Object.fromEntries(r.questions.map((q) => [q.path, q.priority]));
    expect(byPath['skills[0].name']).toBe(1);
    expect(byPath['contact.email']).toBe(1);
    expect(byPath['summary.text']).toBe(2);
    expect(byPath['experience[0].bullets[0].text']).toBe(2);
  });
});
