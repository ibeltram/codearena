/**
 * Fastify plugin for automatic HTTP metrics collection
 *
 * Instruments all HTTP requests with:
 * - Request count (by method, route, status)
 * - Request duration histogram
 */

import { FastifyInstance } from 'fastify';

import { recordHttpRequest } from '../lib/metrics';

export async function registerMetrics(app: FastifyInstance) {
  // Add hooks to track request timing
  app.addHook('onRequest', async (request) => {
    // Store start time
    (request as any).metricsStartTime = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).metricsStartTime as bigint | undefined;

    if (startTime) {
      const endTime = process.hrtime.bigint();
      const durationNs = Number(endTime - startTime);
      const durationSeconds = durationNs / 1_000_000_000;

      // Get route pattern (use routeOptions.url for parameterized routes)
      const route =
        (request.routeOptions as any)?.url ||
        request.routeOptions?.config?.url ||
        request.url;

      recordHttpRequest(
        request.method,
        route,
        reply.statusCode,
        durationSeconds
      );
    }
  });
}
