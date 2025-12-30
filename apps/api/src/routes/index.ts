import { FastifyInstance } from 'fastify';

import { healthRoutes } from './health';
import { challengeRoutes } from './challenges';
import { adminRoutes } from './admin';

export async function registerRoutes(app: FastifyInstance) {
  // Health check routes
  await app.register(healthRoutes);

  // Public API routes
  await app.register(challengeRoutes);

  // Admin API routes (TODO: add auth middleware)
  await app.register(adminRoutes);

  // API routes will be registered here
  // await app.register(authRoutes, { prefix: '/api/auth' });
  // await app.register(matchRoutes, { prefix: '/api/matches' });
  // etc.
}
