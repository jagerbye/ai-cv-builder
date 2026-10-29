import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS, type JobTestSuite } from '../../api/src/core/jobs/test-lock.js';
import { createJobWorker } from '../../api/src/core/jobs/worker.js';
import { createGenerationPipeline } from '../../api/src/core/generation/pipeline.js';
import { prisma, userIds, seedUser, seedCv, itemsOf, type Owner } from './generation-persist.fixtures.js';

// T-28 (CVB-31). One factory builds the real pipeline for both the HTTP path (server.ts) and the
// worker (main.ts): createGenerationPipeline(env). F-010: no ANTHROPIC_API_KEY means the app still
// boots, and a generation fails with CONFIG_MISSING on its job row, not with a crashed process.
// The LLM is never reached: the gateway refuses before any network call when the key is absent.

const suite: JobTestSuite = openJobTestSuite(prisma);

beforeAll(async () => {
  await suite.lock();
}, JOB_SUITE_LOCK_WAIT_MS);

afterEach(async () => {
  const ids = userIds.splice(0);
  if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await prisma.$disconnect();
  await suite.release();
});

describe('T-28 pipeline factory: boots without a key (F-010)', () => {
  it('builds the three C-012 stages with no ANTHROPIC_API_KEY, without throwing', () => {
    const pipeline = createGenerationPipeline({});

    expect(typeof pipeline.extract).toBe('function');
    expect(typeof pipeline.compose).toBe('function');
    expect(typeof pipeline.verify).toBe('function');
  });

  it('treats an empty key the same as an absent one', () => {
    expect(() => createGenerationPipeline({ ANTHROPIC_API_KEY: '' })).not.toThrow();
  });

  it('verify stays pure and needs no key: it returns the draft it was given', () => {
    const pipeline = createGenerationPipeline({});
    // The verifier drops a skill with no cited fact (citation rule), so the skill cites a real fact.
    const factId = '6f1c2a9e-3b7d-4c5e-8f90-1a2b3c4d5e6f';
    const draft = {
      targetRole: 'Backend Engineer',
      experience: [],
      education: [],
      skills: [{ name: 'TypeScript', factIds: [factId] }],
    };
    const facts = [{ id: factId, kind: 'skill', text: 'TypeScript', sourceQuote: 'TypeScript', source: 'document' as const }];

    const result = pipeline.verify(draft, facts);

    expect(result.accepted.skills).toEqual([{ name: 'TypeScript', factIds: [factId] }]);
    expect(result.questions).toEqual([]);
  });
});

describe('T-28 pipeline factory: a run without a key fails with CONFIG_MISSING and stores nothing', () => {
  it('the job row ends failed with errorCode CONFIG_MISSING, and no draft or version change is stored', async () => {
    const owner: Owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const jobId = await suite.enqueue({ cvId, userId: owner.userId, status: 'queued' });
    const worker = createJobWorker({
      prisma,
      pipeline: createGenerationPipeline({}),
      workerId: 'boot-no-key',
      leaseMs: 300_000,
    });

    let ran: string | null = null;
    do {
      ran = await worker.runOnce();
    } while (ran !== null && ran !== jobId);
    expect(ran).toBe(jobId);

    const row = await prisma.generationJob.findUnique({ where: { id: jobId } });
    expect(row).toMatchObject({ status: 'failed', errorCode: 'CONFIG_MISSING', attempt: 1 });
    expect(row?.errorMessage ?? '').not.toMatch(/sk-/);
    expect((await itemsOf(cvId)).map((i) => i.kind)).toEqual(['contact']);
    expect((await prisma.cv.findUnique({ where: { id: cvId }, select: { version: true } }))?.version).toBe(1);
  });
});
