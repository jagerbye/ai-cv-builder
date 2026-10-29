import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../api/src/server.js';

// ADR-017 (sprint 001, lane F). C-006 read side: lastError comes from the CV's own columns, and only a CV in
// state failed shows it. Seeds rows directly, no job rows, so the read cannot be joined to generation_jobs.

const prisma = new PrismaClient();
let app: FastifyInstance;
const userIds: string[] = [];

async function seedUser(): Promise<{ cookie: string }> {
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  userIds.push(userId);
  await prisma.user.create({
    data: { id: userId, email: `cvs-read-lasterr-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    },
  });
  return { cookie: `sid=${token}` };
}

async function seedCvInState(
  userId: string,
  state: 'ready' | 'failed' | 'generating',
  lastError: { code: string; message: string } | null,
): Promise<string> {
  const cvId = randomUUID();
  await prisma.cv.create({
    data: {
      id: cvId,
      userId,
      title: 'Ada Lovelace – Backend Engineer',
      targetRole: 'Backend Engineer',
      sourceKind: 'text',
      sourceText: 'Ada Lovelace, Backend Engineer, London.',
      state,
      version: 1,
      lastErrorCode: lastError?.code ?? null,
      lastErrorMessage: lastError?.message ?? null,
    },
  });
  return cvId;
}

beforeAll(async () => {
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close();
  await prisma.$disconnect();
});

describe('ADR-017 C-006 lastError', () => {
  it('a failed CV returns lastError { code, message } from its own columns', async () => {
    const { cookie } = await seedUser();
    const owner = await prisma.session.findFirstOrThrow({ where: { tokenHash: createHash('sha256').update(cookie.slice(4)).digest('hex') }, select: { userId: true } });
    const cvId = await seedCvInState(owner.userId, 'failed', {
      code: 'CONFIG_MISSING',
      message: 'The server is not configured for this request.',
    });

    const res = await app.inject({ method: 'GET', url: `/api/cvs/${cvId}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      state: 'failed',
      lastError: { code: 'CONFIG_MISSING', message: 'The server is not configured for this request.' },
    });
  });

  it('a ready CV has no lastError key', async () => {
    const { cookie } = await seedUser();
    const owner = await prisma.session.findFirstOrThrow({ where: { tokenHash: createHash('sha256').update(cookie.slice(4)).digest('hex') }, select: { userId: true } });
    const cvId = await seedCvInState(owner.userId, 'ready', null);

    const res = await app.inject({ method: 'GET', url: `/api/cvs/${cvId}`, headers: { cookie } });
    expect(res.json()).not.toHaveProperty('lastError');
  });

  it('a generating CV with a leftover error column has no lastError key', async () => {
    const { cookie } = await seedUser();
    const owner = await prisma.session.findFirstOrThrow({ where: { tokenHash: createHash('sha256').update(cookie.slice(4)).digest('hex') }, select: { userId: true } });
    const cvId = await seedCvInState(owner.userId, 'generating', {
      code: 'INTERNAL',
      message: 'Something went wrong on our side.',
    });

    const res = await app.inject({ method: 'GET', url: `/api/cvs/${cvId}`, headers: { cookie } });
    expect(res.json()).not.toHaveProperty('lastError');
  });
});
