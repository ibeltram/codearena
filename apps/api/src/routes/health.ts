import { FastifyInstance } from 'fastify';

import { checkDatabaseConnection } from '../db';
import { checkRedisConnection } from '../lib/redis';
import { checkStorageConnection } from '../lib/storage';
import { checkSandboxHealth, SANDBOX_DEFAULTS } from '../lib/sandbox';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks?: {
    database: boolean;
    redis: boolean;
    s3: boolean;
  };
}

export async function healthRoutes(app: FastifyInstance) {
  // Simple health check - always returns 200 if server is up
  app.get('/api/health', async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      uptime: process.uptime(),
    };
  });

  // Detailed readiness check - verifies all dependencies
  app.get('/api/health/ready', async (request, reply): Promise<HealthResponse> => {
    const [database, redis, s3] = await Promise.all([
      checkDatabaseConnection(),
      checkRedisConnection(),
      checkStorageConnection(),
    ]);

    const checks = { database, redis, s3 };
    const isHealthy = Object.values(checks).every(Boolean);
    const status = isHealthy ? 'ok' : 'degraded';

    if (!isHealthy) {
      reply.status(503);
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      uptime: process.uptime(),
      checks,
    };
  });

  // Liveness probe - just confirms the process is running
  app.get('/api/health/live', async () => {
    return { status: 'alive' };
  });

  // Sandbox health check - verifies Docker sandbox capability
  app.get('/api/health/sandbox', async (request, reply) => {
    const sandboxHealth = await checkSandboxHealth();

    const isHealthy =
      sandboxHealth.dockerAvailable &&
      sandboxHealth.defaultImageAvailable &&
      sandboxHealth.canCreateContainer;

    if (!isHealthy) {
      reply.status(503);
    }

    return {
      status: isHealthy ? 'ok' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: sandboxHealth,
      config: {
        cpuLimit: SANDBOX_DEFAULTS.cpuLimit,
        memoryLimit: SANDBOX_DEFAULTS.memoryLimit,
        timeoutSeconds: SANDBOX_DEFAULTS.timeoutSeconds,
        networkEnabled: SANDBOX_DEFAULTS.networkEnabled,
      },
    };
  });
}
