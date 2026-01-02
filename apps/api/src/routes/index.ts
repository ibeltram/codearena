import { FastifyInstance } from 'fastify';

import { healthRoutes } from './health';
import { metricsRoutes } from './metrics';
import { authRoutes } from './auth';
import { authGitHubRoutes } from './auth-github';
import { authGoogleRoutes } from './auth-google';
import { accountRoutes } from './account';
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
import { reportRoutes } from './reports';
import ratingsRoutes from './ratings';
import { rewardRoutes } from './rewards';
import { adminAuditRoutes } from './admin-audit';
import { automationRoutes } from './automation';
import { initializeMatchEvents } from '../lib/match-events';

export async function registerRoutes(app: FastifyInstance) {
  // Initialize match events system (pub/sub for real-time events)
  initializeMatchEvents();

  // Health check routes
  await app.register(healthRoutes);

  // Prometheus metrics routes
  await app.register(metricsRoutes);

  // Auth routes (device code flow, token refresh, etc.)
  await app.register(authRoutes);

  // GitHub OAuth routes
  await app.register(authGitHubRoutes);

  // Google OAuth routes
  await app.register(authGoogleRoutes);

  // Account management routes (GDPR export, deletion)
  await app.register(accountRoutes);

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

  // User report routes
  await app.register(reportRoutes);

  // Ratings and leaderboard routes
  await app.register(ratingsRoutes, { prefix: '/api/ratings' });

  // Rewards marketplace routes
  await app.register(rewardRoutes);

  // Admin API routes (TODO: add auth middleware)
  await app.register(adminRoutes);

  // Admin audit log routes
  await app.register(adminAuditRoutes);

  // Automation services routes (Phase 10)
  await app.register(automationRoutes);
}
