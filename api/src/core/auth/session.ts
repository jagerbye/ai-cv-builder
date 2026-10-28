import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';

// ADR-007 / C-002. The cookie carries an opaque random token; the database
// keeps only its sha256 (domain-model.md Session.tokenHash). The raw token
// never reaches a row, a log or a response body.

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_S = 30 * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_S * 1000;

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Inserts a Session row for the token and returns the expiry it stored.
export async function createSession(prisma: PrismaClient, userId: string, token: string): Promise<Date> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return expiresAt;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_S}`,
  );
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
