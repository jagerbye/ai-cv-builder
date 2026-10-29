import type { FastifyInstance, FastifyRequest } from 'fastify';
import { envelope } from './errors.js';
import { resolveSessionUser } from './requireUser.js';

// F-010 per-user limits, installed once as hooks on the /api context (server.ts).
//   generation: a request that enqueues a job (POST /api/cvs, POST /api/cvs/:cvId/regenerate).
//               10 per hour. Reserved before the handler runs, released when the answer is not 2xx,
//               so a rejected create never uses a slot.
//   write:      any POST, PATCH or DELETE under /api. 60 per minute, counted whatever the outcome.
// Unauthenticated requests have no user key and are not counted. GET is never a write.
//
// Counters are in-process. That is correct for the single-container deployment; a second
// instance would need a shared store. Windows are fixed and aligned to the clock: an hour starts
// at :00 and a minute at :00 seconds. State for a window is dropped when the window ends.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const WRITE_LIMIT = 60;
const GENERATION_LIMIT = 10;
const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE']);
const CREATE_PATH = /^\/api\/cvs$/;
const REGENERATE_PATH = /^\/api\/cvs\/[^/]+\/regenerate$/;
const PRUNE_AT = 5_000;

export type Take = { ok: true; start: number } | { ok: false; retryAfterSeconds: number };

export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  take(key: string): Take {
    const t = this.now();
    const start = Math.floor(t / this.windowMs) * this.windowMs;
    let w = this.windows.get(key);
    if (!w || w.start !== start) {
      if (this.windows.size >= PRUNE_AT) this.prune(start);
      w = { start, count: 0 };
      this.windows.set(key, w);
    }
    if (w.count >= this.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((start + this.windowMs - t) / 1000));
      return { ok: false, retryAfterSeconds };
    }
    w.count += 1;
    return { ok: true, start };
  }

  // Gives back one slot taken in the window that starts at `start`. A slot from an older window is
  // not returned to a newer one.
  release(key: string, start: number): void {
    const w = this.windows.get(key);
    if (w && w.start === start && w.count > 0) w.count -= 1;
  }

  // Test-visible: forgets every counter.
  reset(): void {
    this.windows.clear();
  }

  private prune(currentStart: number): void {
    for (const [key, w] of this.windows) {
      if (w.start !== currentStart) this.windows.delete(key);
    }
  }
}

function isGenerationRequest(request: FastifyRequest): boolean {
  if (request.method !== 'POST') return false;
  const path = request.url.split('?')[0] ?? '';
  return CREATE_PATH.test(path) || REGENERATE_PATH.test(path);
}

interface Reservation {
  key: string;
  start: number;
}

export function registerRateLimit(api: FastifyInstance, options: { now: () => number }): () => void {
  const writes = new FixedWindowLimiter(WRITE_LIMIT, MINUTE_MS, options.now);
  const generations = new FixedWindowLimiter(GENERATION_LIMIT, HOUR_MS, options.now);
  const reservations = new WeakMap<FastifyRequest, Reservation>();

  api.addHook('onRequest', async (request, reply) => {
    if (!WRITE_METHODS.has(request.method)) return;
    const user = await resolveSessionUser(request.server.prisma, request.headers.cookie);
    if (!user) return; // unauthenticated: no key, not counted; requireUser answers 401 later
    request.user = user;

    const write = writes.take(`write:${user.id}`);
    if (!write.ok) {
      return reply
        .code(429)
        .header('Retry-After', String(write.retryAfterSeconds))
        .send(envelope('RATE_LIMITED'));
    }

    if (!isGenerationRequest(request)) return;
    const key = `generation:${user.id}`;
    const generation = generations.take(key);
    if (!generation.ok) {
      return reply
        .code(429)
        .header('Retry-After', String(generation.retryAfterSeconds))
        .send(envelope('RATE_LIMITED'));
    }
    reservations.set(request, { key, start: generation.start });
  });

  api.addHook('onSend', async (request, reply, payload) => {
    const reservation = reservations.get(request);
    if (reservation && reply.statusCode >= 300) {
      generations.release(reservation.key, reservation.start);
      reservations.delete(request);
    }
    return payload;
  });

  // Clears all counters. Exposed on the app as `resetRateLimits` for tests; production never calls it.
  return () => {
    writes.reset();
    generations.reset();
  };
}
