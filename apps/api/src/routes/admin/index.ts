import { FastifyInstance } from 'fastify';

import { adminChallengeRoutes } from './challenges';
import { adminDisputeRoutes } from './disputes';

export async function adminRoutes(app: FastifyInstance) {
  // Admin challenge management routes
  await app.register(adminChallengeRoutes);

  // Admin dispute management routes
  await app.register(adminDisputeRoutes);

  // TODO: Add other admin routes
  // await app.register(adminModerationRoutes);
  // await app.register(adminTournamentRoutes);
}
