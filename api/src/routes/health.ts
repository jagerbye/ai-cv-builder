import type { FastifyInstance } from 'fastify';

// C-013. 200 {ok:true,db:true} when a trivial query succeeds; 503 {ok:false,db:false}
// otherwise. The body never carries a driver message, connection string or
// credentials. The reason goes to the log only, and only its class and code,
// not its message, because driver messages can echo the connection target.
export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', async (request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return reply.code(200).send({ ok: true, db: true });
    } catch (err) {
      const e = err as { name?: string; code?: string };
      request.log.warn({ reason: 'db_unreachable', errorName: e.name, errorCode: e.code }, 'health check failed');
      return reply.code(503).send({ ok: false, db: false });
    }
  });
}
