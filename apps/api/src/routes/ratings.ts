/**
 * Ratings API Routes
 *
 * Endpoints for player ratings, leaderboards, and ranking information.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getPlayerRating,
  getLeaderboard,
  getRatingHistory,
  previewMatchRatingChanges,
  getCurrentSeason,
  validateStakeAmount,
  getUserStakeCap,
} from '../lib/rating-service';
import { getConfidenceInterval, getRatingTier } from '../lib/glicko2';

// Request schemas
const leaderboardQuerySchema = z.object({
  seasonId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(25),
  page: z.coerce.number().min(1).default(1),
  category: z.string().optional(),
  search: z.string().optional(),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  seasonId: z.string().uuid().optional(),
});

const previewParamsSchema = z.object({
  opponentId: z.string().uuid(),
});

const validateStakeSchema = z.object({
  amount: z.number().positive(),
});

// Season management schemas
const createSeasonSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  rules: z.object({
    minGamesForRanking: z.number().min(1).default(5),
    inactivityPenaltyDays: z.number().min(1).default(7),
    placementGames: z.number().min(0).default(3),
    ratingDecayFactor: z.number().min(0).max(1).default(0.8),
  }).optional(),
  rewards: z.object({
    tiers: z.array(z.object({
      rankMin: z.number().min(1),
      rankMax: z.number().min(1),
      credits: z.number().min(0),
      badge: z.string().optional(),
      title: z.string().optional(),
    })),
    totalPrizePool: z.number().optional(),
  }).optional(),
});

const updateSeasonSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  status: z.enum(['upcoming', 'active', 'ended', 'archived']).optional(),
  rules: z.object({
    minGamesForRanking: z.number().min(1).optional(),
    inactivityPenaltyDays: z.number().min(1).optional(),
    placementGames: z.number().min(0).optional(),
    ratingDecayFactor: z.number().min(0).max(1).optional(),
  }).optional(),
  rewards: z.object({
    tiers: z.array(z.object({
      rankMin: z.number().min(1),
      rankMax: z.number().min(1),
      credits: z.number().min(0),
      badge: z.string().optional(),
      title: z.string().optional(),
    })),
    totalPrizePool: z.number().optional(),
  }).optional(),
});

export default async function ratingsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/ratings/me
   * Get current user's rating
   */
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      try {
        const rating = await getPlayerRating(userId);
        const season = await getCurrentSeason();

        return reply.send({
          rating: rating.rating,
          deviation: rating.deviation,
          volatility: rating.volatility,
          tier: rating.tier,
          gamesPlayed: rating.gamesPlayed,
          confidence: {
            lower: rating.confidence[0],
            upper: rating.confidence[1],
          },
          stakeCap: rating.stakeCap,
          season: {
            id: season.id,
            name: season.name,
            endsAt: season.endAt,
          },
        });
      } catch (error) {
        request.log.error({ error, userId }, 'Failed to get player rating');
        return reply.status(500).send({ error: 'Failed to get rating' });
      }
    },
  });

  /**
   * GET /api/ratings/users/:userId
   * Get a specific user's rating
   */
  fastify.get<{ Params: { userId: string } }>('/users/:userId', {
    handler: async (request, reply) => {
      const { userId } = request.params;

      try {
        const rating = await getPlayerRating(userId);

        return reply.send({
          userId,
          rating: rating.rating,
          deviation: rating.deviation,
          tier: rating.tier,
          gamesPlayed: rating.gamesPlayed,
          confidence: {
            lower: rating.confidence[0],
            upper: rating.confidence[1],
          },
        });
      } catch (error) {
        request.log.error({ error, userId }, 'Failed to get user rating');
        return reply.status(404).send({ error: 'User not found' });
      }
    },
  });

  /**
   * GET /api/ratings/leaderboard
   * Get the leaderboard
   */
  fastify.get('/leaderboard', {
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = leaderboardQuerySchema.parse(request.query);
        const offset = (query.page - 1) * query.limit;

        const leaderboard = await getLeaderboard({
          seasonId: query.seasonId,
          limit: query.limit,
          offset,
          category: query.category,
        });

        const season = await getCurrentSeason();

        // Get total count for pagination (simplified - in production would query separately)
        const totalEstimate = leaderboard.length < query.limit ? offset + leaderboard.length : offset + query.limit + 1;
        const total = Math.max(totalEstimate, leaderboard.length);
        const totalPages = Math.ceil(total / query.limit);

        return reply.send({
          season: {
            id: season.id,
            name: season.name,
            startDate: season.startAt.toISOString(),
            endDate: season.endAt?.toISOString() || null,
            isCurrent: true,
          },
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages,
          },
          data: leaderboard.map((entry, index) => ({
            ...entry,
            rank: offset + index + 1,
            previousRank: null,
            ratingChange: 0,
            wins: entry.wins || 0,
            losses: entry.losses || 0,
            draws: entry.draws || 0,
            winRate: entry.wins && (entry.wins + entry.losses) > 0
              ? Math.round((entry.wins / (entry.wins + entry.losses)) * 100)
              : 0,
            isCurrentUser: false,
          })),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Invalid query parameters', details: error.errors });
        }
        request.log.error({ error }, 'Failed to get leaderboard');
        return reply.status(500).send({ error: 'Failed to get leaderboard' });
      }
    },
  });

  /**
   * GET /api/ratings/history
   * Get current user's rating history
   */
  fastify.get('/history', {
    preHandler: [fastify.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      try {
        const query = historyQuerySchema.parse(request.query);

        const history = await getRatingHistory(userId, {
          limit: query.limit,
          seasonId: query.seasonId,
        });

        return reply.send({
          history,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Invalid query parameters', details: error.errors });
        }
        request.log.error({ error, userId }, 'Failed to get rating history');
        return reply.status(500).send({ error: 'Failed to get rating history' });
      }
    },
  });

  /**
   * GET /api/ratings/history/:userId
   * Get a specific user's rating history
   */
  fastify.get<{ Params: { userId: string } }>('/history/:userId', {
    handler: async (request, reply) => {
      const { userId } = request.params;

      try {
        const query = historyQuerySchema.parse(request.query);

        const history = await getRatingHistory(userId, {
          limit: query.limit,
          seasonId: query.seasonId,
        });

        return reply.send({
          userId,
          history,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Invalid query parameters', details: error.errors });
        }
        request.log.error({ error, userId }, 'Failed to get user rating history');
        return reply.status(500).send({ error: 'Failed to get rating history' });
      }
    },
  });

  /**
   * GET /api/ratings/preview/:opponentId
   * Preview rating changes for a potential match
   */
  fastify.get<{ Params: { opponentId: string } }>('/preview/:opponentId', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { opponentId } = request.params;

      if (userId === opponentId) {
        return reply.status(400).send({ error: 'Cannot preview match against yourself' });
      }

      try {
        const preview = await previewMatchRatingChanges(userId, opponentId);

        return reply.send({
          userId,
          opponentId,
          potentialChanges: {
            win: preview.win,
            loss: preview.loss,
            draw: preview.draw,
          },
          expectedScore: preview.expectedScore,
          opponentTier: preview.opponentTier,
        });
      } catch (error) {
        request.log.error({ error, userId, opponentId }, 'Failed to preview rating changes');
        return reply.status(500).send({ error: 'Failed to preview rating changes' });
      }
    },
  });

  /**
   * GET /api/ratings/stake-cap
   * Get current user's stake cap
   */
  fastify.get('/stake-cap', {
    preHandler: [fastify.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      try {
        const { getStakeCapTier, STAKE_CAP_TIERS } = await import('../lib/glicko2');
        const stakeCap = await getUserStakeCap(userId);
        const rating = await getPlayerRating(userId);
        const stakeCapTier = getStakeCapTier(rating.rating);

        return reply.send({
          stakeCap,
          stakeCapTier,
          tier: rating.tier,
          rating: rating.rating,
          deviation: rating.deviation,
          tiers: STAKE_CAP_TIERS,
        });
      } catch (error) {
        request.log.error({ error, userId }, 'Failed to get stake cap');
        return reply.status(500).send({ error: 'Failed to get stake cap' });
      }
    },
  });

  /**
   * POST /api/ratings/validate-stake
   * Validate if a stake amount is allowed
   */
  fastify.post('/validate-stake', {
    preHandler: [fastify.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      try {
        const body = validateStakeSchema.parse(request.body);
        const result = await validateStakeAmount(userId, body.amount);

        return reply.send(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Invalid request body', details: error.errors });
        }
        request.log.error({ error, userId }, 'Failed to validate stake');
        return reply.status(500).send({ error: 'Failed to validate stake' });
      }
    },
  });

  /**
   * GET /api/ratings/seasons
   * Get available seasons
   */
  fastify.get('/seasons', {
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { db, schema } = await import('../db');
        const { desc } = await import('drizzle-orm');

        const allSeasons = await db
          .select()
          .from(schema.seasons)
          .orderBy(desc(schema.seasons.startAt))
          .limit(10);

        const current = await getCurrentSeason();

        // Return in format expected by frontend (data array)
        return reply.send({
          data: allSeasons.map((s) => ({
            id: s.id,
            name: s.name,
            startDate: s.startAt.toISOString(),
            endDate: s.endAt?.toISOString() || null,
            isCurrent: s.id === current.id,
          })),
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to get seasons');
        return reply.status(500).send({ error: 'Failed to get seasons' });
      }
    },
  });

  /**
   * GET /api/ratings/tiers
   * Get rating tier definitions
   */
  fastify.get('/tiers', {
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const { STAKE_CAP_TIERS } = await import('../lib/glicko2');

      return reply.send({
        tiers: [
          { name: 'Unranked', minRating: 0, minGames: 0, stakeCap: 50 },
          { name: 'Bronze', minRating: 0, minGames: 5, stakeCap: STAKE_CAP_TIERS.bronze.cap },
          { name: 'Silver', minRating: 1200, minGames: 5, stakeCap: STAKE_CAP_TIERS.silver.cap },
          { name: 'Gold', minRating: 1400, minGames: 5, stakeCap: STAKE_CAP_TIERS.gold.cap },
          { name: 'Platinum', minRating: 1600, minGames: 5, stakeCap: STAKE_CAP_TIERS.platinum.cap },
          { name: 'Diamond', minRating: 1800, minGames: 5, stakeCap: STAKE_CAP_TIERS.diamond.cap },
          { name: 'Master', minRating: 2000, minGames: 5, stakeCap: STAKE_CAP_TIERS.diamond.cap },
          { name: 'Grandmaster', minRating: 2200, minGames: 5, stakeCap: STAKE_CAP_TIERS.diamond.cap },
        ],
        stakeCaps: STAKE_CAP_TIERS,
        defaults: {
          rating: 1500,
          deviation: 350,
          volatility: 0.06,
        },
      });
    },
  });

  /**
   * GET /api/ratings/seasons/:id
   * Get a specific season by ID
   */
  fastify.get<{ Params: { id: string } }>('/seasons/:id', {
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const { db, schema } = await import('../db');
        const { eq } = await import('drizzle-orm');

        const [season] = await db
          .select()
          .from(schema.seasons)
          .where(eq(schema.seasons.id, id))
          .limit(1);

        if (!season) {
          return reply.status(404).send({ error: 'Season not found' });
        }

        const current = await getCurrentSeason();

        return reply.send({
          id: season.id,
          name: season.name,
          description: season.description,
          startDate: season.startAt.toISOString(),
          endDate: season.endAt.toISOString(),
          status: season.status,
          isCurrent: season.id === current.id,
          rules: season.rulesJson,
          rewards: season.rewardsJson,
          createdAt: season.createdAt?.toISOString(),
          updatedAt: season.updatedAt?.toISOString(),
        });
      } catch (error) {
        request.log.error({ error, id }, 'Failed to get season');
        return reply.status(500).send({ error: 'Failed to get season' });
      }
    },
  });

  /**
   * POST /api/ratings/seasons
   * Create a new season (admin only)
   */
  fastify.post('/seasons', {
    preHandler: [fastify.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      // TODO: Add admin check
      // const user = request.user!;
      // if (user.role !== 'admin') {
      //   return reply.status(403).send({ error: 'Admin access required' });
      // }

      try {
        const body = createSeasonSchema.parse(request.body);
        const { db, schema } = await import('../db');

        const [newSeason] = await db
          .insert(schema.seasons)
          .values({
            name: body.name,
            description: body.description,
            startAt: new Date(body.startAt),
            endAt: new Date(body.endAt),
            status: new Date(body.startAt) <= new Date() ? 'active' : 'upcoming',
            rulesJson: body.rules || {
              minGamesForRanking: 5,
              inactivityPenaltyDays: 7,
              placementGames: 3,
            },
            rewardsJson: body.rewards || { tiers: [] },
          })
          .returning();

        request.log.info({ seasonId: newSeason.id }, 'Season created');

        return reply.status(201).send({
          id: newSeason.id,
          name: newSeason.name,
          description: newSeason.description,
          startDate: newSeason.startAt.toISOString(),
          endDate: newSeason.endAt.toISOString(),
          status: newSeason.status,
          rules: newSeason.rulesJson,
          rewards: newSeason.rewardsJson,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Invalid request body', details: error.errors });
        }
        request.log.error({ error }, 'Failed to create season');
        return reply.status(500).send({ error: 'Failed to create season' });
      }
    },
  });

  /**
   * PATCH /api/ratings/seasons/:id
   * Update a season (admin only)
   */
  fastify.patch<{ Params: { id: string } }>('/seasons/:id', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const body = updateSeasonSchema.parse(request.body);
        const { db, schema } = await import('../db');
        const { eq } = await import('drizzle-orm');

        // Check if season exists
        const [existing] = await db
          .select()
          .from(schema.seasons)
          .where(eq(schema.seasons.id, id))
          .limit(1);

        if (!existing) {
          return reply.status(404).send({ error: 'Season not found' });
        }

        // Build update object
        const updates: Record<string, unknown> = { updatedAt: new Date() };

        if (body.name) updates.name = body.name;
        if (body.description !== undefined) updates.description = body.description;
        if (body.startAt) updates.startAt = new Date(body.startAt);
        if (body.endAt) updates.endAt = new Date(body.endAt);
        if (body.status) updates.status = body.status;
        if (body.rules) {
          updates.rulesJson = { ...(existing.rulesJson as object), ...body.rules };
        }
        if (body.rewards) {
          updates.rewardsJson = body.rewards;
        }

        const [updated] = await db
          .update(schema.seasons)
          .set(updates)
          .where(eq(schema.seasons.id, id))
          .returning();

        request.log.info({ seasonId: id }, 'Season updated');

        return reply.send({
          id: updated.id,
          name: updated.name,
          description: updated.description,
          startDate: updated.startAt.toISOString(),
          endDate: updated.endAt.toISOString(),
          status: updated.status,
          rules: updated.rulesJson,
          rewards: updated.rewardsJson,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Invalid request body', details: error.errors });
        }
        request.log.error({ error, id }, 'Failed to update season');
        return reply.status(500).send({ error: 'Failed to update season' });
      }
    },
  });

  /**
   * POST /api/ratings/seasons/:id/end
   * End a season and distribute rewards (admin only)
   */
  fastify.post<{ Params: { id: string } }>('/seasons/:id/end', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const { db, schema } = await import('../db');
        const { eq, desc, and } = await import('drizzle-orm');

        // Get the season
        const [season] = await db
          .select()
          .from(schema.seasons)
          .where(eq(schema.seasons.id, id))
          .limit(1);

        if (!season) {
          return reply.status(404).send({ error: 'Season not found' });
        }

        if (season.status === 'ended' || season.status === 'archived') {
          return reply.status(400).send({ error: 'Season has already ended' });
        }

        // Get final standings
        const finalStandings = await db
          .select({
            userId: schema.rankings.userId,
            rating: schema.rankings.rating,
          })
          .from(schema.rankings)
          .where(eq(schema.rankings.seasonId, id))
          .orderBy(desc(schema.rankings.rating));

        // Get rewards config
        const rewardsConfig = season.rewardsJson as { tiers?: Array<{ rankMin: number; rankMax: number; credits: number; badge?: string; title?: string }> };
        const tiers = rewardsConfig?.tiers || [];

        // Distribute rewards
        const payouts: Array<{
          userId: string;
          rank: number;
          rating: number;
          credits: number;
          badge?: string;
          title?: string;
        }> = [];

        for (let i = 0; i < finalStandings.length; i++) {
          const rank = i + 1;
          const player = finalStandings[i];

          // Find matching reward tier
          const tier = tiers.find((t) => rank >= t.rankMin && rank <= t.rankMax);

          if (tier) {
            // Create payout record
            await db.insert(schema.seasonRewardPayouts).values({
              seasonId: id,
              userId: player.userId,
              finalRank: rank,
              finalRating: player.rating,
              creditsAwarded: tier.credits,
              badgeAwarded: tier.badge,
              titleAwarded: tier.title,
            });

            payouts.push({
              userId: player.userId,
              rank,
              rating: player.rating,
              credits: tier.credits,
              badge: tier.badge,
              title: tier.title,
            });
          }
        }

        // Update season status
        await db
          .update(schema.seasons)
          .set({
            status: 'ended',
            updatedAt: new Date(),
            rewardsJson: {
              ...rewardsConfig,
              distributedAt: new Date().toISOString(),
            },
          })
          .where(eq(schema.seasons.id, id));

        request.log.info({ seasonId: id, payoutsCount: payouts.length }, 'Season ended and rewards distributed');

        return reply.send({
          message: 'Season ended successfully',
          seasonId: id,
          totalPlayers: finalStandings.length,
          rewardsDistributed: payouts.length,
          payouts: payouts.slice(0, 10), // Return top 10 for preview
        });
      } catch (error) {
        request.log.error({ error, id }, 'Failed to end season');
        return reply.status(500).send({ error: 'Failed to end season' });
      }
    },
  });

  /**
   * GET /api/ratings/seasons/:id/standings
   * Get final standings for a season
   */
  fastify.get<{ Params: { id: string } }>('/seasons/:id/standings', {
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const querySchema = z.object({
          limit: z.coerce.number().min(1).max(100).default(50),
          offset: z.coerce.number().min(0).default(0),
        });
        const query = querySchema.parse(request.query);

        const { db, schema } = await import('../db');
        const { eq, desc, sql } = await import('drizzle-orm');

        // Get season
        const [season] = await db
          .select()
          .from(schema.seasons)
          .where(eq(schema.seasons.id, id))
          .limit(1);

        if (!season) {
          return reply.status(404).send({ error: 'Season not found' });
        }

        // Get standings
        const standings = await db
          .select({
            userId: schema.rankings.userId,
            displayName: schema.users.displayName,
            avatarUrl: schema.users.avatarUrl,
            rating: schema.rankings.rating,
            deviation: schema.rankings.deviation,
          })
          .from(schema.rankings)
          .innerJoin(schema.users, eq(schema.rankings.userId, schema.users.id))
          .where(eq(schema.rankings.seasonId, id))
          .orderBy(desc(schema.rankings.rating))
          .limit(query.limit)
          .offset(query.offset);

        // Get total count
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.rankings)
          .where(eq(schema.rankings.seasonId, id));

        const total = Number(countResult?.count || 0);

        // Check if rewards have been distributed
        const [payout] = await db
          .select()
          .from(schema.seasonRewardPayouts)
          .where(eq(schema.seasonRewardPayouts.seasonId, id))
          .limit(1);

        const rewardsDistributed = !!payout;

        return reply.send({
          season: {
            id: season.id,
            name: season.name,
            status: season.status,
            startDate: season.startAt.toISOString(),
            endDate: season.endAt.toISOString(),
            rewardsDistributed,
          },
          pagination: {
            limit: query.limit,
            offset: query.offset,
            total,
          },
          data: standings.map((s, index) => ({
            rank: query.offset + index + 1,
            userId: s.userId,
            displayName: s.displayName,
            avatarUrl: s.avatarUrl,
            rating: s.rating,
            deviation: s.deviation,
          })),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Invalid query parameters', details: error.errors });
        }
        request.log.error({ error, id }, 'Failed to get season standings');
        return reply.status(500).send({ error: 'Failed to get season standings' });
      }
    },
  });

  /**
   * GET /api/ratings/seasons/:id/rewards
   * Get reward payouts for a season
   */
  fastify.get<{ Params: { id: string } }>('/seasons/:id/rewards', {
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const { db, schema } = await import('../db');
        const { eq, asc } = await import('drizzle-orm');

        // Get season
        const [season] = await db
          .select()
          .from(schema.seasons)
          .where(eq(schema.seasons.id, id))
          .limit(1);

        if (!season) {
          return reply.status(404).send({ error: 'Season not found' });
        }

        // Get payouts
        const payouts = await db
          .select({
            id: schema.seasonRewardPayouts.id,
            userId: schema.seasonRewardPayouts.userId,
            displayName: schema.users.displayName,
            avatarUrl: schema.users.avatarUrl,
            finalRank: schema.seasonRewardPayouts.finalRank,
            finalRating: schema.seasonRewardPayouts.finalRating,
            creditsAwarded: schema.seasonRewardPayouts.creditsAwarded,
            badgeAwarded: schema.seasonRewardPayouts.badgeAwarded,
            titleAwarded: schema.seasonRewardPayouts.titleAwarded,
            claimedAt: schema.seasonRewardPayouts.claimedAt,
            createdAt: schema.seasonRewardPayouts.createdAt,
          })
          .from(schema.seasonRewardPayouts)
          .innerJoin(schema.users, eq(schema.seasonRewardPayouts.userId, schema.users.id))
          .where(eq(schema.seasonRewardPayouts.seasonId, id))
          .orderBy(asc(schema.seasonRewardPayouts.finalRank));

        const rewardsConfig = season.rewardsJson as { tiers?: unknown[]; totalPrizePool?: number; distributedAt?: string };

        return reply.send({
          season: {
            id: season.id,
            name: season.name,
            status: season.status,
          },
          config: {
            tiers: rewardsConfig?.tiers || [],
            totalPrizePool: rewardsConfig?.totalPrizePool,
            distributedAt: rewardsConfig?.distributedAt,
          },
          payouts: payouts.map((p) => ({
            id: p.id,
            userId: p.userId,
            displayName: p.displayName,
            avatarUrl: p.avatarUrl,
            rank: p.finalRank,
            rating: p.finalRating,
            credits: p.creditsAwarded,
            badge: p.badgeAwarded,
            title: p.titleAwarded,
            claimed: !!p.claimedAt,
            claimedAt: p.claimedAt?.toISOString(),
            createdAt: p.createdAt?.toISOString(),
          })),
        });
      } catch (error) {
        request.log.error({ error, id }, 'Failed to get season rewards');
        return reply.status(500).send({ error: 'Failed to get season rewards' });
      }
    },
  });

  /**
   * POST /api/ratings/seasons/rewards/:payoutId/claim
   * Claim a season reward (adds credits to wallet)
   */
  fastify.post<{ Params: { payoutId: string } }>('/seasons/rewards/:payoutId/claim', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { payoutId } = request.params;

      try {
        const { db, schema } = await import('../db');
        const { eq, and } = await import('drizzle-orm');

        // Get payout
        const [payout] = await db
          .select()
          .from(schema.seasonRewardPayouts)
          .where(
            and(
              eq(schema.seasonRewardPayouts.id, payoutId),
              eq(schema.seasonRewardPayouts.userId, userId)
            )
          )
          .limit(1);

        if (!payout) {
          return reply.status(404).send({ error: 'Reward not found' });
        }

        if (payout.claimedAt) {
          return reply.status(400).send({ error: 'Reward already claimed' });
        }

        // Add credits to user's wallet
        if (payout.creditsAwarded > 0) {
          // Get or create wallet
          const [wallet] = await db
            .select()
            .from(schema.wallets)
            .where(eq(schema.wallets.userId, userId))
            .limit(1);

          if (wallet) {
            await db
              .update(schema.wallets)
              .set({
                balance: wallet.balance + payout.creditsAwarded,
                updatedAt: new Date(),
              })
              .where(eq(schema.wallets.id, wallet.id));
          } else {
            await db.insert(schema.wallets).values({
              userId,
              balance: payout.creditsAwarded,
            });
          }

          // Create transaction record
          await db.insert(schema.transactions).values({
            walletId: wallet?.id || (await db.select().from(schema.wallets).where(eq(schema.wallets.userId, userId)).limit(1).then(r => r[0].id)),
            type: 'credit',
            amount: payout.creditsAwarded,
            description: `Season reward - Rank #${payout.finalRank}`,
            referenceType: 'season_reward',
            referenceId: payoutId,
          });
        }

        // Mark as claimed
        await db
          .update(schema.seasonRewardPayouts)
          .set({ claimedAt: new Date() })
          .where(eq(schema.seasonRewardPayouts.id, payoutId));

        request.log.info({ userId, payoutId, credits: payout.creditsAwarded }, 'Season reward claimed');

        return reply.send({
          success: true,
          creditsAwarded: payout.creditsAwarded,
          badge: payout.badgeAwarded,
          title: payout.titleAwarded,
        });
      } catch (error) {
        request.log.error({ error, payoutId, userId }, 'Failed to claim season reward');
        return reply.status(500).send({ error: 'Failed to claim reward' });
      }
    },
  });

  /**
   * GET /api/ratings/my-season-rewards
   * Get current user's unclaimed season rewards
   */
  fastify.get('/my-season-rewards', {
    preHandler: [fastify.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      try {
        const { db, schema } = await import('../db');
        const { eq, isNull, and } = await import('drizzle-orm');

        const rewards = await db
          .select({
            id: schema.seasonRewardPayouts.id,
            seasonId: schema.seasonRewardPayouts.seasonId,
            seasonName: schema.seasons.name,
            finalRank: schema.seasonRewardPayouts.finalRank,
            finalRating: schema.seasonRewardPayouts.finalRating,
            creditsAwarded: schema.seasonRewardPayouts.creditsAwarded,
            badgeAwarded: schema.seasonRewardPayouts.badgeAwarded,
            titleAwarded: schema.seasonRewardPayouts.titleAwarded,
            createdAt: schema.seasonRewardPayouts.createdAt,
          })
          .from(schema.seasonRewardPayouts)
          .innerJoin(schema.seasons, eq(schema.seasonRewardPayouts.seasonId, schema.seasons.id))
          .where(
            and(
              eq(schema.seasonRewardPayouts.userId, userId),
              isNull(schema.seasonRewardPayouts.claimedAt)
            )
          );

        return reply.send({
          data: rewards.map((r) => ({
            id: r.id,
            seasonId: r.seasonId,
            seasonName: r.seasonName,
            rank: r.finalRank,
            rating: r.finalRating,
            credits: r.creditsAwarded,
            badge: r.badgeAwarded,
            title: r.titleAwarded,
            createdAt: r.createdAt?.toISOString(),
          })),
        });
      } catch (error) {
        request.log.error({ error, userId }, 'Failed to get user season rewards');
        return reply.status(500).send({ error: 'Failed to get season rewards' });
      }
    },
  });
}
