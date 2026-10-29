import { buildServer } from './server.js';
import { env } from './env.js';
import { readLlmConfig } from './llm/config.js';
import { createGenerationPipeline } from './core/generation/pipeline.js';
import { createJobWorker } from './core/jobs/worker.js';
import { startJobLoop } from './core/jobs/loop.js';

// Process entry: listens on all interfaces so the container port is reachable.
// Runs only after `prisma migrate deploy` (see docker-compose.yml, api command).
const port = 3000;

// T-28 (CVB-31). The job worker runs in this process as a poll loop. A run renews its lease every
// leaseMs / 3; an idle worker polls every JOB_POLL_MS. The pipeline is built once and shared with the
// HTTP path. With no ANTHROPIC_API_KEY the app still boots: the gateway fails the job with CONFIG_MISSING.
const JOB_LEASE_MS = 60_000;
const JOB_POLL_MS = 1_000;

const generationPipeline = createGenerationPipeline(env);
const app = buildServer({ generationPipeline });
const worker = createJobWorker({
  prisma: app.prisma,
  pipeline: generationPipeline,
  workerId: `api-${process.pid}`,
  leaseMs: JOB_LEASE_MS,
  tokenBudgetPerJob: readLlmConfig(env).tokenBudgetPerJob,
  onError: (info) => app.log.warn(info, 'job run ended in an error'),
});
// QA-14: before the first claim, fail every CV that says generating but has no live job of its own (what a
// crashed worker leaves behind). A failure here must not keep the app from booting.
await worker.reconcile().then(
  (n) => app.log.info({ reconciled: n }, 'orphaned generating CVs marked failed'),
  (err: unknown) => app.log.error({ errorName: (err as Error).name }, 'startup reconcile failed'),
);
const loop = startJobLoop({
  worker,
  intervalMs: JOB_POLL_MS,
  onError: (err) => app.log.error({ errorName: (err as Error).name }, 'job loop failed a poll'),
});

// Graceful stop: the loop ends after the run in flight reaches a terminal status, then the server closes.
let shutdown: Promise<void> | null = null;
function stopOn(signal: NodeJS.Signals): void {
  shutdown ??= (async () => {
    app.log.info({ signal }, 'stopping: waiting for the job in flight');
    await loop.stop();
    await app.close();
    process.exit(0);
  })();
}
process.on('SIGTERM', () => stopOn('SIGTERM'));
process.on('SIGINT', () => stopOn('SIGINT'));

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info({ port, anthropicKey: env.ANTHROPIC_API_KEY ? 'set' : 'unset' }, 'api listening'))
  .catch((err: unknown) => {
    app.log.error({ errorName: (err as Error).name }, 'api failed to start');
    process.exit(1);
  });
