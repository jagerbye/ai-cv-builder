import { describe, it, expect, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { verify } from '../../api/src/core/generation/verify.js';
import type { CvDraft, Fact } from '../../api/src/core/generation/types.js';
import { persistDraft } from '../../api/src/core/cv/persist.js';
import { getCv } from '../../api/src/core/cv/read.js';
import type { CvExperience, CvResponse } from '../../api/src/core/cv/types.js';

// ADR-027 decision 1, the wrong-field defect. A question binds to the ITEM it is about. Here the verifier drops
// the first entry (Google, employer not in the source) and keeps two others. Persist stores the accepted entries
// with the dropped one removed, and read re-sorts by relevance, so the Costa Cafe entry moves from drafted
// index 1 to stored index 0 and then to read index 0 while Harbour Labs takes read index 1. A question about
// Costa Cafe's period must still resolve, through C-006, to the Costa Cafe entry. A question about the dropped
// Google entry binds to no item and names its section, never an index.
//
// Identity is by content (the employer name of the item a path resolves to), never by index. Real Postgres,
// real persistDraft and getCv; the verifier is the real verify().

const prisma = new PrismaClient();
const userIds: string[] = [];

afterAll(async () => {
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

async function seedOwner(): Promise<string> {
  const userId = randomUUID();
  userIds.push(userId);
  await prisma.user.create({
    data: { id: userId, email: `question-binding-${userId}@example.test`, passwordHash: `not-a-real-hash-${randomBytes(4).toString('hex')}` },
  });
  return userId;
}

// The item a C-006 experience path names in the read model, or undefined when the path names no item.
function itemAt(cv: CvResponse, path: string): CvExperience | undefined {
  const m = /^experience\[(\d+)\]/.exec(path);
  return m ? cv.experience[Number(m[1])] : undefined;
}

const EMPLOYER_TEXT_PREFIX = 'Which employer did this role happen at?';
const PERIOD_TEXT_PREFIX = 'What were the exact dates of this role?';

describe('questions bind to the item they are about (ADR-027, wrong-field defect)', () => {
  it('after a drop and a re-sort, each stored question still resolves through C-006 to its own item', async () => {
    const userId = await seedOwner();
    const cvId = randomUUID();
    await prisma.cv.create({
      data: {
        id: cvId,
        userId,
        title: 'Binding test',
        targetRole: 'Backend engineer',
        sourceKind: 'text',
        sourceText: 'Barista at Costa Cafe, 2018-2020. Lead engineer at Harbour Labs, 2021-2024.',
        state: 'generating',
        version: 1,
      },
    });

    const costaFact = randomUUID();
    const harbourFact = randomUUID();
    const facts: Fact[] = [
      { id: costaFact, kind: 'employment', text: 'Barista at Costa Cafe, 2018-2020', sourceQuote: 'Barista at Costa Cafe, 2018-2020', source: 'document' },
      { id: harbourFact, kind: 'employment', text: 'Lead engineer at Harbour Labs, 2021-2024', sourceQuote: 'Lead engineer at Harbour Labs, 2021-2024', source: 'document' },
    ];
    // Drafted order: Google (dropped, index 0), Costa Cafe (index 1, period not in its source), Harbour Labs (index 2).
    // Relevance puts Costa Cafe first on read, so the stored order and the read order disagree about who is where.
    const draft: CvDraft = {
      targetRole: 'Backend engineer',
      experience: [
        { employer: 'Google', role: 'Barista', period: '2018-2020', relevance: 0.95, factIds: [costaFact], bullets: [] },
        { employer: 'Costa Cafe', role: 'Barista', period: '2018-2021', relevance: 0.9, factIds: [costaFact], bullets: [] },
        { employer: 'Harbour Labs', role: 'Lead engineer', period: '2021-2024', relevance: 0.3, factIds: [harbourFact], bullets: [] },
      ],
      education: [],
      skills: [],
    };

    const verdict = verify(draft, facts);
    // Preconditions: the verifier drops Google and asks about the Google employer and the Costa Cafe period.
    expect(verdict.dropped.map((d) => d.path)).toEqual(['experience[0]']);
    const employerText = verdict.questions.find((q) => q.text.startsWith(EMPLOYER_TEXT_PREFIX))?.text;
    const periodText = verdict.questions.find((q) => q.text.startsWith(PERIOD_TEXT_PREFIX))?.text;
    expect(employerText).toBeDefined();
    expect(periodText).toBeDefined();

    await prisma.$transaction((tx) => persistDraft(tx, cvId, verdict.accepted, verdict.questions, facts));
    const cv = await getCv(prisma, userId, cvId);

    // Precondition: the dropped entry is gone and the read order is by relevance, so Costa Cafe now reads first.
    expect(cv.experience.map((e) => e.employer)).toEqual(['Costa Cafe', 'Harbour Labs']);

    const periodStored = cv.questions.find((q) => q.text === periodText);
    expect(periodStored).toBeDefined();
    // The question about Costa Cafe's period must point at Costa Cafe's entry, not at whichever entry now sits at its index.
    expect(itemAt(cv, periodStored!.path)).toMatchObject({ employer: 'Costa Cafe' });
    expect(periodStored!.path).toMatch(/\.period$/);

    // The question about the dropped Google entry binds to no item: it names the section, never an index.
    const employerStored = cv.questions.find((q) => q.text === employerText);
    expect(employerStored).toBeDefined();
    expect(employerStored!.path).toBe('experience');
  });
});
