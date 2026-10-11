import { createApp } from './app.js';
import { loadEnvOrExit } from './config/loadEnv.js';
import { createRoutes, createServices } from './container.js';
import { openDatabase } from './db/index.js';
import { countPermits } from './db/permitsRepo.js';
import { createLogger } from './lib/logger.js';

const env = loadEnvOrExit();
const logger = createLogger(env.LOG_LEVEL);
const db = openDatabase(env.DATABASE_PATH);

if (countPermits(db) === 0) {
  logger.warn('No permits in the database yet. Run `npm run import` to load data/sample-permits.json.');
}

const services = createServices(db, logger);
const app = createApp({ env, db, logger, routes: createRoutes(db, services) });
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'PermitWatch API listening');
});
server.requestTimeout = 60_000;
server.headersTimeout = 20_000;

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'unhandled promise rejection'));
