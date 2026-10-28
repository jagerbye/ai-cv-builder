import { describe, it, expect } from 'vitest';
import { verify } from './verify.js';
import type { CvDraft, Fact } from './types.js';

// T-12 (CVB-12). verify(draft, facts) is pure: no LLM, no clock, no randomness (ADR-002).
// Spec §3.4 (groundedness) and §3.5 (questions). Modelling choices pinned here, see lane-07.md:
//  - an experience entry has no factIds of its own; its cited facts are the union of its bullets' factIds;
//  - experience.employer and experience.period must occur in those cited facts (period matched as one token,
//    so "2017-2019" is not supported by facts that mention 2017 and 2019 separately);
//  - experience.role is matched as a substring of the cited facts; a miss keeps the entry and raises a 'vague' question;
//  - named technologies are whole words from the verifier lexicon (Kafka, PostgreSQL, Go, Kubernetes, ...);
//  - reasons: empty factIds -> 'missing'; unknown factIds -> 'unverifiable'; unmatched employer/period -> 'missing';
//    any other unmatched entity -> 'unverifiable'; a vague role -> 'vague'.
//  - priority: missing employer/period = 1, unverifiable = 2, vague = 3 (lower is asked first).

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

describe('verify — citation rule (ADR-002)', () => {
  it('drops a bullet with empty factIds and raises a missing-reason question on its path', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const draft = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.8,
          bullets: [
            { text: 'Built APIs at Acme Ltd', factIds: [] },
            { text: 'Built APIs at Acme Ltd', factIds: ['f1'] },
          ],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0].bullets[0]']);
    expect(r.accepted.experience[0].bullets).toEqual([{ text: 'Built APIs at Acme Ltd', factIds: ['f1'] }]);
    expect(r.questions).toContainEqual(
      expect.objectContaining({ path: 'experience[0].bullets[0]', reason: 'missing' }),
    );
  });

  it('drops summary and skill items that cite unknown factIds, with an unverifiable question each', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const draft = base({
      summary: { text: 'Backend engineer at Acme Ltd', factIds: ['f404'] },
      skills: [
        { name: 'Leadership', factIds: ['f404'] },
        { name: 'Mentoring', factIds: [] },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path).sort()).toEqual(['skills[0]', 'skills[1]', 'summary']);
    expect(r.accepted.summary).toBeUndefined();
    expect(r.accepted.skills).toEqual([]);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'summary', reason: 'unverifiable' }));
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'skills[0]', reason: 'unverifiable' }));
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'skills[1]', reason: 'missing' }));
  });

  it('keeps a fully cited summary (positive control)', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const summary = { text: 'Backend engineer at Acme Ltd since 2019', factIds: ['f1'] };
    const r = verify(base({ summary }), facts);
    expect(r.accepted.summary).toEqual(summary);
    expect(r.dropped).toEqual([]);
  });
});

describe('verify — entity rule (spec §3.4)', () => {
  it('drops an entry whose employer is not in its cited facts and asks for the employer', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const draft = base({
      experience: [
        {
          employer: 'Globex',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.9,
          bullets: [{ text: 'Built APIs', factIds: ['f1'] }],
        },
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.5,
          bullets: [{ text: 'Built APIs at Acme Ltd', factIds: ['f1'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0]']);
    expect(r.accepted.experience.map((e) => e.employer)).toEqual(['Acme Ltd']);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'experience[0].employer', reason: 'missing' }));
  });

  it('drops an entry whose period bridges a gap between two jobs, and keeps the grounded en-dash period', () => {
    const facts = [
      fact('f1', 'Backend Developer at Acme Ltd, 2015-2017', 'employment'),
      fact('f2', 'Backend Developer at Beta Corp, 2019-2023', 'employment'),
    ];
    const draft = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend Developer',
          period: '2015–2017',
          relevance: 0.6,
          bullets: [{ text: 'Worked at Acme Ltd', factIds: ['f1'] }],
        },
        {
          employer: 'Beta Corp',
          role: 'Backend Developer',
          period: '2017-2019',
          relevance: 0.5,
          bullets: [{ text: 'Built tools at Beta Corp', factIds: ['f2'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[1]']);
    expect(r.accepted.experience).toHaveLength(1);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'experience[1].period', reason: 'missing' }));
  });

  it('drops a bullet whose number no cited fact contains, and matches 20 % against 20%', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, cut costs by 20% in 2021', 'employment')];
    const draft = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2021',
          relevance: 0.7,
          bullets: [
            { text: 'Cut costs by 25%', factIds: ['f1'] },
            { text: 'Cut costs by 20 %', factIds: ['f1'] },
          ],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0].bullets[0]']);
    expect(r.accepted.experience[0].bullets.map((b) => b.text)).toEqual(['Cut costs by 20 %']);
    expect(r.questions).toContainEqual(
      expect.objectContaining({ path: 'experience[0].bullets[0]', reason: 'unverifiable' }),
    );
  });

  it('drops a bullet naming a technology no cited fact names, and matches PostgreSQL case-insensitively', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2021, stored orders in PostgreSQL')];
    const draft = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2021',
          relevance: 0.7,
          bullets: [
            { text: 'Scaled the service on Kafka', factIds: ['f1'] },
            { text: 'Stored orders in postgresql', factIds: ['f1'] },
          ],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0].bullets[0]']);
    expect(r.accepted.experience[0].bullets.map((b) => b.text)).toEqual(['Stored orders in postgresql']);
  });

  it('does not match a technology inside a longer word ("Go" is not in "Google")', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2021, worked at Google')];
    const draft = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2021',
          relevance: 0.7,
          bullets: [{ text: 'Built services in Go', factIds: ['f1'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0].bullets[0]']);
  });

  it('accepts a bullet with no named entity that cites a valid fact (no false positives)', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2021, mentored juniors')];
    const draft = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2021',
          relevance: 0.7,
          bullets: [{ text: 'Mentored junior engineers', factIds: ['f1'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience[0].bullets).toHaveLength(1);
  });
});

