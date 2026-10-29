import type { Prisma, PrismaClient } from '@prisma/client';
import type { GenerationPipeline, Fact, VerificationResult } from '../generation/types.js';
import { persistDraft } from '../cv/persist.js';
import { ERROR_CODES, safeMessage, type ErrorCode } from '../../http/errors.js';

// T-16 (CVB-8). ADR-004: Postgres is the queue. A lease is a row write (leased_until), claimed
// with FOR UPDATE SKIP LOCKED. Every write a run makes is fenced on (id, attempt, status='running'),
// so a worker that lost its lease can never overwrite the row a successor now owns.

// C-005: the server guarantees a terminal status within 180 s of startedAt.
export const JOB_BUDGET_MS = 180_000;

// A job may be attempted twice (the first run, and one reclaim after a lease expired).
const MAX_ATTEMPTS = 2;

const JOB_TIMEOUT_MESSAGE = 'The generation did not finish within 180 seconds.';
const GENERATION_FAILED_MESSAGE = 'The generation failed.';
const LEASE_EXPIRED_MESSAGE = 'The generation was interrupted and no attempts remain.';

export interface JobLease {
  id: string;
  cvId: string;
  userId: string;
  attempt: number;
  startedAt: Date;
}

export interface JobWorker {
  // Leases one job (queued, or running with an expired lease). Returns null when none is claimable.
  claimNext(): Promise<JobLease | null>;
  // Claims one job and runs it to a terminal state. Returns the job id, or null when none ran.
  runOnce(): Promise<string | null>;
  // Simulates process death: no further renewals, no further writes from runs in flight.
  stop(): void;
}

export interface JobWorkerOptions {
  prisma: PrismaClient;
  pipeline: GenerationPipeline;
  workerId: string;
  leaseMs: number;
  budgetMs?: number;
  // Receives every error the worker turns into a row or swallows. Never given a message or content (C-000).
  onError?: (info: JobErrorInfo) => void;
}

export interface JobErrorInfo {
  event: 'internal' | 'lease_lost' | 'budget_exceeded' | 'classified';
  jobId: string;
  attempt: number;
  errorName: string | undefined;
  errorCode: string | undefined;
}

// Thrown when this run no longer holds its row: a fenced write matched nothing, the lease
// could not be renewed, or the worker was stopped. The run then writes nothing further.
class JobLeaseLost extends Error {}

// Thrown when the run exceeds its 180 s budget; the failure is written as JOB_TIMEOUT.
class JobBudgetExceeded extends Error {}

interface RunContext {
  abandoned: boolean;
  interrupt: (reason: unknown) => void;
}

interface ClaimRow {
  id: string;
  cv_id: string;
  user_id: string;
  attempt: number;
  started_at: Date | null;
}

// A thrown error carries its C-000 code only when that code is in the closed enum; its message is
// kept only then, because a known code is written by code that owns a safe message. Anything else is INTERNAL.
function classify(err: unknown): { code: ErrorCode; message: string } {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code)) {
    return { code: code as ErrorCode, message: (err as Error).message };
  }
  return { code: 'INTERNAL', message: GENERATION_FAILED_MESSAGE };
}

// QA-10: the CV's state goes to failed; nothing else on the CV or its items changes (no version bump).
// ADR-017: the CV's own columns carry the code and its fixed safe message, never the thrown error's text.
async function markCvFailed(tx: Prisma.TransactionClient, cvId: string, code: ErrorCode): Promise<void> {
  await tx.cv.update({
    where: { id: cvId },
    data: { state: 'failed', lastErrorCode: code, lastErrorMessage: safeMessage(code) },
  });
}

