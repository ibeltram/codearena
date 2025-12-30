import { FastifyInstance } from 'fastify';

import { healthRoutes } from './health';

export async function registerRoutes(app: FastifyInstance) {
  // Health check routes
  await app.register(healthRoutes);

  // API routes will be registered here
  // await app.register(authRoutes, { prefix: '/api/auth' });
  // await app.register(challengeRoutes, { prefix: '/api/challenges' });
  // await app.register(matchRoutes, { prefix: '/api/matches' });
  // etc.
}