describe('verify — questions (spec §3.5)', () => {
  it('binds a question to every dropped item (its path or a path under it)', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const draft = base({
      experience: [
        {
          employer: 'Globex',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.9,
          bullets: [{ text: 'Built APIs', factIds: ['f1'] }],
        },
      ],
      skills: [{ name: 'Leadership', factIds: ['f404'] }],
    });
    const r = verify(draft, facts);
    expect(r.dropped.length).toBeGreaterThan(0);
    for (const d of r.dropped) {
      expect(r.questions.some((x) => x.path === d.path || x.path.startsWith(`${d.path}.`))).toBe(true);
    }
  });

  it('ranks a missing employer above a vague role, and keeps the vague entry rather than deleting it', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const draft = base({
      experience: [
        {
          employer: 'Globex',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.9,
          bullets: [{ text: 'Built APIs', factIds: ['f1'] }],
        },
        {
          employer: 'Acme Ltd',
          role: 'Lead Engineer',
          period: '2019',
          relevance: 0.5,
          bullets: [{ text: 'Built APIs at Acme Ltd', factIds: ['f1'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    const employer = r.questions.find((x) => x.path === 'experience[0].employer') as { priority: number };
    const vague = r.questions.find((x) => x.path === 'experience[1].role') as { priority: number; reason: string };
    expect(vague.reason).toBe('vague');
    expect(employer.priority).toBeLessThan(vague.priority);
    expect(r.questions[0].path).toBe('experience[0].employer');
    expect(r.accepted.experience.map((e) => e.role)).toEqual(['Lead Engineer']);
  });

  it('caps open questions at 12 and keeps the missing employer while dropping the vague question', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const skillNames = [
      'Communication', 'Planning', 'Mentoring', 'Teamwork', 'Estimation', 'Documentation',
      'Code review', 'Testing', 'Debugging', 'Monitoring', 'Delivery', 'Coordination',
    ];
    const draft = base({
      experience: [
        {
          employer: 'Globex',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.9,
          bullets: [{ text: 'Built APIs', factIds: ['f1'] }],
        },
        {
          employer: 'Acme Ltd',
          role: 'Lead Engineer',
          period: '2019',
          relevance: 0.5,
          bullets: [{ text: 'Built APIs at Acme Ltd', factIds: ['f1'] }],
        },
      ],
      skills: skillNames.map((name) => ({ name, factIds: ['f404'] })),
    });
    const r = verify(draft, facts);
    expect(r.questions).toHaveLength(12);
    expect(r.questions[0].path).toBe('experience[0].employer');
    expect(r.questions.some((x) => (x as { reason?: string }).reason === 'vague')).toBe(false);
    expect(r.questions.filter((x) => (x as { reason?: string }).reason === 'unverifiable')).toHaveLength(11);
  });
});

describe('verify — purity and contract', () => {
  const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
  const draft = base({
    experience: [
      {
        employer: 'Globex',
        role: 'Backend engineer',
        period: '2019',
        relevance: 0.9,
        bullets: [{ text: 'Built APIs', factIds: ['f1'] }],
      },
      {
        employer: 'Acme Ltd',
        role: 'Backend engineer',
        period: '2019',
        relevance: 0.5,
        bullets: [{ text: 'Built APIs at Acme Ltd', factIds: ['f1'] }],
      },
    ],
  });

  it('returns a plain result synchronously with exactly accepted, questions and dropped', () => {
    const r = verify(draft, facts);
    expect(r).not.toBeInstanceOf(Promise);
    expect(Object.keys(r).sort()).toEqual(['accepted', 'dropped', 'questions']);
  });

  it('does not mutate the draft or the facts', () => {
    const d0 = structuredClone(draft);
    const f0 = structuredClone(facts);
    verify(draft, facts);
    expect(draft).toEqual(d0);
    expect(facts).toEqual(f0);
  });

  it('is deterministic: the same input gives the same output', () => {
    expect(verify(draft, facts)).toEqual(verify(draft, facts));
  });

  it('accepts a fully grounded draft unchanged with no questions', () => {
    const clean = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.5,
          bullets: [{ text: 'Built APIs at Acme Ltd', factIds: ['f1'] }],
        },
      ],
    });
    const r = verify(clean, facts);
    expect(r.accepted).toEqual(clean);
    expect(r.dropped).toEqual([]);
    expect(r.questions).toEqual([]);
  });
});
