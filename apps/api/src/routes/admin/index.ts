import { FastifyInstance } from 'fastify';

import { adminChallengeRoutes } from './challenges';
import { adminDisputeRoutes } from './disputes';
import { adminUserRoutes } from './users';

export async function adminRoutes(app: FastifyInstance) {
  // Admin challenge management routes
  await app.register(adminChallengeRoutes);

  // Admin dispute management routes
  await app.register(adminDisputeRoutes);

  // Admin user management routes (role assignment, banning)
  await app.register(adminUserRoutes);

  // TODO: Add other admin routes
  // await app.register(adminTournamentRoutes);
}
