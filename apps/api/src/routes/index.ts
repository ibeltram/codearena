import { FastifyInstance } from 'fastify';

import { healthRoutes } from './health';
import { challengeRoutes } from './challenges';
import { matchRoutes } from './matches';
import { adminRoutes } from './admin';

export async function registerRoutes(app: FastifyInstance) {
  // Health check routes
  await app.register(healthRoutes);

  // Public API routes
  await app.register(challengeRoutes);

  // Match API routes
  await app.register(matchRoutes);

  // Admin API routes (TODO: add auth middleware)
  await app.register(adminRoutes);

  // TODO: Add more routes as they are implemented
  // await app.register(authRoutes, { prefix: '/api/auth' });
  // await app.register(creditsRoutes, { prefix: '/api/credits' });
  // etc.
}
