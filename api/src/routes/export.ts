import type { FastifyInstance } from 'fastify';
import { getCv } from '../core/cv/read.js';
import { pdfFilename } from '../core/export/filename.js';
import { renderCvPdf } from '../core/export/render.js';
import { requireUser } from '../http/requireUser.js';

// T-19 (CVB-18). C-011 GET /api/cvs/:cvId/pdf. This plugin owns only this route.
// Ownership and existence come from the CV reader (404 for a missing or foreign CV).
// The session user is set by the requireUser preHandler (ADR-007), which answers 401 first.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { cvId: string } }>('/cvs/:cvId/pdf', { preHandler: requireUser }, async (request, reply) => {
    const userId = (request.user as { id: string }).id;
    const { cvId } = request.params;
    if (!UUID.test(cvId)) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'CV not found.' } });
    }
    const cv = await getCv(app.prisma, userId, cvId);
    if (cv.state !== 'ready') {
      return reply.code(409).send({
        error: { code: 'CONFLICT', message: 'The CV is not ready yet. Download it when generation has finished.' },
      });
    }
    const bytes = await renderCvPdf(cv);
    return reply
      .code(200)
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${pdfFilename(cv.contact.fullName, cv.targetRole)}"`)
      .send(bytes);
  });
}
