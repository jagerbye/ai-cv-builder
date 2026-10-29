import type { JobWorker } from './worker.js';

// T-28 (CVB-31). The poll loop that runs the job worker inside the app process (main.ts). A run that
// finds work runs at once; an idle worker sleeps intervalMs. stop() ends the loop without interrupting
// the run in flight: it resolves only after that run has reached a terminal status, so no transaction is
// torn. worker.stop() is not called here; that simulates process death and is for tests.

export interface JobLoopOptions {
  worker: JobWorker;
  intervalMs: number;
  onError?: (err: unknown) => void;
}

export interface JobLoop {
  stop(): Promise<void>;
}

export function startJobLoop(opts: JobLoopOptions): JobLoop {
  const { worker, intervalMs } = opts;
  let stopping = false;
  let wake: (() => void) | null = null;

  // Sleeps one interval, or until stop() wakes it.
  const idle = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, intervalMs);
      function done() {
        clearTimeout(timer);
        wake = null;
        resolve();
      }
      wake = done;
    });

  const runner = (async () => {
    while (!stopping) {
      let ran: string | null = null;
      try {
        ran = await worker.runOnce();
      } catch (err) {
        opts.onError?.(err);
      }
      if (ran === null && !stopping) await idle();
    }
  })();

  return {
    async stop() {
      stopping = true;
      wake?.();
      await runner;
    },
  };
}
