import type { FastifyRequest } from 'fastify';
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

// preHandler for every authenticated route (ADR-007). Throws 401 before the handler
// runs. On success sets request.user from the Session row whose tokenHash matches.
export async function requireUser(request: FastifyRequest): Promise<void> {
  const token = readSessionCookie(request.headers.cookie);
  if (!token || !TOKEN_SHAPE.test(token)) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.');
  }
  const session = await request.server.prisma.session.findFirst({
    where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
    select: { user: { select: { id: true, email: true } } },
  });
  if (!session) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.');
  }
  request.user = { id: session.user.id, email: session.user.email };
}
