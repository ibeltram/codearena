import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';

import { env } from '../lib/env';

export async function registerRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'production' ? 100 : 1000, // requests per window
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    }),
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise use IP
      return (request as unknown as { userId?: string }).userId || request.ip;
    },
  });
}
