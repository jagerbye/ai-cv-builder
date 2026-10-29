import { describe, it, expect } from 'vitest';
import { verify } from './verify.js';
import type { CvDraft, Fact } from './types.js';

// T-12 (CVB-12), reopened by ADR-013. verify(draft, facts) is pure: no LLM, no clock, no randomness (ADR-002).
// Spec §3.4 (groundedness) and §3.5 (questions). Modelling choices pinned here (ADR-013 supersedes ADR-002 amendment A):
//  - experience[] and education[] carry factIds (types.ts, T-11). An experience entry's employer, role and period,
//    and an education entry's institution and period, must occur in the text of the entry's OWN cited facts;
//  - a bullet is checked against its own cited facts plus its parent entry's facts (ADR-002: one level, parent to child);
//  - experience.role is matched as a substring of the entry's cited facts; a miss keeps the entry and raises a 'vague' question;
//  - period is matched as one token, so "2017-2019" is not supported by facts that mention 2017 and 2019 separately;
//  - named technologies are whole words from the verifier lexicon (Kafka, PostgreSQL, Go, Kubernetes, ...);
//  - reasons: empty factIds -> 'missing'; unknown factIds -> 'unverifiable'; unmatched employer/period/institution -> 'missing';
//    any other unmatched entity -> 'unverifiable'; a vague role -> 'vague'.
//  - priority: missing employer/period/institution = 1, unverifiable = 2, vague = 3 (lower is asked first).

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
          factIds: ['f1'],
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
      expect.objectContaining({ path: 'experience[0].bullets[0].text', reason: 'missing' }),
    );
  });

  it('drops unsupported skills and keeps a summary with an unknown citation, flagged as summary.text (ADR-022)', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const summary = { text: 'Backend engineer at Acme Ltd', factIds: ['f404'] };
    const draft = base({
      summary,
      skills: [
        { name: 'Leadership', factIds: ['f404'] },
        { name: 'Mentoring', factIds: [] },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path).sort()).toEqual(['skills[0]', 'skills[1]']);
    expect(r.accepted.summary).toEqual(summary);
    expect(r.accepted.skills).toEqual([]);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'summary.text', reason: 'unverifiable' }));
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'skills[0].name', reason: 'unverifiable' }));
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'skills[1].name', reason: 'missing' }));
  });

  it('keeps a fully cited summary (positive control)', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const summary = { text: 'Backend engineer at Acme Ltd since 2019', factIds: ['f1'] };
    const r = verify(base({ summary }), facts);
    expect(r.accepted.summary).toEqual(summary);
    expect(r.dropped).toEqual([]);
  });

  it('drops an experience entry with empty factIds, since the citation rule applies to entries too', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const draft = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.5,
          factIds: [],
          bullets: [{ text: 'Built APIs at Acme Ltd', factIds: ['f1'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0]']);
    expect(r.accepted.experience).toEqual([]);
    expect(r.questions.some((q) => q.path.startsWith('experience[0]'))).toBe(true);
  });

  it('drops an experience entry that cites an unknown factId, with an unverifiable question under its path', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const draft = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.5,
          factIds: ['f404'],
          bullets: [{ text: 'Built APIs at Acme Ltd', factIds: ['f1'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0]']);
    expect(r.questions).toContainEqual(expect.objectContaining({ reason: 'unverifiable' }));
    expect(r.questions.some((q) => q.path.startsWith('experience[0]'))).toBe(true);
  });
});

