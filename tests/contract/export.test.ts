import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { PDFParse } from 'pdf-parse';
import { buildServer } from '../../api/src/server.js';

// T-19 (CVB-18). Contract tests for C-011 (GET /api/cvs/:cvId/pdf). Black-box over
// the Fastify app with the real database. Seeds rows directly, authenticates with a
// `sid` cookie whose sha256 is stored as sessions.token_hash. Error envelope and
// 404-for-others rules come from api-contracts.md C-000.
// Expected to be RED now: the route is not registered, so the owner request answers 404.

const prisma = new PrismaClient();
let app: FastifyInstance;
const userIds: string[] = [];

interface Seeded {
  userId: string;
  cookie: string;
}

async function seedUser(): Promise<Seeded> {
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await prisma.user.create({
    data: { id: userId, email: `export-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
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

async function seedCv(
  userId: string,
  opts: { state: 'ready' | 'generating'; title: string; targetRole: string },
): Promise<string> {
  const cvId = randomUUID();
  await prisma.cv.create({
    data: {
      id: cvId,
      userId,
      title: opts.title,
      targetRole: opts.targetRole,
      sourceKind: 'text',
      sourceText: 'Ada Lovelace, Backend Engineer, London. Lead Engineer at Babbage Works.',
      state: opts.state,
      version: 1,
    },
  });
  const expId = randomUUID();
  await prisma.cvItem.createMany({
    data: [
      { id: randomUUID(), cvId, kind: 'contact', path: 'contact', orderIndex: 0, data: { fullName: 'Ada Lovelace', email: 'ada@example.com', links: [] }, factIds: [], userEdited: false },
      { id: expId, cvId, kind: 'experience', path: 'experience[0]', orderIndex: 0, data: { employer: 'Babbage Works', role: 'Lead Engineer', period: 'Mar 2019 – Present' }, factIds: [], relevance: 0.9, userEdited: false },
      { id: randomUUID(), cvId, kind: 'bullet', parentId: expId, path: 'experience[0].bullets[0]', orderIndex: 0, data: { text: 'Cut build time by 40%' }, factIds: [], userEdited: false },
    ],
  });
  return cvId;
}

function pdfRequest(cvId: string, cookie?: string) {
  return app.inject({
    method: 'GET',
    url: `/api/cvs/${cvId}/pdf`,
    ...(cookie ? { headers: { cookie } } : {}),
  });
}

async function extractText(body: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(body) });
  const result = await parser.getText();
  return result.text;
}

beforeAll(async () => {
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  // Users cascade to sessions, cvs, cv_items and everything below them.
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await app.close();
  await prisma.$disconnect();
});

describe('C-011 GET /api/cvs/:cvId/pdf', () => {
  it('returns application/pdf, an attachment filename from name and role, and a real text layer', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId, { state: 'ready', title: 'Ada Lovelace – Backend Engineer', targetRole: 'Backend Engineer' });

    const res = await pdfRequest(cvId, owner.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="ada-lovelace-backend-engineer.pdf"',
    );

    const body = res.rawPayload;
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const text = await extractText(body);
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Babbage Works');
    expect(text).toContain('Cut build time by 40%');
  });

  it('answers 409 CONFLICT while the CV is not ready', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId, { state: 'generating', title: 'Ada Lovelace – Backend Engineer', targetRole: 'Backend Engineer' });

    const res = await pdfRequest(cvId, owner.cookie);
    expect(res.statusCode).toBe(409);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.json()).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(res.json().error.message).toEqual(expect.any(String));
  });

  it('answers 404 NOT_FOUND for another user\'s CV, after the owner proof succeeds', async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    const cvId = await seedCv(owner.userId, { state: 'ready', title: 'Ada Lovelace – Backend Engineer', targetRole: 'Backend Engineer' });

    // Owner proof: the same route returns the PDF, so the 404 below is not a missing route.
    const ownerRes = await pdfRequest(cvId, owner.cookie);
    expect(ownerRes.statusCode).toBe(200);
    expect(ownerRes.headers['content-type']).toMatch(/^application\/pdf/);

    const res = await pdfRequest(cvId, stranger.cookie);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
    expect(res.headers['content-type']).not.toMatch(/application\/pdf/);
  });

  it('answers 404 NOT_FOUND for an unknown id', async () => {
    const owner = await seedUser();
    const res = await pdfRequest(randomUUID(), owner.cookie);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('answers 401 UNAUTHENTICATED without a session', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId, { state: 'ready', title: 'Ada Lovelace – Backend Engineer', targetRole: 'Backend Engineer' });

    const res = await pdfRequest(cvId);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });
});
