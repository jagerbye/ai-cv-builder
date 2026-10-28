import type { FastifyInstance } from 'fastify';

// T-07 (CVB-24, ADR-011). Empty plugin, registered under /api in server.ts.
// Owned by the CV read/edit lane: that lane adds its handlers here and nowhere else.
// Until then it adds no route, so an unrouted path answers 404.
export async function cvsRoutes(app: FastifyInstance): Promise<void> {
  void app;
}
