import { buildServer } from './server.js';
import { env } from './env.js';

// Process entry: listens on all interfaces so the container port is reachable.
// Runs only after `prisma migrate deploy` (see docker-compose.yml, api command).
const port = 3000;
const app = buildServer();

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info({ port, anthropicKey: env.ANTHROPIC_API_KEY ? 'set' : 'unset' }, 'api listening'))
  .catch((err: unknown) => {
    app.log.error({ errorName: (err as Error).name }, 'api failed to start');
    process.exit(1);
  });
