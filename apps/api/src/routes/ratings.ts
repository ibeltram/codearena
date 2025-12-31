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
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  category: z.string().optional(),
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

        const leaderboard = await getLeaderboard({
          seasonId: query.seasonId,
          limit: query.limit,
          offset: query.offset,
          category: query.category,
        });

        const season = await getCurrentSeason();

        return reply.send({
          season: {
            id: season.id,
            name: season.name,
            startsAt: season.startAt,
            endsAt: season.endAt,
          },
          pagination: {
            limit: query.limit,
            offset: query.offset,
            total: leaderboard.length, // Would need count query for actual total
          },
          entries: leaderboard,
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
        const stakeCap = await getUserStakeCap(userId);
        const rating = await getPlayerRating(userId);

        return reply.send({
          stakeCap,
          tier: rating.tier,
          rating: rating.rating,
          deviation: rating.deviation,
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

        return reply.send({
          current: {
            id: current.id,
            name: current.name,
            startsAt: current.startAt,
            endsAt: current.endAt,
          },
          seasons: allSeasons.map((s) => ({
            id: s.id,
            name: s.name,
            startsAt: s.startAt,
            endsAt: s.endAt,
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
      return reply.send({
        tiers: [
          { name: 'Unranked', minRating: 0, minGames: 0 },
          { name: 'Bronze', minRating: 0, minGames: 5 },
          { name: 'Silver', minRating: 1200, minGames: 5 },
          { name: 'Gold', minRating: 1400, minGames: 5 },
          { name: 'Platinum', minRating: 1600, minGames: 5 },
          { name: 'Diamond', minRating: 1800, minGames: 5 },
          { name: 'Master', minRating: 2000, minGames: 5 },
          { name: 'Grandmaster', minRating: 2200, minGames: 5 },
        ],
        defaults: {
          rating: 1500,
          deviation: 350,
          volatility: 0.06,
        },
      });
    },
  });
}
