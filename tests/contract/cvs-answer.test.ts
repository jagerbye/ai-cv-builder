import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { GatewayError } from '../../api/src/core/generation/gateway.js';
import { safeMessage } from '../../api/src/http/errors.js';
import { buildServer } from '../../api/src/server.js';
import type { CvDraft, Fact, GenerationPipeline, VerificationResult } from '../../api/src/core/generation/types.js';

// T-20 (CVB-17). Contract tests for C-009 (POST /api/cvs/:cvId/questions/:questionId/answer),
// spec.md F-005 §3.5 and F-006 §3.6. Real Fastify app and real Postgres, sid cookie as in
// cvs-patch.test.ts. The LLM is mocked at the C-012 seam (GenerationPipeline): no network, no key.
//
// Seam (Architect decision, T-20): buildServer takes { generationPipeline } as an option, the same
// injection as core/jobs/worker.ts. The route must use that pipeline for the targeted recompose and nothing else.
//
// No generation_jobs row is written by these tests (C-009 is synchronous), so the
// job suite lock (api/src/core/jobs/test-lock.ts, ADR-014) is not taken here.

const prisma = new PrismaClient();
let app: FastifyInstance;
const userIds: string[] = [];

const ANSWER = 'Jun 2016 – Feb 2018';
const SENTINEL = 'SENTINEL-NOT-FROM-ANSWER';

interface Owner {
  userId: string;
  cookie: string;
}