export function createJobWorker(opts: JobWorkerOptions): JobWorker {
  const { prisma, pipeline, leaseMs } = opts;
  const budgetMs = opts.budgetMs ?? JOB_BUDGET_MS;
  const onError = opts.onError ?? (() => undefined);
  const renewEvery = Math.max(1, Math.floor(leaseMs / 3));
  let stopped = false;
  const activeRuns = new Set<RunContext>();

  // The fence: a write lands only if this exact attempt still owns a running row.
  async function fenced(lease: JobLease, data: Record<string, unknown>): Promise<boolean> {
    const res = await prisma.generationJob.updateMany({
      where: { id: lease.id, attempt: lease.attempt, status: 'running' },
      data,
    });
    return res.count === 1;
  }

  async function claimNext(): Promise<JobLease | null> {
    for (;;) {
      // A stopped worker is a dead process: it claims nothing.
      if (stopped) return null;
      const claimed = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<ClaimRow[]>`
          SELECT id, cv_id, user_id, attempt, started_at
          FROM generation_jobs
          WHERE status = 'queued' OR (status = 'running' AND leased_until < now())
          ORDER BY created_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED`;
        const row = rows[0];
        if (!row) return null;

        const now = new Date();
        const attempt = row.attempt + 1;
        if (attempt > MAX_ATTEMPTS) {
          await tx.generationJob.update({
            where: { id: row.id },
            data: {
              status: 'failed',
              stage: null,
              attempt,
              leasedUntil: null,
              finishedAt: now,
              errorCode: 'INTERNAL',
              errorMessage: LEASE_EXPIRED_MESSAGE,
            },
          });
          // QA-10: the CV is told in the same transaction. Its content and version are untouched.
          await markCvFailed(tx, row.cv_id, 'INTERNAL');
          return 'exhausted' as const;
        }

        const startedAt = row.started_at ?? now;
        await tx.generationJob.update({
          where: { id: row.id },
          data: {
            status: 'running',
            stage: null,
            attempt,
            leasedUntil: new Date(now.getTime() + leaseMs),
            startedAt,
          },
        });
        return { id: row.id, cvId: row.cv_id, userId: row.user_id, attempt, startedAt } satisfies JobLease;
      });

      if (claimed === null) return null;
      if (claimed === 'exhausted') continue;
      return claimed;
    }
  }

  async function renew(lease: JobLease, ctx: RunContext): Promise<void> {
    if (ctx.abandoned) return;
    try {
      const held = await fenced(lease, { leasedUntil: new Date(Date.now() + leaseMs) });
      if (!held) ctx.interrupt(new JobLeaseLost('lease no longer held'));
    } catch (err) {
      // Without a renewed lease this run cannot prove it still owns the row, so it stops writing.
      ctx.interrupt(new JobLeaseLost('lease renewal failed', { cause: err }));
    }
  }

  // Each step is written to the row before the pipeline call, so a reload or a new worker sees it.
  async function setStage(lease: JobLease, ctx: RunContext, stage: 'extracting' | 'composing' | 'verifying'): Promise<void> {
    if (ctx.abandoned || stopped) throw new JobLeaseLost('run abandoned');
    if (!(await fenced(lease, { stage }))) throw new JobLeaseLost('stage write fenced out');
  }

  async function stages(lease: JobLease, ctx: RunContext): Promise<void> {
    const cv = await prisma.cv.findUniqueOrThrow({
      where: { id: lease.cvId },
      select: { sourceText: true, targetRole: true },
    });

    await setStage(lease, ctx, 'extracting');
    const facts: Fact[] = await pipeline.extract(cv.sourceText);

    await setStage(lease, ctx, 'composing');
    const draft = await pipeline.compose(facts, cv.targetRole);

    await setStage(lease, ctx, 'verifying');
    await commitSuccess(lease, ctx, pipeline.verify(draft, facts), facts);
  }

  // ADR-004 / T-28: the verified draft and the job's success are one transaction. The fenced job update
  // comes first; if this run no longer owns the row it matches nothing, throws, and rolls back the persist.
  async function commitSuccess(lease: JobLease, ctx: RunContext, verified: VerificationResult, facts: Fact[]): Promise<void> {
    if (ctx.abandoned || stopped) throw new JobLeaseLost('run abandoned');
    await prisma.$transaction(async (tx) => {
      // Checked again inside the transaction: a stop that lands while the transaction is opening writes nothing.
      if (ctx.abandoned || stopped) throw new JobLeaseLost('run abandoned');
      const res = await tx.generationJob.updateMany({
        where: { id: lease.id, attempt: lease.attempt, status: 'running' },
        data: { status: 'succeeded', stage: null, leasedUntil: null, finishedAt: new Date() },
      });
      if (res.count !== 1) throw new JobLeaseLost('success write fenced out');
      await persistDraft(tx, lease.cvId, verified.accepted, verified.questions, facts);
    });
  }

  // QA-10: a terminal failure is written to the job and to the CV in one transaction, and the CV write
  // happens only if the fenced job write matched. The CV moves to failed; its content and version stay
  // as they were, so a failed regeneration keeps the draft the user was looking at.
  async function writeFailure(lease: JobLease, code: ErrorCode, message: string): Promise<void> {
    // A stopped worker is a dead process: it records nothing.
    if (stopped) return;
    await prisma.$transaction(async (tx) => {
      const res = await tx.generationJob.updateMany({
        where: { id: lease.id, attempt: lease.attempt, status: 'running' },
        data: {
          status: 'failed',
          stage: null,
          leasedUntil: null,
          finishedAt: new Date(),
          errorCode: code,
          errorMessage: message,
        },
      });
      if (res.count !== 1) return;
      await markCvFailed(tx, lease.cvId, code);
    });
  }

  function report(event: JobErrorInfo['event'], lease: JobLease, err: unknown): void {
    const e = err as { name?: string; code?: string } | null;
    onError({ event, jobId: lease.id, attempt: lease.attempt, errorName: e?.name, errorCode: e?.code });
  }

  async function execute(lease: JobLease): Promise<void> {
    const ctx: RunContext = { abandoned: false, interrupt: () => undefined };
    const interrupted = new Promise<never>((_, reject) => {
      ctx.interrupt = (reason) => {
        ctx.abandoned = true;
        reject(reason);
      };
    });
    activeRuns.add(ctx);

    const remainingMs = Math.max(0, lease.startedAt.getTime() + budgetMs - Date.now());
    const budgetTimer = setTimeout(() => ctx.interrupt(new JobBudgetExceeded('budget exceeded')), remainingMs);
    const renewTimer = setInterval(() => void renew(lease, ctx), renewEvery);

    try {
      await Promise.race([stages(lease, ctx), interrupted]);
    } catch (err) {
      if (err instanceof JobLeaseLost) {
        report('lease_lost', lease, err);
        return;
      }
      if (err instanceof JobBudgetExceeded) {
        report('budget_exceeded', lease, err);
        await writeFailure(lease, 'JOB_TIMEOUT', JOB_TIMEOUT_MESSAGE);
        return;
      }
      const { code, message } = classify(err);
      report(code === 'INTERNAL' ? 'internal' : 'classified', lease, err);
      await writeFailure(lease, code, message);
    } finally {
      clearTimeout(budgetTimer);
      clearInterval(renewTimer);
      activeRuns.delete(ctx);
    }
  }

  return {
    claimNext,

    async runOnce(): Promise<string | null> {
      const lease = await claimNext();
      if (!lease) return null;
      await execute(lease);
      return lease.id;
    },

    stop(): void {
      stopped = true;
      for (const ctx of activeRuns) ctx.interrupt(new JobLeaseLost('worker stopped'));
    },
  };
}
