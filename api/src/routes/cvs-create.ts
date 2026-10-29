import { toErrorResponse } from '../http/errors.js';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { extractSource, IntakeError, PDF_TOO_LARGE_MESSAGE } from '../core/intake/intake.js';
import { createCvFromSource } from '../core/intake/persist.js';
import { MAX_PDF_BYTES } from '../core/intake/intake.js';
import { MultipartError, parseMultipart, type MultipartFile } from '../core/intake/multipart.js';
import { requireUser } from '../http/requireUser.js';

// T-07 (CVB-24, ADR-011) owner: CV creation lane (T-15, CVB-7). Only this file
// registers POST /cvs. C-003 (JSON) and C-004 (multipart, parsed by
// core/intake/multipart.ts: no library is in the dependency budget).

const TARGET_ROLE_MAX = 120;
// File cap plus room for field and part headers; the exact 10 MB rule lives in intake.ts.
const MULTIPART_BODY_LIMIT = MAX_PDF_BYTES + 1024 * 1024;

export async function cvsCreateRoutes(app: FastifyInstance): Promise<void> {
  // Encapsulated to this plugin: only POST /cvs accepts multipart.
  app.addContentTypeParser(
    'multipart/form-data',
    { parseAs: 'buffer', bodyLimit: MULTIPART_BODY_LIMIT },
    (request, body, done) => {
      try {
        done(null, parseMultipart(body as Buffer, String(request.headers['content-type'] ?? '')));
      } catch (err) {
        const message = err instanceof MultipartError ? err.message : 'the upload could not be read';
        done(Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION' }));
      }
    },
  );

  // Body-limit 413 (a multipart body over the cap) names the 10 MB fix too; everything else
  // goes through the shared C-000 mapping.
  app.setErrorHandler((err, request, reply) => {
    const e = err as { code?: unknown; statusCode?: unknown };
    if (e.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || e.statusCode === 413) {
      return sendError(reply, 413, 'PAYLOAD_TOO_LARGE', PDF_TOO_LARGE_MESSAGE);
    }
    const { status, body } = toErrorResponse(err);
    request.log.warn({ status, errorCode: e.code, reqId: request.id }, 'request failed');
    return reply.code(status).send(body);
  });

  // The session user comes from requireUser (ADR-007), which answers 401 before this handler runs.
  app.post('/cvs', { preHandler: requireUser }, async (request, reply) => {
    const userId = (request.user as { id: string }).id;

    let file: MultipartFile | undefined;
    let fields: Record<string, unknown> = {};
    if (isMultipart(request.body)) {
      fields = request.body.fields;
      if (request.body.files.length > 1) {
        return sendError(reply, 400, 'VALIDATION', 'send exactly one PDF in the file field');
      }
      file = request.body.files[0];
    } else if (isRecord(request.body)) {
      fields = request.body;
    }
    const { targetRole, sourceText } = fields;
    if (typeof targetRole !== 'string' || targetRole.length < 1 || targetRole.length > TARGET_ROLE_MAX) {
      return sendError(
        reply,
        400,
        'VALIDATION',
        `targetRole is required: 1 to ${TARGET_ROLE_MAX} characters naming the role you are aiming for`,
      );
    }
    if (file && sourceText !== undefined) {
      return sendError(reply, 400, 'VALIDATION', 'send either sourceText or a PDF file, not both');
    }
    if (!file && sourceText === undefined) {
      return sendError(reply, 400, 'VALIDATION', 'send sourceText (200 to 50000 characters) or a PDF file');
    }
    if (!file && typeof sourceText !== 'string') {
      return sendError(reply, 400, 'VALIDATION', 'sourceText must be a string of text');
    }

    try {
      const source = await extractSource(
        file ? { kind: 'pdf', bytes: file.bytes } : { kind: 'text', text: sourceText as string },
      );
      const created = await createCvFromSource(app.prisma, { userId, targetRole, source });
      return reply.code(201).send(created);
    } catch (err) {
      if (err instanceof IntakeError) return sendError(reply, err.status, err.code, err.message);
      throw err;
    }
  });
}

function isMultipart(value: unknown): value is { fields: Record<string, string>; files: MultipartFile[] } {
  return isRecord(value) && isRecord(value.fields) && Array.isArray(value.files);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}