async function seedUser(): Promise<Owner> {
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await prisma.user.create({
    data: { id: userId, email: `cvs-answer-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    },
  });
  userIds.push(userId);
  return { userId, cookie: `sid=${token}` };
}

interface Seeded {
  cvId: string;
  ids: Record<string, string>;
}

// A ready CV at version 3. The question under test is bound to experience[0].period.
// experience[1] and a bullet of experience[0] carry userEdited=true and must survive.
async function seedCv(userId: string): Promise<Seeded> {
  const cvId = randomUUID();
  const names = [
    'contact', 'summary', 'expHigh', 'expLow', 'bulletA', 'bulletB', 'bulletUser',
    'education', 'skill', 'factSummary', 'factBullet', 'factSkill', 'factDoc',
    'qPeriod', 'qEdu', 'qPeriodOther',
  ];
  const ids: Record<string, string> = Object.fromEntries(names.map((n) => [n, randomUUID()]));
  await prisma.cv.create({
    data: {
      id: cvId,
      userId,
      title: 'Ada Lovelace – Backend Engineer',
      targetRole: 'Backend Engineer',
      sourceKind: 'text',
      sourceText: 'Ada Lovelace, Backend Engineer, London. Lead Engineer at Babbage Works. Skills: TypeScript.',
      state: 'ready',
      version: 3,
      updatedAt: new Date('2026-10-20T10:00:00.000Z'),
    },
  });
  await prisma.fact.createMany({
    data: [
      { id: ids.factSummary, cvId, kind: 'employment', text: 'Backend engineer in London', sourceQuote: 'Ada Lovelace, Backend Engineer, London', source: 'document' },
      { id: ids.factBullet, cvId, kind: 'achievement', text: 'Cut build time by 40%', sourceQuote: 'reduced build times by 40 percent', source: 'document' },
      { id: ids.factSkill, cvId, kind: 'skill', text: 'TypeScript', sourceQuote: 'Skills: TypeScript', source: 'document' },
      { id: ids.factDoc, cvId, kind: 'education', text: 'BSc Mathematics', sourceQuote: 'BSc Mathematics, University of London, 2011 to 2014', source: 'document' },
    ],
  });
  await prisma.cvItem.createMany({
    data: [
      { id: ids.contact, cvId, kind: 'contact', path: 'contact', orderIndex: 0, data: { fullName: 'Ada Lovelace', email: 'ada@example.com', links: [] }, factIds: [ids.factSummary], userEdited: false },
      { id: ids.summary, cvId, kind: 'summary', path: 'summary', orderIndex: 0, data: { text: 'Backend engineer who ships fast builds.' }, factIds: [ids.factSummary], userEdited: false },
      { id: ids.expHigh, cvId, kind: 'experience', path: 'experience[0]', orderIndex: 0, data: { employer: 'Babbage Works', role: 'Lead Engineer', period: 'Mar 2019 – Present' }, factIds: [], relevance: 0.9, userEdited: false },
      { id: ids.expLow, cvId, kind: 'experience', path: 'experience[1]', orderIndex: 1, data: { employer: 'Analytical Engines', role: 'Engineer', period: 'Jan 2015 – Dec 2017' }, factIds: [], relevance: 0.4, userEdited: true },
      { id: ids.bulletA, cvId, kind: 'bullet', parentId: ids.expHigh, path: 'experience[0].bullets[0]', orderIndex: 0, data: { text: 'Cut build time by 40%' }, factIds: [ids.factBullet], userEdited: false },
      { id: ids.bulletB, cvId, kind: 'bullet', parentId: ids.expHigh, path: 'experience[0].bullets[1]', orderIndex: 1, data: { text: 'Led a team of six' }, factIds: [], userEdited: false },
      { id: ids.bulletUser, cvId, kind: 'bullet', parentId: ids.expHigh, path: 'experience[0].bullets[2]', orderIndex: 2, data: { text: 'Hand-written bullet the user owns' }, factIds: [], userEdited: true },
      { id: ids.education, cvId, kind: 'education', path: 'education[0]', orderIndex: 0, data: { institution: 'University of London', degree: 'BSc Mathematics', period: '2011 – 2014' }, factIds: [ids.factDoc], userEdited: false },
      { id: ids.skill, cvId, kind: 'skill', path: 'skills[0]', orderIndex: 0, data: { name: 'TypeScript', group: 'Languages' }, factIds: [ids.factSkill], userEdited: false },
    ],
  });
  await prisma.question.createMany({
    data: [
      { id: ids.qPeriod, cvId, path: 'experience[0].period', text: 'When did you start at Babbage Works?', reason: 'missing', status: 'open', priority: 1 },
      { id: ids.qEdu, cvId, path: 'education[0].period', text: 'Which years did you study?', reason: 'vague', status: 'open', priority: 3 },
      { id: ids.qPeriodOther, cvId, path: 'experience[1].period', text: 'Is the Analytical Engines period right?', reason: 'unverifiable', status: 'open', priority: 2 },
    ],
  });
  return { cvId, ids };
}

// The fake pipeline is the C-012 seam. compose() derives the target period from the user-sourced
// fact it is handed, and returns different values for every other section, so a route that
// writes anything beyond the target section, or that does not pass the user fact, fails.
// verify() is a groundedness stand-in: it drops any experience entry whose period does not occur
// in a document fact. The user's answer is not in any document fact, so only a route that exempts
// user facts from the verifier (F-006) keeps the answered period.
interface FakePipeline {
  pipeline: GenerationPipeline;
  composeFacts: Fact[][];
  verifyCalls: number;
}

function fakePipeline(opts: { composeThrows?: boolean; composeError?: Error } = {}): FakePipeline {
  const state: FakePipeline = {
    composeFacts: [],
    verifyCalls: 0,
    pipeline: {
      async extract() {
        throw new Error('extract is not part of the answer path');
      },
      async compose(facts: Fact[], targetRole: string): Promise<CvDraft> {
        state.composeFacts.push(facts);
        if (opts.composeError) throw opts.composeError;
        if (opts.composeThrows) throw new Error('upstream exploded: sk-test-leak');
        const userFact = facts.find((f) => f.source === 'user');
        return {
          targetRole,
          summary: { text: SENTINEL, factIds: [] },
          experience: [
            {
              employer: 'Babbage Works',
              role: 'Lead Engineer',
              period: userFact ? userFact.text : 'NO-USER-FACT',
              relevance: 0.9,
              factIds: [],
              bullets: [{ text: SENTINEL, factIds: [] }],
            },
            {
              employer: SENTINEL,
              role: SENTINEL,
              period: SENTINEL,
              relevance: 0.1,
              factIds: [],
              bullets: [],
            },
          ],
          education: [{ institution: SENTINEL, period: SENTINEL, factIds: [] }],
          skills: [{ name: SENTINEL, factIds: [] }],
        };
      },
      verify(draft: CvDraft, facts: Fact[]): VerificationResult {
        state.verifyCalls += 1;
        const documentQuotes = facts.filter((f) => f.source === 'document').map((f) => f.sourceQuote);
        const grounded = (text: string) => documentQuotes.some((q) => q.includes(text));
        const dropped: VerificationResult['dropped'] = [];
        const experience = draft.experience.filter((e, i) => {
          if (grounded(e.period)) return true;
          dropped.push({ path: `experience[${i}].period`, reason: 'period not in any document fact' });
          return false;
        });
        return { accepted: { ...draft, experience }, questions: [], dropped };
      },
    },
  };
  return state;
}

// Builds the app with the given seam, passed as the buildServer option (not a decorator).
async function buildWith(pipeline: GenerationPipeline): Promise<FastifyInstance> {
  const built = buildServer({ generationPipeline: pipeline });
  await built.ready();
  return built;
}

function getCv(cookie: string, cvId: string) {
  return app.inject({ method: 'GET', url: `/api/cvs/${cvId}`, headers: { cookie } });
}

function answer(cookie: string, cvId: string, questionId: string, body: unknown) {
  return app.inject({
    method: 'POST',
    url: `/api/cvs/${cvId}/questions/${questionId}/answer`,
    headers: { cookie },
    payload: body as object,
  });
}

// C-000: every non-2xx body is { error: { code, message, details? } } and nothing else at the top level.
function expectEnvelope(res: { statusCode: number; json: () => any }, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  const body = res.json();
  expect(Object.keys(body)).toEqual(['error']);
  expect(Object.keys(body.error).every((k) => ['code', 'message', 'details'].includes(k))).toBe(true);
  expect(body.error.code).toBe(code);
  return body;
}

// The C-006 shape: every required key is present and the collections are arrays.
function expectC006Shape(body: any, cvId: string) {
  for (const key of ['id', 'title', 'targetRole', 'state', 'version', 'updatedAt', 'contact', 'experience', 'education', 'skills', 'questions', 'facts']) {
    expect(body).toHaveProperty(key);
  }
  expect(body.id).toBe(cvId);
  expect(Array.isArray(body.experience)).toBe(true);
  expect(Array.isArray(body.questions)).toBe(true);
  expect(Array.isArray(body.facts)).toBe(true);
}

afterAll(async () => {
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

describe('C-009 POST /api/cvs/:cvId/questions/:questionId/answer — user fact and section-scoped recompose', () => {
  let owner: Owner;
  let cv: Seeded;
  let fake: FakePipeline;

  beforeEach(async () => {
    owner = await seedUser();
    cv = await seedCv(owner.userId);
    fake = fakePipeline();
    app = await buildWith(fake.pipeline);
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers with 200 and the full C-006 shape, with the answer in the target period', async () => {
    const res = await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expectC006Shape(body, cv.cvId);
    const target = body.experience.find((e: { period: string }) => e.period === ANSWER);
    expect(target).toBeDefined();
    expect(target.employer).toBe('Babbage Works');
    expect(target.role).toBe('Lead Engineer');
  });

  it('stores the answer as a user-sourced fact, reachable by the recompose', async () => {
    await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
    const userFacts = await prisma.fact.findMany({ where: { cvId: cv.cvId, source: 'user' } });
    expect(userFacts).toHaveLength(1);
    expect(userFacts[0].text).toBe(ANSWER);
    // The recompose saw that very fact, as a user fact, and was called exactly once.
    expect(fake.composeFacts).toHaveLength(1);
    const seen = fake.composeFacts[0].find((f) => f.source === 'user');
    expect(seen?.text).toBe(ANSWER);
    expect(seen?.id).toBe(userFacts[0].id);
  });

  it('keeps the answered period even though the groundedness verifier would drop it (F-006 bypass)', async () => {
    const res = await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
    expect(res.statusCode).toBe(200);
    expect(res.json().experience.map((e: { period: string }) => e.period)).toContain(ANSWER);
    expect(fake.verifyCalls).toBeGreaterThan(0);
  });

  it('marks only the answered question as answered and leaves the other questions byte-identical', async () => {
    const before = (await getCv(owner.cookie, cv.cvId)).json();
    const res = await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
    const after = res.json();
    const qBefore = before.questions.find((q: { id: string }) => q.id === cv.ids.qPeriod);
    expect(qBefore.status).toBe('open');
    expect(after.questions.find((q: { id: string }) => q.id === cv.ids.qPeriod).status).toBe('answered');
    for (const id of [cv.ids.qEdu, cv.ids.qPeriodOther]) {
      const b = before.questions.find((q: { id: string }) => q.id === id);
      const a = after.questions.find((q: { id: string }) => q.id === id);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
    const row = await prisma.question.findUniqueOrThrow({ where: { id: cv.ids.qPeriod } });
    expect(row.status).toBe('answered');
    expect(row.answeredAt).not.toBeNull();
  });

  it('recomposes only the owning section: every other section and every userEdited field is byte-identical', async () => {
    const before = (await getCv(owner.cookie, cv.cvId)).json();
    const res = await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
    expect(res.statusCode).toBe(200);
    const after = res.json();

    // Sections other than experience are untouched: compose returned SENTINEL for each of them.
    expect(JSON.stringify(after.contact)).toBe(JSON.stringify(before.contact));
    expect(JSON.stringify(after.summary)).toBe(JSON.stringify(before.summary));
    expect(JSON.stringify(after.education)).toBe(JSON.stringify(before.education));
    expect(JSON.stringify(after.skills)).toBe(JSON.stringify(before.skills));
    expect(JSON.stringify(after.summary)).not.toContain(SENTINEL);

    // Other experience entries: the userEdited entry and its data are untouched.
    const beforeOther = before.experience.find((e: { id: string }) => e.id === cv.ids.expLow);
    const afterOther = after.experience.find((e: { id: string }) => e.id === cv.ids.expLow);
    expect(JSON.stringify(afterOther)).toBe(JSON.stringify(beforeOther));
    expect(afterOther.userEdited).toBe(true);
    expect(JSON.stringify(after.experience)).not.toContain(SENTINEL);

    // Every userEdited field anywhere survives: the bullet the user owns is kept verbatim.
    const beforeTarget = before.experience.find((e: { period: string }) => e.period === 'Mar 2019 – Present');
    const afterTarget = after.experience.find((e: { period: string }) => e.period === ANSWER);
    expect(afterTarget).toBeDefined();
    const beforeUserBullet = beforeTarget.bullets.find((b: { id: string }) => b.id === cv.ids.bulletUser);
    const afterUserBullet = afterTarget.bullets.find((b: { id: string }) => b.id === cv.ids.bulletUser);
    expect(JSON.stringify(afterUserBullet)).toBe(JSON.stringify(beforeUserBullet));
    expect(afterUserBullet.text).toBe('Hand-written bullet the user owns');
  });

  // ADR-015: version is C-008's concurrency token, not content. It bumps on a successful answer so an
  // open editor holding the old version gets VERSION_CONFLICT instead of overwriting the new section.
  it('bumps the top-level version strictly, while untouched sections and every userEdited field stay identical (ADR-015)', async () => {
    const before = (await getCv(owner.cookie, cv.cvId)).json();
    expect(before.version).toBe(3);
    const res = await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
    expect(res.statusCode).toBe(200);
    const after = res.json();

    expect(after.version).toBeGreaterThan(before.version);
    // The persisted CV carries the same bumped version the response reports.
    expect((await getCv(owner.cookie, cv.cvId)).json().version).toBe(after.version);

    expect(JSON.stringify(after.contact)).toBe(JSON.stringify(before.contact));
    expect(JSON.stringify(after.summary)).toBe(JSON.stringify(before.summary));
    expect(JSON.stringify(after.education)).toBe(JSON.stringify(before.education));
    expect(JSON.stringify(after.skills)).toBe(JSON.stringify(before.skills));
    const beforeOther = before.experience.find((e: { id: string }) => e.id === cv.ids.expLow);
    const afterOther = after.experience.find((e: { id: string }) => e.id === cv.ids.expLow);
    expect(JSON.stringify(afterOther)).toBe(JSON.stringify(beforeOther));
    const beforeTarget = before.experience.find((e: { id: string }) => e.id === cv.ids.expHigh);
    const afterTarget = after.experience.find((e: { id: string }) => e.id === cv.ids.expHigh);
    const beforeUserBullet = beforeTarget.bullets.find((b: { id: string }) => b.id === cv.ids.bulletUser);
    const afterUserBullet = afterTarget.bullets.find((b: { id: string }) => b.id === cv.ids.bulletUser);
    expect(JSON.stringify(afterUserBullet)).toBe(JSON.stringify(beforeUserBullet));
  });

  // Decision, not accident: a question whose bound item was deleted is still answered. The answer is
  // stored as a fact, 200 is returned, and no section changes.
  it('answers 200 and stores the answer when the bound item no longer exists, changing no section', async () => {
    await prisma.cvItem.deleteMany({ where: { cvId: cv.cvId, parentId: cv.ids.expHigh } });
    await prisma.cvItem.delete({ where: { id: cv.ids.expHigh } });
    const before = (await getCv(owner.cookie, cv.cvId)).json();
    expect(before.experience.find((e: { id: string }) => e.id === cv.ids.expHigh)).toBeUndefined();

    const res = await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
    expect(res.statusCode).toBe(200);
    const after = res.json();
    expectC006Shape(after, cv.cvId);

    // ADR-015: the answer succeeded, so the version bumps even though no section changed.
    expect(after.version).toBeGreaterThan(before.version);
    expect((await getCv(owner.cookie, cv.cvId)).json().version).toBe(after.version);

    expect(JSON.stringify(after.contact)).toBe(JSON.stringify(before.contact));
    expect(JSON.stringify(after.summary)).toBe(JSON.stringify(before.summary));
    expect(JSON.stringify(after.experience)).toBe(JSON.stringify(before.experience));
    expect(JSON.stringify(after.education)).toBe(JSON.stringify(before.education));
    expect(JSON.stringify(after.skills)).toBe(JSON.stringify(before.skills));
    expect(JSON.stringify(after)).not.toContain(SENTINEL);
    expect(JSON.stringify(after.experience)).not.toContain(ANSWER);

    const userFacts = await prisma.fact.findMany({ where: { cvId: cv.cvId, source: 'user' } });
    expect(userFacts.map((f) => f.text)).toEqual([ANSWER]);
    const row = await prisma.question.findUniqueOrThrow({ where: { id: cv.ids.qPeriod } });
    expect(row.status).toBe('answered');
    expect(row.answer).toBe(ANSWER);
  });

  it('adds the answer to facts and leaves every earlier fact unchanged', async () => {
    const before = (await getCv(owner.cookie, cv.cvId)).json();
    const after = (await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER })).json();
    expect(after.facts).toHaveLength(before.facts.length + 1);
    expect(JSON.stringify(after.facts.slice(0, before.facts.length))).toBe(JSON.stringify(before.facts));
    expect(after.facts[after.facts.length - 1]).toMatchObject({ text: ANSWER, source: 'user' });
  });

  it('answering the same question twice returns 409 CONFLICT and stores no second fact', async () => {
    const first = await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
    expect(first.statusCode).toBe(200);
    const second = await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: 'Some other period' });
    expectEnvelope(second, 409, 'CONFLICT');
    const userFacts = await prisma.fact.findMany({ where: { cvId: cv.cvId, source: 'user' } });
    expect(userFacts.map((f) => f.text)).toEqual([ANSWER]);
  });

  it('returns 404 NOT_FOUND for an unknown cvId and for an unknown questionId', async () => {
    // Positive control: the same route answers 200 for the owner's own question, so the 404s below
    // are the lookup failing, not the route being absent.
    expect((await answer(owner.cookie, cv.cvId, cv.ids.qEdu, { answer: '2011 – 2014' })).statusCode).toBe(200);
    expectEnvelope(await answer(owner.cookie, randomUUID(), cv.ids.qPeriod, { answer: ANSWER }), 404, 'NOT_FOUND');
    expectEnvelope(await answer(owner.cookie, cv.cvId, randomUUID(), { answer: ANSWER }), 404, 'NOT_FOUND');
    const row = await prisma.question.findUniqueOrThrow({ where: { id: cv.ids.qPeriod } });
    expect(row.status).toBe('open');
  });

  it('returns 404 NOT_FOUND, never 403, for another user\'s CV, and leaves that CV untouched', async () => {
    const intruder = await seedUser();
    // Positive control: the owner's own request for another question succeeds on this same route.
    expect((await answer(owner.cookie, cv.cvId, cv.ids.qEdu, { answer: '2011 – 2014' })).statusCode).toBe(200);
    const res = await answer(intruder.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
    expectEnvelope(res, 404, 'NOT_FOUND');
    const row = await prisma.question.findUniqueOrThrow({ where: { id: cv.ids.qPeriod } });
    expect(row.status).toBe('open');
    expect(await prisma.fact.count({ where: { cvId: cv.cvId, source: 'user', text: ANSWER } })).toBe(0);
  });

  it('returns 404 NOT_FOUND when the questionId belongs to a different CV of the same user', async () => {
    const other = await seedCv(owner.userId);
    expect((await answer(owner.cookie, cv.cvId, cv.ids.qEdu, { answer: '2011 – 2014' })).statusCode).toBe(200);
    const res = await answer(owner.cookie, other.cvId, cv.ids.qPeriod, { answer: ANSWER });
    expectEnvelope(res, 404, 'NOT_FOUND');
    const row = await prisma.question.findUniqueOrThrow({ where: { id: cv.ids.qPeriod } });
    expect(row.status).toBe('open');
  });

  it('rejects an answer outside 1..2000 characters with 400 VALIDATION', async () => {
    expectEnvelope(await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: '' }), 400, 'VALIDATION');
    expectEnvelope(await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: 'x'.repeat(2001) }), 400, 'VALIDATION');
    const row = await prisma.question.findUniqueOrThrow({ where: { id: cv.ids.qPeriod } });
    expect(row.status).toBe('open');
  });

  it('answers 401 UNAUTHENTICATED without a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/cvs/${cv.cvId}/questions/${cv.ids.qPeriod}/answer`,
      payload: { answer: ANSWER },
    });
    expectEnvelope(res, 401, 'UNAUTHENTICATED');
  });
});

