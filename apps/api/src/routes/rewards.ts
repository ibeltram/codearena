/**
 * Rewards Marketplace Routes
 *
 * Provides API endpoints for browsing rewards partners, viewing tiers,
 * checking availability, and user redemption management.
 *
 * Endpoints:
 * - GET /api/rewards/partners - List active partners with tiers and availability
 * - GET /api/rewards/partners/:slug - Get detailed partner info
 * - GET /api/rewards/redemptions - Get user's redemption history
 * - GET /api/rewards/redemptions/:id - Get specific redemption details
 * - POST /api/rewards/redeem - Redeem credits for a partner reward
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count, sql } from 'drizzle-orm';

import { db, schema } from '../db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';

const {
  partnerRewards,
  rewardInventory,
  rewardRedemptions,
  leaderboardPayouts,
  creditAccounts,
  creditLedgerEntries,
} = schema;

// Query parameter schemas
const partnersQuerySchema = z.object({
  rewardType: z.enum(['saas_offset', 'compute_credit']).optional(),
});

const partnerSlugParamSchema = z.object({
  slug: z.string().min(1).max(50),
});

const redemptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'issued', 'activated', 'expired', 'refunded']).optional(),
});

const redemptionIdParamSchema = z.object({
  id: z.string().uuid(),
});

const redeemRequestSchema = z.object({
  partnerSlug: z.string().min(1).max(50),
  tierSlug: z.string().min(1).max(50),
});

const leaderboardHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'issued', 'claimed']).optional(),
  type: z.enum(['weekly', 'season', 'category']).optional(),
});

const leaderboardPayoutIdSchema = z.object({
  id: z.string().uuid(),
});

// Helper to get tier availability from inventory
async function getTierAvailability(partnerRewardId: string): Promise<Map<string, number>> {
  const availability = await db
    .select({
      tierSlug: rewardInventory.tierSlug,
      count: count(),
    })
    .from(rewardInventory)
    .where(
      and(
        eq(rewardInventory.partnerRewardId, partnerRewardId),
        eq(rewardInventory.status, 'available')
      )
    )
    .groupBy(rewardInventory.tierSlug);

  const availabilityMap = new Map<string, number>();
  for (const row of availability) {
    availabilityMap.set(row.tierSlug, row.count);
  }
  return availabilityMap;
}

// Transform tier JSON with availability
interface TierJson {
  slug: string;
  name: string;
  description: string;
  creditsRequired: number;
  valueDescription: string;
}

function transformTiersWithAvailability(
  tiersJson: unknown,
  availabilityMap: Map<string, number>
): Array<TierJson & { available: number }> {
  const tiers = tiersJson as TierJson[];
  if (!Array.isArray(tiers)) return [];

  return tiers.map((tier) => ({
    ...tier,
    available: availabilityMap.get(tier.slug) || 0,
  }));
}

export async function rewardRoutes(app: FastifyInstance) {
  // Helper to get user ID from request
  const getUserId = (request: FastifyRequest): string => {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) {
      throw new ForbiddenError('User authentication required');
    }
    return userId;
  };

  // Helper to get or create credit account for user
  async function getOrCreateCreditAccount(userId: string) {
    const [existingAccount] = await db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId));

    if (existingAccount) {
      return existingAccount;
    }

    const [newAccount] = await db
      .insert(creditAccounts)
      .values({ userId })
      .returning();

    return newAccount;
  }

  /**
   * GET /api/rewards/partners
   * Returns list of active reward partners with tiers and availability
   */
  app.get(
    '/api/rewards/partners',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            rewardType: { type: 'string', enum: ['saas_offset', 'compute_credit'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    partnerSlug: { type: 'string' },
                    name: { type: 'string' },
                    logoUrl: { type: ['string', 'null'] },
                    description: { type: ['string', 'null'] },
                    rewardType: { type: 'string' },
                    creditsRequiredMin: { type: 'number' },
                    creditsRequiredMax: { type: 'number' },
                    tiers: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          slug: { type: 'string' },
                          name: { type: 'string' },
                          description: { type: 'string' },
                          creditsRequired: { type: 'number' },
                          valueDescription: { type: 'string' },
                          available: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const queryResult = partnersQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', {
          issues: queryResult.error.issues,
        });
      }

      const { rewardType } = queryResult.data;

      // Build WHERE conditions - only active partners
      const conditions = [eq(partnerRewards.isActive, true)];

      if (rewardType) {
        conditions.push(eq(partnerRewards.rewardType, rewardType));
      }

      // Get all active partners
      const partners = await db
        .select({
          id: partnerRewards.id,
          partnerSlug: partnerRewards.partnerSlug,
          name: partnerRewards.name,
          logoUrl: partnerRewards.logoUrl,
          description: partnerRewards.description,
          rewardType: partnerRewards.rewardType,
          tiersJson: partnerRewards.tiersJson,
          creditsRequiredMin: partnerRewards.creditsRequiredMin,
          creditsRequiredMax: partnerRewards.creditsRequiredMax,
        })
        .from(partnerRewards)
        .where(and(...conditions))
        .orderBy(partnerRewards.name);

      // Get availability for all partners
      const data = await Promise.all(
        partners.map(async (partner) => {
          const availabilityMap = await getTierAvailability(partner.id);
          const tiers = transformTiersWithAvailability(partner.tiersJson, availabilityMap);

          return {
            partnerSlug: partner.partnerSlug,
            name: partner.name,
            logoUrl: partner.logoUrl,
            description: partner.description,
            rewardType: partner.rewardType,
            creditsRequiredMin: partner.creditsRequiredMin,
            creditsRequiredMax: partner.creditsRequiredMax,
            tiers,
          };
        })
      );

      return { data };
    }
  );

  /**
   * GET /api/rewards/partners/:slug
   * Returns detailed info for a specific partner
   */
  app.get(
    '/api/rewards/partners/:slug',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
          },
          required: ['slug'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  partnerSlug: { type: 'string' },
                  name: { type: 'string' },
                  logoUrl: { type: ['string', 'null'] },
                  description: { type: ['string', 'null'] },
                  rewardType: { type: 'string' },
                  creditsRequiredMin: { type: 'number' },
                  creditsRequiredMax: { type: 'number' },
                  isActive: { type: 'boolean' },
                  tiers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        slug: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        creditsRequired: { type: 'number' },
                        valueDescription: { type: 'string' },
                        available: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramResult = partnerSlugParamSchema.safeParse(request.params);

      if (!paramResult.success) {
        throw new ValidationError('Invalid partner slug', {
          issues: paramResult.error.issues,
        });
      }

      const { slug } = paramResult.data;

      // Get partner by slug
      const [partner] = await db
        .select()
        .from(partnerRewards)
        .where(eq(partnerRewards.partnerSlug, slug));

      if (!partner) {
        throw new NotFoundError('Partner', slug);
      }

      // Get tier availability
      const availabilityMap = await getTierAvailability(partner.id);
      const tiers = transformTiersWithAvailability(partner.tiersJson, availabilityMap);

      return {
        data: {
          partnerSlug: partner.partnerSlug,
          name: partner.name,
          logoUrl: partner.logoUrl,
          description: partner.description,
          rewardType: partner.rewardType,
          creditsRequiredMin: partner.creditsRequiredMin,
          creditsRequiredMax: partner.creditsRequiredMax,
          isActive: partner.isActive,
          tiers,
        },
      };
    }
  );

  /**
   * GET /api/rewards/redemptions
   * Returns user's redemption history with pagination
   */
  app.get(
    '/api/rewards/redemptions',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            status: {
              type: 'string',
              enum: ['pending', 'issued', 'activated', 'expired', 'refunded'],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    partnerSlug: { type: 'string' },
                    partnerName: { type: 'string' },
                    tierSlug: { type: 'string' },
                    creditsSpent: { type: 'number' },
                    status: { type: 'string' },
                    issuedAt: { type: ['string', 'null'] },
                    expiresAt: { type: ['string', 'null'] },
                    createdAt: { type: 'string' },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const queryResult = redemptionsQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', {
          issues: queryResult.error.issues,
        });
      }

      const { page, limit, status } = queryResult.data;
      const offset = (page - 1) * limit;

      // Build WHERE conditions
      const conditions = [eq(rewardRedemptions.userId, userId)];

      if (status) {
        conditions.push(eq(rewardRedemptions.status, status));
      }

      // Get total count
      const [countResult] = await db
        .select({ total: count() })
        .from(rewardRedemptions)
        .where(and(...conditions));

      const total = countResult?.total ?? 0;

      // Get redemptions with partner info
      const redemptions = await db
        .select({
          id: rewardRedemptions.id,
          partnerSlug: partnerRewards.partnerSlug,
          partnerName: partnerRewards.name,
          tierSlug: rewardRedemptions.tierSlug,
          creditsSpent: rewardRedemptions.creditsSpent,
          status: rewardRedemptions.status,
          issuedAt: rewardRedemptions.issuedAt,
          expiresAt: rewardRedemptions.expiresAt,
          createdAt: rewardRedemptions.createdAt,
        })
        .from(rewardRedemptions)
        .innerJoin(partnerRewards, eq(rewardRedemptions.partnerRewardId, partnerRewards.id))
        .where(and(...conditions))
        .orderBy(desc(rewardRedemptions.createdAt))
        .limit(limit)
        .offset(offset);

      const data = redemptions.map((r) => ({
        id: r.id,
        partnerSlug: r.partnerSlug,
        partnerName: r.partnerName,
        tierSlug: r.tierSlug,
        creditsSpent: r.creditsSpent,
        status: r.status,
        issuedAt: r.issuedAt?.toISOString() || null,
        expiresAt: r.expiresAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      }));

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  );

  /**
   * GET /api/rewards/redemptions/:id
   * Returns detailed redemption info including code (if issued)
   */
  app.get(
    '/api/rewards/redemptions/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  partnerSlug: { type: 'string' },
                  partnerName: { type: 'string' },
                  partnerLogoUrl: { type: ['string', 'null'] },
                  tierSlug: { type: 'string' },
                  creditsSpent: { type: 'number' },
                  code: { type: ['string', 'null'] },
                  status: { type: 'string' },
                  issuedAt: { type: ['string', 'null'] },
                  activatedAt: { type: ['string', 'null'] },
                  expiresAt: { type: ['string', 'null'] },
                  createdAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const paramResult = redemptionIdParamSchema.safeParse(request.params);

      if (!paramResult.success) {
        throw new ValidationError('Invalid redemption ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id } = paramResult.data;

      // Get redemption with partner info
      const [redemption] = await db
        .select({
          id: rewardRedemptions.id,
          userId: rewardRedemptions.userId,
          partnerSlug: partnerRewards.partnerSlug,
          partnerName: partnerRewards.name,
          partnerLogoUrl: partnerRewards.logoUrl,
          tierSlug: rewardRedemptions.tierSlug,
          creditsSpent: rewardRedemptions.creditsSpent,
          codeIssued: rewardRedemptions.codeIssued,
          status: rewardRedemptions.status,
          issuedAt: rewardRedemptions.issuedAt,
          activatedAt: rewardRedemptions.activatedAt,
          expiresAt: rewardRedemptions.expiresAt,
          createdAt: rewardRedemptions.createdAt,
        })
        .from(rewardRedemptions)
        .innerJoin(partnerRewards, eq(rewardRedemptions.partnerRewardId, partnerRewards.id))
        .where(eq(rewardRedemptions.id, id));

      if (!redemption) {
        throw new NotFoundError('Redemption', id);
      }

      // Verify ownership
      if (redemption.userId !== userId) {
        throw new ForbiddenError('You do not have access to this redemption');
      }

      return {
        data: {
          id: redemption.id,
          partnerSlug: redemption.partnerSlug,
          partnerName: redemption.partnerName,
          partnerLogoUrl: redemption.partnerLogoUrl,
          tierSlug: redemption.tierSlug,
          creditsSpent: redemption.creditsSpent,
          code: redemption.codeIssued,
          status: redemption.status,
          issuedAt: redemption.issuedAt?.toISOString() || null,
          activatedAt: redemption.activatedAt?.toISOString() || null,
          expiresAt: redemption.expiresAt?.toISOString() || null,
          createdAt: redemption.createdAt.toISOString(),
        },
      };
    }
  );

  /**
   * POST /api/rewards/redeem
   * Redeem credits for a partner reward
   */
  app.post(
    '/api/rewards/redeem',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            partnerSlug: { type: 'string' },
            tierSlug: { type: 'string' },
          },
          required: ['partnerSlug', 'tierSlug'],
        },
        response: {
          201: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  redemptionId: { type: 'string' },
                  code: { type: ['string', 'null'] },
                  status: { type: 'string' },
                  expiresAt: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const bodyResult = redeemRequestSchema.safeParse(request.body);

      if (!bodyResult.success) {
        throw new ValidationError('Invalid request body', {
          issues: bodyResult.error.issues,
        });
      }

      const { partnerSlug, tierSlug } = bodyResult.data;

      // Get partner
      const [partner] = await db
        .select()
        .from(partnerRewards)
        .where(
          and(eq(partnerRewards.partnerSlug, partnerSlug), eq(partnerRewards.isActive, true))
        );

      if (!partner) {
        throw new NotFoundError('Partner', partnerSlug);
      }

      // Find the tier
      const tiers = partner.tiersJson as TierJson[];
      const tier = tiers.find((t) => t.slug === tierSlug);

      if (!tier) {
        throw new NotFoundError('Tier', tierSlug);
      }

      // Get user's credit account
      const account = await getOrCreateCreditAccount(userId);

      // Check sufficient balance
      if (account.balanceAvailable < tier.creditsRequired) {
        return reply.status(400).send({
          error: 'insufficient_balance',
          errorDescription: `Insufficient credits. Required: ${tier.creditsRequired}, Available: ${account.balanceAvailable}`,
        });
      }

      // Find available inventory code
      const [availableCode] = await db
        .select()
        .from(rewardInventory)
        .where(
          and(
            eq(rewardInventory.partnerRewardId, partner.id),
            eq(rewardInventory.tierSlug, tierSlug),
            eq(rewardInventory.status, 'available')
          )
        )
        .limit(1);

      if (!availableCode) {
        return reply.status(400).send({
          error: 'out_of_stock',
          errorDescription: 'This reward tier is currently out of stock',
        });
      }

      // Calculate expiration (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Perform redemption in a transaction
      const result = await db.transaction(async (tx) => {
        // Deduct credits from user account
        await tx
          .update(creditAccounts)
          .set({
            balanceAvailable: sql`${creditAccounts.balanceAvailable} - ${tier.creditsRequired}`,
            updatedAt: new Date(),
          })
          .where(eq(creditAccounts.id, account.id));

        // Create ledger entry
        const idempotencyKey = `redeem-${userId}-${partner.id}-${tierSlug}-${Date.now()}`;
        await tx.insert(creditLedgerEntries).values({
          idempotencyKey,
          accountId: account.id,
          type: 'redemption',
          amount: -tier.creditsRequired,
          metadataJson: {
            partnerSlug,
            tierSlug,
            item: `${partner.name} - ${tier.name}`,
          },
        });

        // Mark inventory code as redeemed
        await tx
          .update(rewardInventory)
          .set({ status: 'redeemed' })
          .where(eq(rewardInventory.id, availableCode.id));

        // Create redemption record
        const [redemption] = await tx
          .insert(rewardRedemptions)
          .values({
            userId,
            partnerRewardId: partner.id,
            tierSlug,
            creditsSpent: tier.creditsRequired,
            codeIssued: availableCode.code,
            status: 'issued',
            issuedAt: new Date(),
            expiresAt,
          })
          .returning();

        return redemption;
      });

      return reply.status(201).send({
        data: {
          redemptionId: result.id,
          code: result.codeIssued,
          status: result.status,
          expiresAt: result.expiresAt?.toISOString() || null,
        },
      });
    }
  );

  /**
   * GET /api/rewards/leaderboard
   * Returns current/pending leaderboard rewards for the user
   */
  app.get(
    '/api/rewards/leaderboard',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    leaderboardType: { type: 'string' },
                    periodStart: { type: 'string' },
                    periodEnd: { type: 'string' },
                    rank: { type: 'number' },
                    rewardValue: { type: 'number' },
                    rewardDescription: { type: 'string' },
                    status: { type: 'string' },
                    createdAt: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      // Get pending/issued leaderboard rewards for user
      const payouts = await db
        .select()
        .from(leaderboardPayouts)
        .where(
          and(
            eq(leaderboardPayouts.userId, userId),
            sql`${leaderboardPayouts.status} IN ('pending', 'issued')`
          )
        )
        .orderBy(desc(leaderboardPayouts.createdAt));

      return {
        data: payouts.map((p) => ({
          id: p.id,
          leaderboardType: p.leaderboardType,
          periodStart: p.periodStart.toISOString(),
          periodEnd: p.periodEnd.toISOString(),
          rank: p.rank,
          rewardValue: p.rewardValue,
          rewardDescription: p.rewardDescription,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
        })),
      };
    }
  );

  /**
   * GET /api/rewards/leaderboard/history
   * Returns leaderboard rewards history for the user
   */
  app.get(
    '/api/rewards/leaderboard/history',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            status: { type: 'string', enum: ['pending', 'issued', 'claimed'] },
            type: { type: 'string', enum: ['weekly', 'season', 'category'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    leaderboardType: { type: 'string' },
                    periodStart: { type: 'string' },
                    periodEnd: { type: 'string' },
                    rank: { type: 'number' },
                    rewardValue: { type: 'number' },
                    rewardDescription: { type: 'string' },
                    status: { type: 'string' },
                    createdAt: { type: 'string' },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const queryResult = leaderboardHistoryQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', {
          issues: queryResult.error.issues,
        });
      }

      const { page, limit, status, type } = queryResult.data;
      const offset = (page - 1) * limit;

      // Build WHERE conditions
      const conditions = [eq(leaderboardPayouts.userId, userId)];
      if (status) {
        conditions.push(eq(leaderboardPayouts.status, status));
      }
      if (type) {
        conditions.push(eq(leaderboardPayouts.leaderboardType, type));
      }

      // Get total count
      const [countResult] = await db
        .select({ total: count() })
        .from(leaderboardPayouts)
        .where(and(...conditions));

      const total = countResult?.total ?? 0;

      // Get payouts
      const payouts = await db
        .select()
        .from(leaderboardPayouts)
        .where(and(...conditions))
        .orderBy(desc(leaderboardPayouts.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        data: payouts.map((p) => ({
          id: p.id,
          leaderboardType: p.leaderboardType,
          periodStart: p.periodStart.toISOString(),
          periodEnd: p.periodEnd.toISOString(),
          rank: p.rank,
          rewardValue: p.rewardValue,
          rewardDescription: p.rewardDescription,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  );

  /**
   * POST /api/rewards/leaderboard/:id/claim
   * Claim a leaderboard reward
   */
  app.post(
    '/api/rewards/leaderboard/:id/claim',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string' },
                  rewardValue: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const paramResult = leaderboardPayoutIdSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid payout ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id } = paramResult.data;

      // Get the payout
      const [payout] = await db
        .select()
        .from(leaderboardPayouts)
        .where(eq(leaderboardPayouts.id, id));

      if (!payout) {
        throw new NotFoundError('Leaderboard payout', id);
      }

      // Verify ownership
      if (payout.userId !== userId) {
        throw new ForbiddenError('You do not have access to this reward');
      }

      // Check if already claimed
      if (payout.status === 'claimed') {
        return reply.status(400).send({
          error: 'already_claimed',
          errorDescription: 'This reward has already been claimed',
        });
      }

      // Check if in claimable state (issued)
      if (payout.status !== 'issued') {
        return reply.status(400).send({
          error: 'not_claimable',
          errorDescription: 'This reward is not yet available for claiming',
        });
      }

      // Claim the reward - add credits to user account
      await db.transaction(async (tx) => {
        // Get or create credit account
        const account = await getOrCreateCreditAccount(userId);

        // Add credits
        await tx
          .update(creditAccounts)
          .set({
            balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${payout.rewardValue}`,
            updatedAt: new Date(),
          })
          .where(eq(creditAccounts.id, account.id));

        // Create ledger entry
        const idempotencyKey = `leaderboard-claim-${id}`;
        await tx.insert(creditLedgerEntries).values({
          idempotencyKey,
          accountId: account.id,
          type: 'earn',
          amount: payout.rewardValue,
          metadataJson: {
            source: 'leaderboard',
            payoutId: id,
            leaderboardType: payout.leaderboardType,
            rank: payout.rank,
            description: payout.rewardDescription,
          },
        });

        // Update payout status
        await tx
          .update(leaderboardPayouts)
          .set({ status: 'claimed' })
          .where(eq(leaderboardPayouts.id, id));
      });

      return {
        data: {
          id: payout.id,
          status: 'claimed',
          rewardValue: payout.rewardValue,
        },
      };
    }
  );

  /**
   * POST /api/rewards/redemptions/:id/resend
   * Resend redemption code to user's email
   */
  app.post(
    '/api/rewards/redemptions/:id/resend',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const paramResult = redemptionIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid redemption ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id } = paramResult.data;

      // Get the redemption
      const [redemption] = await db
        .select({
          id: rewardRedemptions.id,
          userId: rewardRedemptions.userId,
          codeIssued: rewardRedemptions.codeIssued,
          status: rewardRedemptions.status,
          partnerName: partnerRewards.name,
          tierSlug: rewardRedemptions.tierSlug,
        })
        .from(rewardRedemptions)
        .innerJoin(partnerRewards, eq(rewardRedemptions.partnerRewardId, partnerRewards.id))
        .where(eq(rewardRedemptions.id, id));

      if (!redemption) {
        throw new NotFoundError('Redemption', id);
      }

      // Verify ownership
      if (redemption.userId !== userId) {
        throw new ForbiddenError('You do not have access to this redemption');
      }

      // Check if code exists
      if (!redemption.codeIssued) {
        return reply.status(400).send({
          error: 'no_code',
          errorDescription: 'No code available to resend',
        });
      }

      // In a real implementation, this would send an email
      // For now, just return success (email service integration would be added)
      console.log(`[Mock Email] Resending code for ${redemption.partnerName} - ${redemption.tierSlug} to user ${userId}`);

      return { success: true };
    }
  );
}
