import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { extractSource, IntakeError } from '../core/intake/intake.js';
import { createCvFromSource } from '../core/intake/persist.js';

// T-07 (CVB-24, ADR-011) owner: CV creation lane (T-15, CVB-7). Only this file
// registers POST /cvs. C-003 (JSON) is implemented; C-004 (multipart) is not yet:
// see the lane report for the open dependency decision.

const SESSION_COOKIE = 'sid';
const TARGET_ROLE_MAX = 120;

export async function cvsCreateRoutes(app: FastifyInstance): Promise<void> {
  app.post('/cvs', async (request, reply) => {
    const userId = await sessionUserId(app, request.headers.cookie);
    if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'sign in before creating a CV');

    const fields = isRecord(request.body) ? request.body : {};
    const { targetRole, sourceText } = fields;
    if (typeof targetRole !== 'string' || targetRole.length < 1 || targetRole.length > TARGET_ROLE_MAX) {
      return sendError(
        reply,
        400,
        'VALIDATION',
        `targetRole is required: 1 to ${TARGET_ROLE_MAX} characters naming the role you are aiming for`,
      );
    }
    if (sourceText === undefined) {
      return sendError(reply, 400, 'VALIDATION', 'send sourceText (200 to 50000 characters) or a PDF file');
    }
    if (typeof sourceText !== 'string') {
      return sendError(reply, 400, 'VALIDATION', 'sourceText must be a string of text');
    }

    try {
      const source = await extractSource({ kind: 'text', text: sourceText });
      const created = await createCvFromSource(app.prisma, { userId, targetRole, source });
      return reply.code(201).send(created);
    } catch (err) {
      if (err instanceof IntakeError) return sendError(reply, err.status, err.code, err.message);
      throw err;
    }
  });
}

// Temporary local session lookup (ADR-007: sha256 hex of the cookie value). The
// auth lane owns session resolution and should replace this with its own helper.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}