describe('C-009 503 LLM_UNAVAILABLE — the answer is stored even when the targeted recompose fails', () => {
  let owner: Owner;
  let cv: Seeded;

  beforeEach(async () => {
    owner = await seedUser();
    cv = await seedCv(owner.userId);
    app = await buildWith(fakePipeline({ composeThrows: true }).pipeline);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 503 LLM_UNAVAILABLE, stores the fact, and marks the question answered', async () => {
    const res = await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
    const body = expectEnvelope(res, 503, 'LLM_UNAVAILABLE');
    // The message is fixed and human-safe: no provider or key text leaks from the thrown error.
    expect(body.error.message).not.toContain('upstream exploded');
    expect(body.error.message).not.toContain('sk-test-leak');

    const userFacts = await prisma.fact.findMany({ where: { cvId: cv.cvId, source: 'user' } });
    expect(userFacts.map((f) => f.text)).toEqual([ANSWER]);
    const row = await prisma.question.findUniqueOrThrow({ where: { id: cv.ids.qPeriod } });
    expect(row.status).toBe('answered');
    expect(row.answer).toBe(ANSWER);
  });

  it('after the 503, a retry of the same answer is 409 CONFLICT, not a second fact', async () => {
    expectEnvelope(await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER }), 503, 'LLM_UNAVAILABLE');
    expectEnvelope(await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER }), 409, 'CONFLICT');
    expect(await prisma.fact.count({ where: { cvId: cv.cvId, source: 'user' } })).toBe(1);
  });

  it('after the 503, the CV sections are not partially written', async () => {
    const before = (await getCv(owner.cookie, cv.cvId)).json();
    expectEnvelope(await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER }), 503, 'LLM_UNAVAILABLE');
    const after = (await getCv(owner.cookie, cv.cvId)).json();
    expect(JSON.stringify(after.experience)).toBe(JSON.stringify(before.experience));
    expect(JSON.stringify(after.summary)).toBe(JSON.stringify(before.summary));
    expect(JSON.stringify(after.skills)).toBe(JSON.stringify(before.skills));
  });
});

