import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../api/src/server.js';

// T-17 (CVB-15). Contract tests for C-006 (GET /api/cvs/:cvId) and C-007
// (GET /api/cvs, DELETE /api/cvs/:cvId). Black-box over the Fastify app with the
// real database: seeds rows directly, authenticates with a `sid` cookie whose
// sha256 is stored as sessions.token_hash (domain-model.md Session).
// Error envelope and 404-for-others rules come from api-contracts.md C-000.

const prisma = new PrismaClient();
let app: FastifyInstance;

function sessionCookie(token: string): string {
  return `sid=${token}`;
}

interface Seeded {
  userId: string;
  cookie: string;
}

async function seedUser(): Promise<Seeded> {
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await prisma.user.create({
    data: { id: userId, email: `cvs-read-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    },
  });
  return { userId, cookie: sessionCookie(token) };
}

const SOURCE_TEXT = [
  'Ada Lovelace, Backend Engineer, London. ada@example.com, +44 20 7946 0000.',
  'Lead Engineer at Babbage Works, Mar 2019 to present: reduced build times by 40 percent.',
  'Engineer at Analytical Engines, Jan 2015 to Dec 2017.',
  'BSc Mathematics, University of London, 2011 to 2014. Skills: TypeScript.',
].join(' ');

interface SeededCv {
  cvId: string;
  ids: {
    contact: string;
    summary: string;
    expHigh: string;
    expLow: string;
    bulletA: string;
    bulletB: string;
    education: string;
    skill: string;
    factSummary: string;
    factBullet: string;
    factSkill: string;
    factUser: string;
    questionOpen: string;
  };
}

async function seedCv(
  userId: string,
  opts: { title: string; targetRole: string; updatedAt: string; full?: boolean },
): Promise<SeededCv> {
  const cvId = randomUUID();
  const ids = {
    contact: randomUUID(),
    summary: randomUUID(),
    expHigh: randomUUID(),
    expLow: randomUUID(),
    bulletA: randomUUID(),
    bulletB: randomUUID(),
    education: randomUUID(),
    skill: randomUUID(),
    factSummary: randomUUID(),
    factBullet: randomUUID(),
    factSkill: randomUUID(),
    factUser: randomUUID(),
    questionOpen: randomUUID(),
  };
  await prisma.cv.create({
    data: {
      id: cvId,
      userId,
      title: opts.title,
      targetRole: opts.targetRole,
      sourceKind: 'text',
      sourceText: SOURCE_TEXT,
      state: 'ready',
      version: 3,
      updatedAt: new Date(opts.updatedAt),
    },
  });
  await prisma.fact.createMany({
    data: [
      { id: ids.factSummary, cvId, kind: 'employment', text: 'Backend engineer in London', sourceQuote: 'Ada Lovelace, Backend Engineer, London', source: 'document' },
      { id: ids.factBullet, cvId, kind: 'achievement', text: 'Cut build time by 40%', sourceQuote: 'reduced build times by 40 percent', source: 'document' },
      { id: ids.factSkill, cvId, kind: 'skill', text: 'TypeScript', sourceQuote: 'Skills: TypeScript', source: 'document' },
      { id: ids.factUser, cvId, kind: 'employment', text: 'Led a team of six', sourceQuote: '', source: 'user' },
    ],
  });
  await prisma.cvItem.createMany({
    data: [
      { id: ids.contact, cvId, kind: 'contact', path: 'contact', orderIndex: 0, data: { fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '+44 20 7946 0000', location: 'London', links: ['https://example.com/ada'] }, factIds: [ids.factSummary], userEdited: false },
      { id: ids.summary, cvId, kind: 'summary', path: 'summary', orderIndex: 0, data: { text: 'Backend engineer who ships fast builds.' }, factIds: [ids.factSummary], userEdited: false },
      { id: ids.expHigh, cvId, kind: 'experience', path: 'experience[0]', orderIndex: 1, data: { employer: 'Babbage Works', role: 'Lead Engineer', period: 'Mar 2019 – Present' }, factIds: [], relevance: 0.9, userEdited: false },
      { id: ids.expLow, cvId, kind: 'experience', path: 'experience[1]', orderIndex: 0, data: { employer: 'Analytical Engines', role: 'Engineer', period: 'Jan 2015 – Dec 2017' }, factIds: [], relevance: 0.4, userEdited: false },
      { id: ids.bulletA, cvId, kind: 'bullet', parentId: ids.expHigh, path: 'experience[0].bullets[0]', orderIndex: 0, data: { text: 'Cut build time by 40%' }, factIds: [ids.factBullet], userEdited: false },
      { id: ids.bulletB, cvId, kind: 'bullet', parentId: ids.expHigh, path: 'experience[0].bullets[1]', orderIndex: 1, data: { text: 'Led a team of six' }, factIds: [ids.factUser], userEdited: true },
      { id: ids.education, cvId, kind: 'education', path: 'education[0]', orderIndex: 0, data: { institution: 'University of London', degree: 'BSc Mathematics', period: '2011 – 2014' }, factIds: [], userEdited: false },
      { id: ids.skill, cvId, kind: 'skill', path: 'skills[0]', orderIndex: 0, data: { name: 'TypeScript', group: 'Languages' }, factIds: [ids.factSkill], userEdited: false },
    ],
  });
  await prisma.question.create({
    data: { id: ids.questionOpen, cvId, path: 'experience[0].bullets[1]', text: 'What was the team size?', reason: 'missing', status: 'open', priority: 1 },
  });
  await prisma.question.create({
    data: { cvId, path: 'experience[1]', text: 'Is the 2015 role still relevant?', reason: 'vague', status: 'dismissed', priority: 50 },
  });
  await prisma.generationJob.create({
    data: { cvId, userId, status: 'succeeded', attempt: 1, scope: 'full' },
  });
  return { cvId, ids };
}

async function getCv(cookie: string, cvId: string) {
  return app.inject({ method: 'GET', url: `/api/cvs/${cvId}`, headers: { cookie } });
}

async function listCvs(cookie: string) {
  return app.inject({ method: 'GET', url: '/api/cvs', headers: { cookie } });
}

async function deleteCv(cookie: string, cvId: string) {
  return app.inject({ method: 'DELETE', url: `/api/cvs/${cvId}`, headers: { cookie } });
}

const userIds: string[] = [];

beforeAll(async () => {
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  // Users cascade to sessions, cvs, facts, cv_items, questions and jobs.
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await app.close();
  await prisma.$disconnect();
});

async function newUser(): Promise<Seeded> {
  const u = await seedUser();
  userIds.push(u.userId);
  return u;
}

describe('C-006 GET /api/cvs/:cvId', () => {
  it('returns the full documented shape with facts, sources and ordered experience', async () => {
    const owner = await newUser();
    const cv = await seedCv(owner.userId, {
      title: 'Ada Lovelace – Backend Engineer',
      targetRole: 'Backend Engineer',
      updatedAt: '2026-10-20T10:00:00.000Z',
    });

    const res = await getCv(owner.cookie, cv.cvId);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Exactly the documented top-level keys: no owner id, no source text.
    expect(Object.keys(body).sort()).toEqual(
      ['contact', 'education', 'experience', 'facts', 'id', 'questions', 'skills', 'state', 'summary', 'targetRole', 'title', 'updatedAt', 'version'].sort(),
    );
    expect(body).toMatchObject({
      id: cv.cvId,
      title: 'Ada Lovelace – Backend Engineer',
      targetRole: 'Backend Engineer',
      state: 'ready',
      version: 3,
      updatedAt: '2026-10-20T10:00:00.000Z',
    });

    expect(body.contact).toEqual({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+44 20 7946 0000',
      location: 'London',
      links: ['https://example.com/ada'],
    });
    expect(body.summary).toEqual({
      text: 'Backend engineer who ships fast builds.',
      factIds: [cv.ids.factSummary],
      userEdited: false,
    });

    // Experience: relevance 0.9 before 0.4, regardless of insertion order.
    expect(body.experience.map((e: { id: string }) => e.id)).toEqual([cv.ids.expHigh, cv.ids.expLow]);
    expect(body.experience[0]).toMatchObject({
      employer: 'Babbage Works',
      role: 'Lead Engineer',
      period: 'Mar 2019 – Present',
      relevance: 0.9,
      userEdited: false,
    });
    expect(body.experience[0].bullets).toEqual([
      { id: cv.ids.bulletA, text: 'Cut build time by 40%', factIds: [cv.ids.factBullet], userEdited: false },
      { id: cv.ids.bulletB, text: 'Led a team of six', factIds: [cv.ids.factUser], userEdited: true },
    ]);

    expect(body.education).toEqual([
      {
        id: cv.ids.education,
        institution: 'University of London',
        degree: 'BSc Mathematics',
        period: '2011 – 2014',
        order: 0,
        userEdited: false,
      },
    ]);
    expect(body.skills).toEqual([
      { id: cv.ids.skill, name: 'TypeScript', group: 'Languages', factIds: [cv.ids.factSkill], userEdited: false },
    ]);

    expect(body.questions).toHaveLength(2);
    expect(body.questions).toContainEqual({
      id: cv.ids.questionOpen,
      path: 'experience[0].bullets[1]',
      text: 'What was the team size?',
      status: 'open',
    });
    expect(body.questions.map((q: { status: string }) => q.status).sort()).toEqual(['dismissed', 'open']);

    // Facts carry the verbatim quote behind each line (F-004), and user facts have none.
    expect(body.facts).toHaveLength(4);
    expect(body.facts).toContainEqual({
      id: cv.ids.factBullet,
      kind: 'achievement',
      text: 'Cut build time by 40%',
      sourceQuote: 'reduced build times by 40 percent',
      source: 'document',
    });
    expect(body.facts).toContainEqual({
      id: cv.ids.factUser,
      kind: 'employment',
      text: 'Led a team of six',
      sourceQuote: '',
      source: 'user',
    });

    // Every factId a line cites resolves to a fact in the response.
    const factIds = new Set(body.facts.map((f: { id: string }) => f.id));
    const cited = [
      ...body.summary.factIds,
      ...body.experience.flatMap((e: { bullets: { factIds: string[] }[] }) => e.bullets.flatMap((b) => b.factIds)),
      ...body.skills.flatMap((s: { factIds: string[] }) => s.factIds),
    ];
    expect(cited.length).toBeGreaterThan(0);
    for (const id of cited) expect(factIds.has(id)).toBe(true);
  });

  it('returns 404 NOT_FOUND for another user\'s CV, and the owner can still read it', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const cv = await seedCv(owner.userId, {
      title: 'Owner CV',
      targetRole: 'Engineer',
      updatedAt: '2026-10-15T09:00:00.000Z',
    });

    // Proof the route works and the owner is allowed, so the 404 below is an ownership decision.
    const ownerRes = await getCv(owner.cookie, cv.cvId);
    expect(ownerRes.statusCode).toBe(200);
    expect(ownerRes.json().id).toBe(cv.cvId);

    const strangerRes = await getCv(stranger.cookie, cv.cvId);
    expect(strangerRes.statusCode).toBe(404);
    expect(strangerRes.json().error.code).toBe('NOT_FOUND');
    // No existence leak: the body does not echo the id.
    expect(strangerRes.body).not.toContain(cv.cvId);
  });

  it('returns 404 NOT_FOUND in the error envelope for an unknown id', async () => {
    const owner = await newUser();
    const res = await getCv(owner.cookie, randomUUID());
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(typeof res.json().error.message).toBe('string');
  });
});

describe('C-007 GET /api/cvs', () => {
  it('lists only the session user\'s CVs, newest first, with the five summary fields', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const oldest = await seedCv(alice.userId, { title: 'Oldest', targetRole: 'Dev', updatedAt: '2026-10-01T08:00:00.000Z' });
    const newest = await seedCv(alice.userId, { title: 'Newest', targetRole: 'Lead', updatedAt: '2026-10-27T08:00:00.000Z' });
    const middle = await seedCv(alice.userId, { title: 'Middle', targetRole: 'Architect', updatedAt: '2026-10-20T08:00:00.000Z' });
    const bobsCv = await seedCv(bob.userId, { title: 'Bob\'s CV', targetRole: 'Designer', updatedAt: '2026-10-28T08:00:00.000Z' });

    const res = await listCvs(alice.cookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([newest.cvId, middle.cvId, oldest.cvId]);
    expect(body.items.map((i: { id: string }) => i.id)).not.toContain(bobsCv.cvId);
    expect(body.items[0]).toEqual({
      id: newest.cvId,
      title: 'Newest',
      targetRole: 'Lead',
      state: 'ready',
      updatedAt: '2026-10-27T08:00:00.000Z',
    });

    const bobRes = await listCvs(bob.cookie);
    expect(bobRes.statusCode).toBe(200);
    expect(bobRes.json().items.map((i: { id: string }) => i.id)).toEqual([bobsCv.cvId]);
  });

  it('returns an empty items array for a user with no CVs', async () => {
    const nobody = await newUser();
    const res = await listCvs(nobody.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
  });
});

describe('C-007 DELETE /api/cvs/:cvId', () => {
  it('returns 204 and cascades facts, items, questions and jobs; the CV is then 404', async () => {
    const owner = await newUser();
    const keep = await newUser();
    const cv = await seedCv(owner.userId, { title: 'To delete', targetRole: 'Dev', updatedAt: '2026-10-10T08:00:00.000Z' });
    const other = await seedCv(keep.userId, { title: 'Keep me', targetRole: 'Dev', updatedAt: '2026-10-10T08:00:00.000Z' });

    // Precondition: the rows exist, so the cascade below is observable.
    expect(await prisma.fact.count({ where: { cvId: cv.cvId } })).toBe(4);
    expect(await prisma.cvItem.count({ where: { cvId: cv.cvId } })).toBe(8);
    expect(await prisma.question.count({ where: { cvId: cv.cvId } })).toBe(2);
    expect(await prisma.generationJob.count({ where: { cvId: cv.cvId } })).toBe(1);

    const res = await deleteCv(owner.cookie, cv.cvId);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');

    expect(await prisma.cv.count({ where: { id: cv.cvId } })).toBe(0);
    expect(await prisma.fact.count({ where: { cvId: cv.cvId } })).toBe(0);
    expect(await prisma.cvItem.count({ where: { cvId: cv.cvId } })).toBe(0);
    expect(await prisma.question.count({ where: { cvId: cv.cvId } })).toBe(0);
    expect(await prisma.generationJob.count({ where: { cvId: cv.cvId } })).toBe(0);

    const after = await getCv(owner.cookie, cv.cvId);
    expect(after.statusCode).toBe(404);
    expect(after.json().error.code).toBe('NOT_FOUND');

    // Another user's CV is untouched by the delete.
    expect(await prisma.cv.count({ where: { id: other.cvId } })).toBe(1);
    expect((await getCv(keep.cookie, other.cvId)).statusCode).toBe(200);
  });

  it('returns 404 NOT_FOUND for another user\'s CV and deletes nothing', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const cv = await seedCv(owner.userId, { title: 'Protected', targetRole: 'Dev', updatedAt: '2026-10-12T08:00:00.000Z' });

    // Proof the owner can read it, so the 404 below is an ownership decision.
    expect((await getCv(owner.cookie, cv.cvId)).statusCode).toBe(200);

    const res = await deleteCv(stranger.cookie, cv.cvId);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');

    expect(await prisma.cv.count({ where: { id: cv.cvId } })).toBe(1);
    expect(await prisma.fact.count({ where: { cvId: cv.cvId } })).toBe(4);
    expect((await getCv(owner.cookie, cv.cvId)).statusCode).toBe(200);
  });

  it('returns 404 NOT_FOUND in the error envelope for an unknown id', async () => {
    const owner = await newUser();
    const res = await deleteCv(owner.cookie, randomUUID());
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
