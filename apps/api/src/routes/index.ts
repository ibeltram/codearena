import { FastifyInstance } from 'fastify';

import { healthRoutes } from './health';
import { authRoutes } from './auth';
import { challengeRoutes } from './challenges';
import { matchRoutes } from './matches';
import { matchEventRoutes } from './match-events';
import { creditRoutes } from './credits';
import { submissionRoutes } from './submissions';
import { adminRoutes } from './admin';
import { initializeMatchEvents } from '../lib/match-events';

export async function registerRoutes(app: FastifyInstance) {
  // Initialize match events system (pub/sub for real-time events)
  initializeMatchEvents();

  // Health check routes
  await app.register(healthRoutes);

  // Auth routes (device code flow, token refresh, etc.)
  await app.register(authRoutes);

  // Public API routes
  await app.register(challengeRoutes);

  // Match API routes
  await app.register(matchRoutes);

  // Match event routes (WebSocket/SSE)
  await app.register(matchEventRoutes);

  // Credit API routes
  await app.register(creditRoutes);

  // Submission upload routes
  await app.register(submissionRoutes);

  // Admin API routes (TODO: add auth middleware)
  await app.register(adminRoutes);
}