// ADR-020: the status stays 503, the envelope carries the code the recompose failure actually had.
describe('C-009 503 carries the real code (ADR-020)', () => {
  const cases: Array<[string, Error]> = [
    ['CONFIG_MISSING', new GatewayError('CONFIG_MISSING')],
    ['LLM_AUTH_FAILED', new GatewayError('LLM_AUTH_FAILED')],
    ['LLM_INVALID_REQUEST', new GatewayError('LLM_INVALID_REQUEST')],
    ['LLM_UNAVAILABLE', new GatewayError('LLM_UNAVAILABLE')],
  ];

  for (const [code, error] of cases) {
    it(`a recompose failing with ${code} answers 503 ${code} with its safe message, and the answer survives`, async () => {
      const owner = await seedUser();
      const cv = await seedCv(owner.userId);
      app = await buildWith(fakePipeline({ composeError: error }).pipeline);
      try {
        const res = await answer(owner.cookie, cv.cvId, cv.ids.qPeriod, { answer: ANSWER });
        const body = expectEnvelope(res, 503, code);
        expect(body.error.message).toBe(safeMessage(code as Parameters<typeof safeMessage>[0]));
        const userFacts = await prisma.fact.findMany({ where: { cvId: cv.cvId, source: 'user' } });
        expect(userFacts.map((f) => f.text)).toEqual([ANSWER]);
        const row = await prisma.question.findUniqueOrThrow({ where: { id: cv.ids.qPeriod } });
        expect(row.status).toBe('answered');
        expect(row.answer).toBe(ANSWER);
      } finally {
        await app.close();
      }
    });
  }
});
