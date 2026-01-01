/**
 * Admin Stats Routes
 *
 * Provides dashboard statistics for the admin panel.
 */

import { FastifyInstance } from 'fastify';
import { eq, count, gte, and, sql } from 'drizzle-orm';

import { db, schema } from '../../db';

const { challenges, disputes, users, matches } = schema;

export async function adminStatsRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/stats
   *
   * Returns aggregate statistics for the admin dashboard:
   * - Total challenges (published)
   * - Open disputes
   * - Active users (logged in within last 30 days)
   * - Matches today
   */
  app.get('/api/admin/stats', async (request, reply) => {
    // Get total published challenges
    const [challengeCount] = await db
      .select({ total: count() })
      .from(challenges)
      .where(eq(challenges.isPublished, true));

    // Get open disputes count
    const [disputeCount] = await db
      .select({ total: count() })
      .from(disputes)
      .where(eq(disputes.status, 'open'));

    // Get active users (logged in within last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [activeUserCount] = await db
      .select({ total: count() })
      .from(users)
      .where(gte(users.lastLoginAt, thirtyDaysAgo));

    // Get matches created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [matchesTodayCount] = await db
      .select({ total: count() })
      .from(matches)
      .where(gte(matches.createdAt, today));

    return reply.send({
      totalChallenges: challengeCount?.total ?? 0,
      openDisputes: disputeCount?.total ?? 0,
      activeUsers: activeUserCount?.total ?? 0,
      matchesToday: matchesTodayCount?.total ?? 0,
    });
  });
}
