import { FastifyInstance } from 'fastify';

import { adminChallengeRoutes } from './challenges';

export async function adminRoutes(app: FastifyInstance) {
  // Admin challenge management routes
  await app.register(adminChallengeRoutes);

  // TODO: Add other admin routes
  // await app.register(adminModerationRoutes);
  // await app.register(adminDisputeRoutes);
  // await app.register(adminTournamentRoutes);
}
