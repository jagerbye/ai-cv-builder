import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getJob } from '../core/jobs/read.js';

// T-16 (CVB-8). C-005 GET /api/jobs/:jobId. This plugin owns only this route.
// Ownership is checked in the query (core/jobs/read.ts): another user's job answers 404, never 403.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_COOKIE = 'sid';

// Temporary local session lookup (ADR-007: sha256 hex of the cookie value), the same as cvs-create.ts.
// The auth lane owns session resolution and should replace this with its own helper.
async function sessionUserId(app: FastifyInstance, cookieHeader: string | undefined): Promise<string | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const session = await app.prisma.session.findUnique({ where: { tokenHash } });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return session.userId;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || undefined;
  }
  return undefined;
}

export async function jobsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { jobId: string } }>('/jobs/:jobId', async (request, reply) => {
    const userId = await sessionUserId(app, request.headers.cookie);
    if (!userId) {
      return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } });
    }
    const { jobId } = request.params;
    const job = UUID.test(jobId) ? await getJob(app.prisma, userId, jobId) : null;
    if (!job) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Job not found.' } });
    }
    return job;
  });
}
