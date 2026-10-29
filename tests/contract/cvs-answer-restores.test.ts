import { describe, it, expect, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { answerQuestion } from '../../api/src/core/cv/answer.js';
import { getCv } from '../../api/src/core/cv/read.js';
import { persistDraft } from '../../api/src/core/cv/persist.js';
import { verify } from '../../api/src/core/generation/verify.js';
import type { CvDraft, Fact, GenerationPipeline } from '../../api/src/core/generation/types.js';

// ADR-027 decision 3 and ADR-026. Priority 1 is "content is missing from the CV; only the user's answer brings it
// back". An answer is a user-sourced fact (F-006), trusted, and its facts go back through verify. The entry the
// new evidence supports is restored, and the re-verify's questions are persisted (the answered one is gone).
// Real Postgres and the real answerQuestion; the LLM is the C-012 seam, a fake compose() that cites the facts it is
// handed. verify() is the real verifier.

const prisma = new PrismaClient();
const userIds: string[] = [];

afterAll(async () => {
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

const EMPLOYER_TEXT_PREFIX = 'Which employer did this role happen at?';
const BUDGET = 100000;

// A CV whose only experience entry was dropped: its employer "Harbour Labs" is in no document fact.
async function seedDroppedEntry(): Promise<{ userId: string; cvId: string; docFactId: string; employerQuestionId: string }> {
  const userId = randomUUID();
  userIds.push(userId);
  await prisma.user.create({
    data: { id: userId, email: `answer-restores-${userId}@example.test`, passwordHash: `not-a-real-hash-${randomBytes(4).toString('hex')}` },
  });
  const cvId = randomUUID();
  await prisma.cv.create({
    data: { id: cvId, userId, title: 'Answer restores', targetRole: 'Backend engineer', sourceKind: 'text', sourceText: 'Lead engineer, 2021-2024.', state: 'generating', version: 1 },
  });
  const docFactId = randomUUID();
  const facts: Fact[] = [
    { id: docFactId, kind: 'employment', text: 'Lead engineer, 2021-2024', sourceQuote: 'Lead engineer, 2021-2024', source: 'document' },
  ];
  const draft: CvDraft = {
    targetRole: 'Backend engineer',
    experience: [{ employer: 'Harbour Labs', role: 'Lead engineer', period: '2021-2024', relevance: 0.9, factIds: [docFactId], bullets: [] }],
    education: [],
    skills: [],
  };
  const verdict = verify(draft, facts);
  expect(verdict.dropped.map((d) => d.path)).toEqual(['experience[0]']);
  await prisma.$transaction((tx) => persistDraft(tx, cvId, verdict.accepted, verdict.questions, facts));
  const question = await prisma.question.findFirstOrThrow({
    where: { cvId, status: 'open', text: { startsWith: EMPLOYER_TEXT_PREFIX } },
  });
  return { userId, cvId, docFactId, employerQuestionId: question.id };
}

// compose() is the fake LLM. It writes the entry with a fixed employer, Harbour Labs, and cites the document fact
// plus every user fact it is handed. verify() is real.
function pipelineFor(docFactId: string): GenerationPipeline {
  return {
    async extract(): Promise<Fact[]> {
      throw new Error('extract is not part of the answer path');
    },
    async compose(facts: Fact[], targetRole: string): Promise<CvDraft> {
      const userFactIds = facts.filter((f) => f.source === 'user').map((f) => f.id);
      return {
        targetRole,
        experience: [
          { employer: 'Harbour Labs', role: 'Lead engineer', period: '2021-2024', relevance: 0.9, factIds: [docFactId, ...userFactIds], bullets: [] },
        ],
        education: [],
        skills: [],
      };
    },
    verify,
  };
}

describe('answering a priority-1 employer question restores the entry the answer supports (ADR-027, F-006)', () => {
  it('the user supplies the employer: the entry is back in the CV and its employer question is gone', async () => {
    const seeded = await seedDroppedEntry();
    await answerQuestion(prisma, pipelineFor(seeded.docFactId), seeded.userId, seeded.cvId, seeded.employerQuestionId, { answer: 'Harbour Labs' }, BUDGET);

    const cv = await getCv(prisma, seeded.userId, seeded.cvId);
    expect(cv.experience.map((e) => e.employer)).toEqual(['Harbour Labs']);
    expect(cv.experience[0]).toMatchObject({ employer: 'Harbour Labs', role: 'Lead engineer', period: '2021-2024' });
    expect(cv.questions.find((q) => q.id === seeded.employerQuestionId)?.status).toBe('answered');
    expect(cv.questions.filter((q) => q.status === 'open' && q.path.endsWith('.employer'))).toEqual([]);
  });

  it('negative control: an answer that does not support the drafted employer restores nothing', async () => {
    const seeded = await seedDroppedEntry();
    await answerQuestion(prisma, pipelineFor(seeded.docFactId), seeded.userId, seeded.cvId, seeded.employerQuestionId, { answer: 'Other Corp' }, BUDGET);

    const cv = await getCv(prisma, seeded.userId, seeded.cvId);
    expect(cv.experience.map((e) => e.employer)).not.toContain('Harbour Labs');
    expect(cv.experience).toEqual([]);
  });
});