describe('verify — entity rule against the entry\'s own facts (spec §3.4, ADR-013)', () => {
  it('keeps an entry assembled from two unrelated facts and catches the mis-pairing as a period question, not a deletion (ADR-013, ADR-022)', () => {
    const facts = [
      fact('f1', 'Intern at Acme Ltd, 2015-2017', 'employment'),
      fact('f2', 'Backend engineer at Globex, 2019', 'employment'),
    ];
    const entry = {
      employer: 'Acme Ltd',
      role: 'Backend engineer',
      period: '2019',
      relevance: 0.5,
      factIds: ['f1', 'f2'],
      bullets: [{ text: 'Worked at Acme Ltd', factIds: ['f1'] }],
    };
    const r = verify(base({ experience: [entry] }), facts);
    // The employer is strict and holds in f1; the period 2019 is in f2 only, so no single cited fact pairs them.
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience).toHaveLength(1);
    expect(r.accepted.experience[0].employer).toBe('Acme Ltd');
    expect(r.accepted.experience[0].period).toBe('2019');
    expect(r.questions).toContainEqual(
      expect.objectContaining({ path: 'experience[0].period', reason: 'missing', priority: 1 }),
    );
    expect(r.questions.some((q) => q.path === 'experience[0].employer')).toBe(false);
  });

  it('keeps an entry whose period no cited fact states, with the drafted period and a priority-1 period question (ADR-022)', () => {
    const facts = [
      fact('f1', 'Intern at Acme Ltd, 2015-2017', 'employment'),
      fact('f2', 'Backend engineer at Globex, 2019', 'employment'),
    ];
    const entry = {
      employer: 'Acme Ltd',
      role: 'Backend engineer',
      period: '2019',
      relevance: 0.5,
      factIds: ['f1'],
      bullets: [{ text: 'Worked at Acme Ltd', factIds: ['f1'] }],
    };
    const r = verify(base({ experience: [entry] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience).toEqual([entry]);
    expect(r.questions).toContainEqual(
      expect.objectContaining({ path: 'experience[0].period', reason: 'missing', priority: 1 }),
    );
  });

  it('drops an entry whose employer occurs in a fact the entry does not cite', () => {
    const facts = [
      fact('f1', 'Backend engineer at Acme Ltd, 2019', 'employment'),
      fact('f2', 'Backend engineer at Globex, 2019', 'employment'),
    ];
    const draft = base({
      experience: [
        {
          employer: 'Globex',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.9,
          factIds: ['f1'],
          bullets: [{ text: 'Built APIs', factIds: ['f1'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.accepted.experience).toEqual([]);
    expect(r.questions).toContainEqual(
      expect.objectContaining({ path: 'experience[0].employer', reason: 'missing', priority: 1 }),
    );
  });

  it('drops an entry whose employer occurs in no fact and asks for the employer', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019')];
    const draft = base({
      experience: [
        {
          employer: 'Globex',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.9,
          factIds: ['f1'],
          bullets: [{ text: 'Built APIs', factIds: ['f1'] }],
        },
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.5,
          factIds: ['f1'],
          bullets: [{ text: 'Built APIs at Acme Ltd', factIds: ['f1'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0]']);
    expect(r.accepted.experience.map((e) => e.employer)).toEqual(['Acme Ltd']);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'experience[0].employer', reason: 'missing' }));
  });

  it('keeps an entry whose period bridges a gap between two jobs, with its drafted period and a period question (ADR-022)', () => {
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
          factIds: ['f1'],
          bullets: [{ text: 'Worked at Acme Ltd', factIds: ['f1'] }],
        },
        {
          employer: 'Beta Corp',
          role: 'Backend Developer',
          period: '2017-2019',
          relevance: 0.5,
          factIds: ['f2'],
          bullets: [{ text: 'Built tools at Beta Corp', factIds: ['f2'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience).toHaveLength(2);
    expect(r.accepted.experience[1].period).toBe('2017-2019');
    expect(r.questions).toContainEqual(
      expect.objectContaining({ path: 'experience[1].period', reason: 'missing', priority: 1 }),
    );
    expect(r.questions.some((q) => q.path === 'experience[0].period')).toBe(false);
  });

  it('keeps a bullet whose parent entry cites the employer, with a bullet citing a different fact (one level of inheritance)', () => {
    const facts = [
      fact('f1', 'Backend engineer at Acme Ltd, 2019', 'employment'),
      fact('f2', 'Built payments for the checkout team', 'achievement'),
    ];
    const draft = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.7,
          factIds: ['f1'],
          bullets: [{ text: 'Built payments for Acme Ltd', factIds: ['f2'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.experience[0].bullets).toEqual([{ text: 'Built payments for Acme Ltd', factIds: ['f2'] }]);
  });

  it('drops a bullet naming an organisation that appears only in a fact neither the bullet nor its parent cites', () => {
    const facts = [
      fact('f1', 'Backend engineer at Acme Ltd, 2019', 'employment'),
      fact('f2', 'Built billing tools', 'achievement'),
      fact('f3', 'Ran a migration at Google', 'achievement'),
    ];
    const draft = base({
      experience: [
        {
          employer: 'Acme Ltd',
          role: 'Backend engineer',
          period: '2019',
          relevance: 0.7,
          factIds: ['f1'],
          bullets: [{ text: 'Built billing tools at Google', factIds: ['f2'] }],
        },
      ],
    });
    const r = verify(draft, facts);
    expect(r.dropped.map((d) => d.path)).toEqual(['experience[0].bullets[0]']);
    expect(r.questions).toContainEqual(
      expect.objectContaining({ path: 'experience[0].bullets[0].text', reason: 'unverifiable' }),
    );
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
          factIds: ['f1'],
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
      expect.objectContaining({ path: 'experience[0].bullets[0].text', reason: 'unverifiable' }),
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
          factIds: ['f1'],
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
          factIds: ['f1'],
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
          factIds: ['f1'],
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
          factIds: ['f1'],
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
          factIds: ['f1'],
          bullets: [{ text: 'Built APIs', factIds: ['f1'] }],
        },
        {
          employer: 'Acme Ltd',
          role: 'Lead Engineer',
          period: '2019',
          relevance: 0.5,
          factIds: ['f1'],
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
          factIds: ['f1'],
          bullets: [{ text: 'Built APIs', factIds: ['f1'] }],
        },
        {
          employer: 'Acme Ltd',
          role: 'Lead Engineer',
          period: '2019',
          relevance: 0.5,
          factIds: ['f1'],
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

describe('verify — education is grounded against its own facts', () => {
  const facts = [fact('f1', 'BSc at Warsaw University, 2010-2014', 'education')];
  it('keeps an education entry whose institution and period occur in its cited facts', () => {
    const edu = { institution: 'Warsaw University', degree: 'BSc', period: '2010-2014', factIds: ['f1'] };
    const r = verify(base({ education: [edu] }), facts);
    expect(r.accepted.education).toEqual([edu]);
    expect(r.dropped).toEqual([]);
  });
  it('drops an invented school and raises a priority-1 question on its path', () => {
    const r = verify(base({ education: [{ institution: 'MIT', period: '2010-2014', factIds: ['f1'] }] }), facts);
    expect(r.accepted.education).toEqual([]);
    expect(r.dropped.map((d) => d.path)).toEqual(['education[0]']);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'education[0].institution', reason: 'missing', priority: 1 }));
  });
  it('keeps an education entry with an invented period, keeps the drafted period, and raises education[0].period (priority 1, ADR-022)', () => {
    const edu = { institution: 'Warsaw University', period: '2001-2005', factIds: ['f1'] };
    const r = verify(base({ education: [edu] }), facts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.education).toEqual([edu]);
    expect(r.questions).toEqual([expect.objectContaining({ path: 'education[0].period', reason: 'missing', priority: 1 })]);
  });
  it('drops an education entry whose institution is in a fact it does not cite', () => {
    const twoFacts = [
      fact('f1', 'BSc at Warsaw University, 2010-2014', 'education'),
      fact('f2', 'Worked at Initech, 2015-2016', 'employment'),
    ];
    const r = verify(base({ education: [{ institution: 'Warsaw University', period: '2010-2014', factIds: ['f2'] }] }), twoFacts);
    expect(r.accepted.education).toEqual([]);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'education[0].institution', reason: 'missing', priority: 1 }));
  });
});

describe('verify — ADR-022: derived quantities, strict contact, co-occurring education', () => {
  it('keeps a summary that states a number no cited fact contains, and raises summary.text (derived quantity)', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019-2024')];
    const summary = { text: 'Backend engineer with 5+ years of experience at Acme Ltd', factIds: ['f1'] };
    const r = verify(base({ summary }), facts);
    expect(r.accepted.summary).toEqual(summary);
    expect(r.dropped).toEqual([]);
    expect(r.questions).toEqual([expect.objectContaining({ path: 'summary.text', reason: 'unverifiable' })]);
  });

  it('keeps a summary whose names and numbers are all in its cited facts, with no question (negative control)', () => {
    const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019-2024')];
    const summary = { text: 'Backend engineer at Acme Ltd, 2019-2024', factIds: ['f1'] };
    const r = verify(base({ summary }), facts);
    expect(r.accepted.summary).toEqual(summary);
    expect(r.questions).toEqual([]);
  });

  it('keeps an education entry whose institution and period are in different cited facts, and asks about the period (ADR-022)', () => {
    const twoFacts = [
      fact('f1', 'BSc at Warsaw University', 'education'),
      fact('f2', 'Studied 2010-2014 in Poland', 'education'),
    ];
    const edu = { institution: 'Warsaw University', degree: 'BSc', period: '2010-2014', factIds: ['f1', 'f2'] };
    const r = verify(base({ education: [edu] }), twoFacts);
    expect(r.dropped).toEqual([]);
    expect(r.accepted.education).toEqual([edu]);
    expect(r.questions).toEqual([expect.objectContaining({ path: 'education[0].period', reason: 'missing', priority: 1 })]);
  });

  describe('contact is verified strictly, per field, against that field\'s own cited facts', () => {
    const contactFacts = [
      fact('f1', 'Name: Jane Doe. Email: jane@example.com. Phone: +44 20 7946 0958. Based in Warsaw', 'contact'),
      fact('f2', 'Based in Warsaw', 'contact'),
    ];
    const field = (value: string, factIds: string[]) => ({ value, factIds });

    it('keeps each contact field its own cited facts state, with no question', () => {
      const contact = {
        fullName: field('Jane Doe', ['f1']),
        email: field('jane@example.com', ['f1']),
        phone: field('+44 20 7946 0958', ['f1']),
        location: field('Warsaw', ['f2']),
      };
      const r = verify(base({ contact }), contactFacts);
      expect(r.accepted.contact).toEqual(contact);
      expect(r.dropped).toEqual([]);
      expect(r.questions).toEqual([]);
    });

    it('drops an email the cited facts do not state, raises contact.email, and keeps the other contact fields', () => {
      const contact = { fullName: field('Jane Doe', ['f1']), email: field('jane@example.org', ['f1']) };
      const r = verify(base({ contact }), contactFacts);
      expect(r.accepted.contact?.email).toBeUndefined();
      expect(r.accepted.contact?.fullName).toEqual(field('Jane Doe', ['f1']));
      expect(r.dropped.map((d) => d.path)).toEqual(['contact.email']);
      expect(r.questions).toContainEqual(expect.objectContaining({ path: 'contact.email', reason: 'unverifiable' }));
    });

    it('rejects a near-miss email that is a substring of the real one (jane@example.co for jane@example.com)', () => {
      const contact = { email: field('jane@example.co', ['f1']) };
      const r = verify(base({ contact }), contactFacts);
      expect(r.accepted.contact?.email).toBeUndefined();
      expect(r.dropped.map((d) => d.path)).toEqual(['contact.email']);
      expect(r.questions).toContainEqual(expect.objectContaining({ path: 'contact.email' }));
    });

    it('rejects a truncated phone number that is a prefix of the real one (+44 20 7946 095 for +44 20 7946 0958)', () => {
      const contact = { phone: field('+44 20 7946 095', ['f1']) };
      const r = verify(base({ contact }), contactFacts);
      expect(r.accepted.contact?.phone).toBeUndefined();
      expect(r.dropped.map((d) => d.path)).toEqual(['contact.phone']);
      expect(r.questions).toContainEqual(expect.objectContaining({ path: 'contact.phone' }));
    });

    it('drops a contact field whose value sits in a fact the field does not cite', () => {
      const contact = { email: field('jane@example.com', ['f2']) };
      const r = verify(base({ contact }), contactFacts);
      expect(r.accepted.contact?.email).toBeUndefined();
      expect(r.questions).toContainEqual(expect.objectContaining({ path: 'contact.email', reason: 'unverifiable' }));
    });

    it('drops a contact field with no cited facts, with a missing-reason question on contact.email', () => {
      const contact = { email: field('jane@example.com', []) };
      const r = verify(base({ contact }), contactFacts);
      expect(r.accepted.contact?.email).toBeUndefined();
      expect(r.dropped.map((d) => d.path)).toEqual(['contact.email']);
      expect(r.questions).toContainEqual(expect.objectContaining({ path: 'contact.email', reason: 'missing' }));
    });
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
        factIds: ['f1'],
        bullets: [{ text: 'Built APIs', factIds: ['f1'] }],
      },
      {
        employer: 'Acme Ltd',
        role: 'Backend engineer',
        period: '2019',
        relevance: 0.5,
        factIds: ['f1'],
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
          factIds: ['f1'],
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

describe('verify — ADR-022 Amendment A: an invented entity drops the summary, a vague one does not', () => {
  const facts = [fact('f1', 'Backend engineer at Acme Ltd, 2019-2024'), fact('f2', 'Built payments APIs in Go')];
  const dropsSummary = (text: string, detail: RegExp) => {
    const r = verify(base({ summary: { text, factIds: ['f1', 'f2'] } }), facts);
    expect(r.accepted.summary).toBeUndefined();
    expect(r.dropped).toEqual([expect.objectContaining({ path: 'summary', reason: expect.stringMatching(detail) })]);
    expect(r.questions).toEqual([expect.objectContaining({ path: 'summary.text', reason: 'unverifiable' })]);
  };

  it('drops a summary naming an organisation no cited fact holds', () => {
    dropsSummary('Senior engineer with a decade at Google', /Google/);
  });

  it('drops a summary naming a legal-suffix organisation no cited fact holds', () => {
    dropsSummary('Backend engineer formerly at Globex Corp', /Globex Corp/);
  });

  it('drops a summary naming a technology no cited fact holds', () => {
    dropsSummary('Backend engineer who ships Kubernetes platforms', /Kubernetes/);
  });

  it('drops a summary stating a figure no cited fact holds', () => {
    dropsSummary('Backend engineer who reached 99% accuracy', /99%/);
  });

  it('keeps a summary that is merely vague or woolly, with its question', () => {
    const summary = { text: 'Dependable engineer who enjoys hard problems', factIds: ['f1'] };
    const r = verify(base({ summary }), facts);
    expect(r.accepted.summary).toEqual(summary);
    expect(r.dropped).toEqual([]);
    expect(r.questions).toEqual([]);
  });

  it('keeps a summary with no citation (missing, not an entity) and asks', () => {
    const summary = { text: 'Dependable engineer', factIds: [] };
    const r = verify(base({ summary }), facts);
    expect(r.accepted.summary).toEqual(summary);
    expect(r.questions).toEqual([expect.objectContaining({ path: 'summary.text', reason: 'missing' })]);
  });

  it('keeps a summary whose entities are all held by its cited facts (control)', () => {
    const summary = { text: 'Backend engineer at Acme Ltd building payments APIs in Go', factIds: ['f1', 'f2'] };
    const r = verify(base({ summary }), facts);
    expect(r.accepted.summary).toEqual(summary);
    expect(r.questions).toEqual([]);
  });
});

describe('verify — KNOWN LIMIT, ADR-022 Amendment A: one fact holding two employers hides a mis-pairing', () => {
  // This test documents a hole; it does not endorse it. Both "Acme Ltd" and "2015-2018" occur inside the single
  // fact, so the co-occurrence rule (ADR-013) is satisfied and the swapped period passes with NO question.
  // The fix is upstream: the extract stage emits one employment fact per employer (prompts/extract.ts, golden
  // extract fixture extract-two-employers.json). A proximity heuristic inside one fact was rejected by the ADR.
  // If someone closes this hole in the verifier, this test should flip to expecting a period question.
  it('lets "Acme Ltd, 2015-2018" pass silently against one fact naming both employers (documented limit)', () => {
    const one = [fact('f1', 'Acme Ltd 2019-2021 and Globex Corp 2015-2018', 'employment')];
    const entry = { employer: 'Acme Ltd', role: 'Engineer', period: '2015-2018', relevance: 0.5, factIds: ['f1'], bullets: [] };
    const r = verify(base({ experience: [entry] }), one);
    expect(r.accepted.experience).toHaveLength(1);
    expect(r.questions.filter((q) => q.path === 'experience[0].period')).toEqual([]);
  });

  it('DOES surface the same mis-pairing once extract keeps the employers in separate facts (the ADR fix)', () => {
    const two = [
      fact('f1', 'Acme Ltd 2019-2021', 'employment'),
      fact('f2', 'Globex Corp 2015-2018', 'employment'),
    ];
    const entry = { employer: 'Acme Ltd', role: 'Engineer', period: '2015-2018', relevance: 0.5, factIds: ['f1'], bullets: [] };
    const r = verify(base({ experience: [entry] }), two);
    expect(r.questions).toContainEqual(expect.objectContaining({ path: 'experience[0].period', reason: 'missing' }));
  });
});
