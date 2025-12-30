import 'dotenv/config';

import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';

import { closeDatabaseConnection } from './db';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { cleanupAllConnections } from './lib/match-events';
import {
  registerCors,
  registerErrorHandler,
  registerRequestId,
  registerRateLimit,
} from './plugins';
import { registerRoutes } from './routes';

const PORT = parseInt(env.PORT, 10);
const HOST = env.HOST;

async function buildApp() {
  const app = Fastify({
    logger,
    genReqId: () => '', // We handle this in requestId plugin
    disableRequestLogging: false,
  });

  // Register plugins
  await app.register(helmet, { global: true });
  await app.register(sensible);
  await registerRequestId(app);
  await registerCors(app);
  await registerRateLimit(app);
  await registerErrorHandler(app);

  // Register routes
  await registerRoutes(app);

  return app;
}

async function start() {
  const app = await buildApp();

  // Graceful shutdown handling
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Cleanup WebSocket/SSE connections
        cleanupAllConnections();
        await app.close();
        await closeDatabaseConnection();
        logger.info('Server closed successfully');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });

  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info(`🚀 CodeArena API running on http://${HOST}:${PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();
