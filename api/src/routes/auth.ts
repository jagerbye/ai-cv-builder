import type { FastifyInstance } from 'fastify';
import { installErrorEnvelope, ApiError } from '../http/errors.js';
import { readSessionCookie, requireUser } from '../http/requireUser.js';
import { REGISTER_BODY_SCHEMA, registerHandler } from '../core/auth/register.js';
import { hashPassword, verifyPassword } from '../core/auth/password.js';
import {
  clearSessionCookie,
  createSession,
  hashToken,
  newSessionToken,
  setSessionCookie,
} from '../core/auth/session.js';

// T-03 register (CVB-3), T-04 login/logout/me (CVB-4). Auth plugin, registered under /api
// in server.ts. Installs the C-000 envelope on its context, so every auth answer, and an
// unmatched /api path under it, uses the envelope.

const LOGIN_BODY_SCHEMA = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', maxLength: 320 },
    password: { type: 'string', maxLength: 200 },
  },
  additionalProperties: true,
} as const;

interface LoginBody {
  email: string;
  password: string;
}

// Same message for unknown email and wrong password (C-002, F-001 no enumeration).
const BAD_CREDENTIALS = 'Email or password is not correct.';

// Used when the email is unknown, so the unknown-email path also runs one argon2 verify.
let dummyHash: Promise<string> | undefined;
function unknownEmailHash(): Promise<string> {
  dummyHash ??= hashPassword('unknown-email-timing-placeholder');
  return dummyHash;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Installed on the parent /api context (see skip-override below), so sibling /api plugins registered after this one get the C-000 envelope too.
  installErrorEnvelope(app);

  app.post(
    '/auth/register',
    { schema: { body: REGISTER_BODY_SCHEMA } },
    (request, reply) => registerHandler(app, request, reply),
  );

  app.post(
    '/auth/login',
    { schema: { body: LOGIN_BODY_SCHEMA } },
    async (request, reply) => {
      const { email, password } = request.body as LoginBody;
      const user = await app.prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true },
      });
      const ok = await verifyPassword(password, user ? user.passwordHash : await unknownEmailHash());
      if (!user || !ok) {
        throw new ApiError(401, 'UNAUTHENTICATED', BAD_CREDENTIALS);
      }
      const token = newSessionToken();
      await createSession(app.prisma, user.id, token);
      setSessionCookie(reply, token);
      return reply.code(200).send({ user: { id: user.id, email: user.email } });
    },
  );

  // Idempotent: deletes the row for the presented cookie, if any, and always answers 204.
  app.post('/auth/logout', async (request, reply) => {
    const token = readSessionCookie(request.headers.cookie);
    if (token) {
      await app.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    return reply.code(200).send({ user: { id: user.id, email: user.email } });
  });
}

// Same effect as fastify-plugin (not a dependency): run in the parent context instead of an encapsulated child.
(authRoutes as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
