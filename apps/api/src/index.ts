// Load environment variables first
import 'dotenv/config';

// IMPORTANT: Initialize OpenTelemetry instrumentation BEFORE any other imports
// This ensures all modules are properly instrumented (HTTP, PostgreSQL, Redis, etc.)
import { initializeTracing, shutdownTracing } from './lib/instrumentation';
const tracingSDK = initializeTracing();

import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';

import { closeDatabaseConnection } from './db';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { cleanupAllConnections } from './lib/match-events';
import { closeQueues } from './lib/queue';
import { closeRedis } from './lib/redis';
import { startAutomationWorker } from './lib/automation-worker';
// Ensure collusion detection hook is loaded for match events
import './lib/collusion-detection-hook';
import {
  registerCookie,
  registerCors,
  registerErrorHandler,
  registerJwt,
  registerMetrics,
  registerRequestId,
  registerRateLimit,
  registerRbac,
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
  await registerMetrics(app); // Prometheus metrics collection
  await registerCookie(app); // Cookie support for session management
  await registerCors(app);
  await registerRateLimit(app);
  await registerJwt(app);
  await registerRbac(app);
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
        await closeQueues();
        await closeRedis();
        await closeDatabaseConnection();
        // Shutdown OpenTelemetry tracing (flushes pending spans)
        await shutdownTracing();
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
    logger.info(`🚀 RepoRivals API running on http://${HOST}:${PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);

    // Start background workers
    startAutomationWorker();
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();
