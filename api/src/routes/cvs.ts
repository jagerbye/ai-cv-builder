import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getCv } from '../core/cv/read.js';
import { listCvs } from '../core/cv/list.js';
import { deleteCv } from '../core/cv/delete.js';
import { applyCvPatch } from '../core/cv/patch.js';
import { answerQuestion } from '../core/cv/answer.js';
import { enqueueRegenerate } from '../core/cv/regenerate.js';
import type { GenerationPipeline } from '../core/generation/types.js';
import { requireUser } from '../http/requireUser.js';

// T-17 (CVB-15). C-006 read, C-007 list and delete. T-18 (CVB-16). C-008 PATCH. This plugin owns only these routes.
// The session user is set by the requireUser preHandler (ADR-007), which answers 401 before any handler runs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sessionUserId(request: FastifyRequest): string {
  return (request.user as { id: string }).id;
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'CV not found.' } });
}

export interface CvsRoutesOptions {
  generationPipeline: GenerationPipeline;
}

export async function cvsRoutes(app: FastifyInstance, opts: CvsRoutesOptions): Promise<void> {
  app.get('/cvs', { preHandler: requireUser }, async (request) => {
    const userId = sessionUserId(request);
    return { items: await listCvs(app.prisma, userId) };
  });

  app.get<{ Params: { cvId: string } }>('/cvs/:cvId', { preHandler: requireUser }, async (request, reply) => {
    const userId = sessionUserId(request);
    const { cvId } = request.params;
    if (!UUID.test(cvId)) return notFound(reply);
    return getCv(app.prisma, userId, cvId);
  });

  app.patch<{ Params: { cvId: string } }>('/cvs/:cvId', { preHandler: requireUser }, async (request, reply) => {
    const userId = sessionUserId(request);
    const { cvId } = request.params;
    if (!UUID.test(cvId)) return notFound(reply);
    const result = await applyCvPatch(app.prisma, userId, cvId, request.body);
    if (result.ok) return result.cv;
    if (result.reason === 'VALIDATION') {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: result.message } });
    }
    if (result.reason === 'NOT_FOUND') return notFound(reply);
    return reply.code(409).send({
      error: { code: 'VERSION_CONFLICT', message: 'This CV changed since you loaded it. Reload it and apply your edit again.' },
    });
  });

  // T-20 (CVB-17). C-009. The pipeline is injected (worker.ts precedent), never read from a decorator.
  app.post<{ Params: { cvId: string; questionId: string } }>(
    '/cvs/:cvId/questions/:questionId/answer',
    { preHandler: requireUser },
    async (request) => {
      const userId = sessionUserId(request);
      const { cvId, questionId } = request.params;
      return answerQuestion(app.prisma, opts.generationPipeline, userId, cvId, questionId, request.body);
    },
  );

  // T-26 (CVB-29). C-010. Enqueues one full job through the shared queue; 409 when one is in flight.
  app.post<{ Params: { cvId: string } }>('/cvs/:cvId/regenerate', { preHandler: requireUser }, async (request, reply) => {
    const userId = sessionUserId(request);
    const { cvId } = request.params;
    if (!UUID.test(cvId)) return notFound(reply);
    const { jobId } = await enqueueRegenerate(app.prisma, userId, cvId);
    return reply.code(202).send({ jobId });
  });

  app.delete<{ Params: { cvId: string } }>('/cvs/:cvId', { preHandler: requireUser }, async (request, reply) => {
    const userId = sessionUserId(request);
    const { cvId } = request.params;
    if (!UUID.test(cvId)) return notFound(reply);
    await deleteCv(app.prisma, userId, cvId);
    return reply.code(204).send();
  });
}
