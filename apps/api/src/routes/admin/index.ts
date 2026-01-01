import { FastifyInstance } from 'fastify';

import { adminChallengeRoutes } from './challenges';
import { adminDisputeRoutes } from './disputes';
import { adminUserRoutes } from './users';
import { adminStatsRoutes } from './stats';
import { adminReportRoutes } from './reports';
import { adminCollusionRoutes } from './collusion';

export async function adminRoutes(app: FastifyInstance) {
  // Admin stats routes (dashboard statistics)
  await app.register(adminStatsRoutes);

  // Admin challenge management routes
  await app.register(adminChallengeRoutes);

  // Admin dispute management routes
  await app.register(adminDisputeRoutes);

  // Admin user management routes (role assignment, banning)
  await app.register(adminUserRoutes);

  // Admin user report management routes
  await app.register(adminReportRoutes);

  // Admin collusion detection routes
  await app.register(adminCollusionRoutes);

  // TODO: Add other admin routes
  // await app.register(adminTournamentRoutes);
}
