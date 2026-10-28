import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../../http/errors.js';
import { hashPassword } from './password.js';
import { createSession, newSessionToken, setSessionCookie } from './session.js';

// C-001 POST /api/auth/register (F-001). Validation runs on the route JSON schema;
// its errors reach the C-000 envelope via installErrorEnvelope (http/errors.ts).

export const REGISTER_BODY_SCHEMA = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email', maxLength: 320, pattern: '^[^\\s@]+@[^\\s@]+$' },
    password: { type: 'string', minLength: 10, maxLength: 200 },
  },
  additionalProperties: true,
} as const;

interface RegisterBody {
  email: string;
  password: string;
}

// Prisma's unique-constraint violation. Race-safe: the database decides, not a pre-read.
const UNIQUE_VIOLATION = 'P2002';

export async function registerHandler(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { email, password } = request.body as RegisterBody;
  const passwordHash = await hashPassword(password);

  let user: { id: string; email: string };
  try {
    user = await app.prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });
  } catch (err) {
    if ((err as { code?: unknown })?.code === UNIQUE_VIOLATION) {
      // Generic on purpose: the message does not confirm the address exists.
      throw new ApiError(409, 'CONFLICT', 'Registration could not be completed with these details.');
    }
    throw err;
  }

  // The raw token goes only into the cookie; the row keeps its sha256 (ADR-007).
  const token = newSessionToken();
  await createSession(app.prisma, user.id, token);
  setSessionCookie(reply, token);
  return reply.code(201).send({ user: { id: user.id, email: user.email } });
}
