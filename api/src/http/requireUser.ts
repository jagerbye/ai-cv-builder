import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from './errors.js';
import { SESSION_COOKIE, hashToken } from '../core/auth/session.js';

// Cookie value shape (base64url, bounded). Anything outside it is rejected before any DB work.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,256}$/;

export interface AuthUser {
  id: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export function readSessionCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) return part.slice(eq + 1).trim();
  }
  return undefined;
}

// The one place a cookie becomes a user (ADR-007). Returns undefined for a missing, malformed,
// unknown or expired session. Shared by requireUser and the rate-limit hook, so both key on the same user.
export async function resolveSessionUser(
  prisma: PrismaClient,
  cookieHeader: string | undefined,
): Promise<AuthUser | undefined> {
  const token = readSessionCookie(cookieHeader);
  if (!token || !TOKEN_SHAPE.test(token)) return undefined;
  const session = await prisma.session.findFirst({
    where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
    select: { user: { select: { id: true, email: true } } },
  });
  if (!session) return undefined;
  return { id: session.user.id, email: session.user.email };
}

// preHandler for every authenticated route (ADR-007). Throws 401 before the handler runs.
// If the global rate-limit hook already resolved the user for this request, that result is reused.
export async function requireUser(request: FastifyRequest): Promise<void> {
  if (request.user) return;
  const user = await resolveSessionUser(request.server.prisma, request.headers.cookie);
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.');
  }
  request.user = user;
}
