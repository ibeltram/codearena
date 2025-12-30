import { FastifyInstance } from 'fastify';

import { checkDatabaseConnection } from '../db';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks?: {
    database: boolean;
    redis?: boolean;
    s3?: boolean;
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
    const checks = {
      database: await checkDatabaseConnection(),
      // TODO: Add Redis and S3 checks
    };

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
}
