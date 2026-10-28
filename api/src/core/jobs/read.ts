import type { PrismaClient } from '@prisma/client';
import type { ErrorCode } from '../../http/errors.js';

// C-005 read model. Only the fields C-005 names are exposed: no userId, leasedUntil or token counts.
export interface JobResponse {
  id: string;
  cvId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  stage: 'extracting' | 'composing' | 'verifying' | null;
  attempt: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  error?: { code: ErrorCode; message: string };
}

// Ownership is enforced in the query: another user's job id finds no row, so it reads as not found.
export async function getJob(prisma: PrismaClient, userId: string, jobId: string): Promise<JobResponse | null> {
  const job = await prisma.generationJob.findFirst({ where: { id: jobId, userId } });
  if (!job) return null;

  const response: JobResponse = {
    id: job.id,
    cvId: job.cvId,
    status: job.status as JobResponse['status'],
    stage: job.stage as JobResponse['stage'],
    attempt: job.attempt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
  if (job.errorCode !== null) {
    response.error = { code: job.errorCode as ErrorCode, message: job.errorMessage ?? '' };
  }
  return response;
}
