import type { PrismaClient } from '@prisma/client';
import { assertOwnership } from '../auth/ownership.js';
import { ApiError } from '../../http/errors.js';

// T-26 (CVB-29). C-010 POST /api/cvs/:cvId/regenerate → 202 { jobId }. Enqueues one 'full' job
// in the same generation_jobs queue the intake path uses (ADR-004, persist.ts), and moves the CV
// back to 'generating'. The merge of the regenerated draft (userEdited survives) is the job's
// concern: core/cv/merge.ts mergeRegenerated, applied when the worker persists its verified draft.
//
// One non-terminal job per CV is enforced by the partial unique index generation_jobs_cv_id_in_flight_key.
// A violation (P2002) is a 409 CONFLICT, never a 500. The state write and the insert share a
// transaction, so a 409 leaves the CV exactly as it was.

export interface RegenerateResult {
  jobId: string;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'P2002';
}

export async function enqueueRegenerate(
  prisma: PrismaClient,
  userId: string,
  cvId: string,
): Promise<RegenerateResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Ownership first: another user's CV and an unknown CV both read as 404.
      const cv = await tx.cv.findFirst({ where: { id: cvId }, select: { id: true, userId: true } });
      assertOwnership(userId, cv);
      await tx.cv.update({ where: { id: cvId }, data: { state: 'generating' } });
      const job = await tx.generationJob.create({
        data: { cvId, userId, status: 'queued', scope: 'full' },
        select: { id: true },
      });
      return { jobId: job.id };
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'CONFLICT', 'A generation is already in progress for this CV.');
    }
    throw err;
  }
}
