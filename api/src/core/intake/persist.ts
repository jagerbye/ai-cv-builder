import type { PrismaClient } from '@prisma/client';
import type { ExtractedSource } from './intake.js';

// T-15 (CVB-7, spec §3.2). Writes the source verbatim and enqueues the first
// generation job in one transaction. The job row is the hand-off to the runner
// (T-16); nothing here calls the LLM, so the source is durable before any model
// call and a regeneration never needs the upload again.

export interface CreatedCv {
  cvId: string;
  jobId: string;
}

export async function createCvFromSource(
  prisma: PrismaClient,
  args: { userId: string; targetRole: string; source: ExtractedSource },
): Promise<CreatedCv> {
  const { userId, targetRole, source } = args;
  return prisma.$transaction(async (tx) => {
    const cv = await tx.cv.create({
      data: { userId, targetRole, sourceKind: source.kind, sourceText: source.text, state: 'generating' },
      select: { id: true },
    });
    const job = await tx.generationJob.create({
      data: { cvId: cv.id, userId, status: 'queued', scope: 'full' },
      select: { id: true },
    });
    return { cvId: cv.id, jobId: job.id };
  });
}
