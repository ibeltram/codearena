/**
 * Prometheus metrics endpoint
 *
 * Exposes /api/metrics in Prometheus format for scraping by monitoring systems.
 */

import { FastifyInstance } from 'fastify';

import { getMetrics, getMetricsContentType } from '../lib/metrics';

export async function metricsRoutes(app: FastifyInstance) {
  /**
   * GET /api/metrics
   *
   * Returns all metrics in Prometheus exposition format.
   * This endpoint should be scraped by Prometheus at regular intervals.
   *
   * Note: In production, this endpoint should be protected or exposed
   * on a separate internal port to prevent public access.
   */
  app.get('/api/metrics', async (request, reply) => {
    const metrics = await getMetrics();

    reply
      .header('Content-Type', getMetricsContentType())
      .send(metrics);
  });

  /**
   * GET /api/metrics/health
   *
   * Quick check to verify the metrics system is functioning.
   */
  app.get('/api/metrics/health', async () => {
    return {
      status: 'ok',
      metricsEnabled: true,
    };
  });
}
