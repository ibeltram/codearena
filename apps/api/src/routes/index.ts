import { FastifyInstance } from 'fastify';

import { healthRoutes } from './health';
import { challengeRoutes } from './challenges';
import { matchRoutes } from './matches';
import { matchEventRoutes } from './match-events';
import { adminRoutes } from './admin';
import { initializeMatchEvents } from '../lib/match-events';

export async function registerRoutes(app: FastifyInstance) {
  // Initialize match events system (pub/sub for real-time events)
  initializeMatchEvents();

  // Health check routes
  await app.register(healthRoutes);

  // Public API routes
  await app.register(challengeRoutes);

  // Match API routes
  await app.register(matchRoutes);

  // Match event routes (WebSocket/SSE)
  await app.register(matchEventRoutes);

  // Admin API routes (TODO: add auth middleware)
  await app.register(adminRoutes);

  // TODO: Add more routes as they are implemented
  // await app.register(authRoutes, { prefix: '/api/auth' });
  // await app.register(creditsRoutes, { prefix: '/api/credits' });
  // etc.
}
