import type { FastifyInstance } from 'fastify';
import { getJob } from '../core/jobs/read.js';
import { requireUser } from '../http/requireUser.js';

// T-16 (CVB-8). C-005 GET /api/jobs/:jobId. This plugin owns only this route.
// Ownership is checked in the query (core/jobs/read.ts): another user's job answers 404, never 403.
// The session user is set by the requireUser preHandler (ADR-007), which answers 401 first.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function jobsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { jobId: string } }>('/jobs/:jobId', { preHandler: requireUser }, async (request, reply) => {
    const userId = (request.user as { id: string }).id;
    const { jobId } = request.params;
    const job = UUID.test(jobId) ? await getJob(app.prisma, userId, jobId) : null;
    if (!job) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Job not found.' } });
    }
    return job;
  });
}
