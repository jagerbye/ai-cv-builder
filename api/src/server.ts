import Fastify, { type FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { installErrorEnvelope } from './http/errors.js';
import { registerRateLimit } from './http/rateLimit.js';
import { registerHealthRoute } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { cvsCreateRoutes } from './routes/cvs-create.js';
import { jobsRoutes } from './routes/jobs.js';
import { cvsRoutes } from './routes/cvs.js';
import { exportRoutes } from './routes/export.js';

// Builds the Fastify app without listening. Entry point: src/main.ts.
// Each routes/*.ts plugin is owned by exactly one lane (ADR-011); this file is
// not edited by lanes, so the registry stays conflict-free.
// `now` is the injected clock for the rate-limit windows (tests advance it; nothing sleeps).
export interface BuildServerOptions {
  now?: () => number;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const app = Fastify({ logger: { level: 'info' } });
  const now = options.now ?? (() => Date.now());

  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  app.register(
    async (api) => {
      // C-000 envelope and F-010 rate limits, on the whole /api context. Installed before any child
      // plugin so that every route registered below inherits them.
      installErrorEnvelope(api);
      registerRateLimit(api, { now });

      registerHealthRoute(api);
      await api.register(authRoutes);
      await api.register(cvsCreateRoutes);
      await api.register(jobsRoutes);
      await api.register(cvsRoutes);
      await api.register(exportRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
