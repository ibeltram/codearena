import { FastifyInstance } from 'fastify';

import { healthRoutes } from './health';
import { authRoutes } from './auth';
import { authGitHubRoutes } from './auth-github';
import { challengeRoutes } from './challenges';
import { matchRoutes } from './matches';
import { matchEventRoutes } from './match-events';
import { creditRoutes } from './credits';
import { paymentRoutes } from './payments';
import { submissionRoutes } from './submissions';
import { storageRoutes } from './storage';
import { adminRoutes } from './admin';
import { tournamentRoutes } from './tournaments';
import { disputeRoutes } from './disputes';
import ratingsRoutes from './ratings';
import { initializeMatchEvents } from '../lib/match-events';

export async function registerRoutes(app: FastifyInstance) {
  // Initialize match events system (pub/sub for real-time events)
  initializeMatchEvents();

  // Health check routes
  await app.register(healthRoutes);

  // Auth routes (device code flow, token refresh, etc.)
  await app.register(authRoutes);

  // GitHub OAuth routes
  await app.register(authGitHubRoutes);

  // Public API routes
  await app.register(challengeRoutes);

  // Match API routes
  await app.register(matchRoutes);

  // Match event routes (WebSocket/SSE)
  await app.register(matchEventRoutes);

  // Credit API routes
  await app.register(creditRoutes);

  // Payment API routes (Stripe checkout)
  await app.register(paymentRoutes);

  // Submission upload routes
  await app.register(submissionRoutes);

  // Storage API routes (file uploads, downloads, presigned URLs)
  await app.register(storageRoutes);

  // Tournament API routes
  await app.register(tournamentRoutes);

  // Dispute API routes
  await app.register(disputeRoutes);

  // Ratings and leaderboard routes
  await app.register(ratingsRoutes, { prefix: '/api/ratings' });

  // Admin API routes (TODO: add auth middleware)
  await app.register(adminRoutes);
}
