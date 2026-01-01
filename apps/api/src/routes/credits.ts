/**
 * Credits Routes
 *
 * Provides API endpoints for credit balance, transaction history, active holds,
 * and staking operations.
 *
 * Endpoints:
 * - GET /api/credits/balance - Get user's credit balance (available, reserved, total)
 * - GET /api/credits/history - Get paginated transaction history with filtering
 * - GET /api/credits/holds - Get active credit holds
 * - GET /api/credits/holds/:id - Get specific hold details
 * - POST /api/credits/stake - Create stake hold for match
 * - POST /api/credits/release - Release stake hold (forfeit/cancel)
 * - POST /api/credits/settle/:matchId - Settle match stakes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count, gte, lte, sql } from 'drizzle-orm';

import { db, schema } from '../db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import {
  createStakeHold,
  releaseStakeHold,
  settleMatch,
  getMatchStakeAmount,
  canStake,
  type SettlementOutcome,
} from '../lib/staking';

const {
  creditAccounts,
  creditHolds,
  creditLedgerEntries,
  matches,
  challengeVersions,
  challenges,
} = schema;

// Query parameter schemas
const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z
    .enum([
      'purchase',
      'earn',
      'stake_hold',
      'stake_release',
      'transfer',
      'fee',
      'refund',
      'redemption',
    ])
    .optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const holdsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'released', 'consumed']).optional(),
});

const holdIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Helper to generate transaction description based on type and metadata
function getTransactionDescription(
  type: string,
  metadata: Record<string, unknown>,
  matchTitle?: string
): string {
  switch (type) {
    case 'purchase':
      return `Purchased ${metadata.credits || ''} credits`;
    case 'earn':
      return metadata.reason ? String(metadata.reason) : 'Credits earned';
    case 'stake_hold':
      return matchTitle ? `Stake held for "${matchTitle}"` : 'Stake held for match';
    case 'stake_release':
      return matchTitle ? `Stake released from "${matchTitle}"` : 'Stake released';
    case 'transfer':
      return metadata.note ? String(metadata.note) : 'Credit transfer';
    case 'fee':
      return metadata.feeType ? `${metadata.feeType} fee` : 'Platform fee';
    case 'refund':
      return metadata.reason ? String(metadata.reason) : 'Refund issued';
    case 'redemption':
      return metadata.item ? `Redeemed for ${metadata.item}` : 'Credits redeemed';
    default:
      return 'Credit transaction';
  }
}

export async function creditRoutes(app: FastifyInstance) {
  // Helper to get user ID from request (would come from auth in production)
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
   * GET /api/credits/balance
   * Returns the user's credit balance (available, reserved, total)
   */
  app.get('/api/credits/balance', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    // Get or create account for user
    const account = await getOrCreateCreditAccount(userId);

    const available = account.balanceAvailable;
    const reserved = account.balanceReserved;
    const total = available + reserved;

    return {
      data: {
        available,
        reserved,
        total,
      },
    };
  });

  /**
   * GET /api/credits/history
   * Returns paginated transaction history with optional filtering
   */
  app.get(
    '/api/credits/history',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            type: {
              type: 'string',
              enum: [
                'purchase',
                'earn',
                'stake_hold',
                'stake_release',
                'transfer',
                'fee',
                'refund',
                'redemption',
              ],
            },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
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
                    idempotencyKey: { type: 'string' },
                    accountId: { type: 'string' },
                    counterpartyAccountId: { type: ['string', 'null'] },
                    type: { type: 'string' },
                    amount: { type: 'number' },
                    matchId: { type: ['string', 'null'] },
                    metadataJson: { type: 'object' },
                    createdAt: { type: 'string' },
                    description: { type: 'string' },
                    match: {
                      type: ['object', 'null'],
                      properties: {
                        id: { type: 'string' },
                        challenge: {
                          type: 'object',
                          properties: {
                            title: { type: 'string' },
                            slug: { type: 'string' },
                          },
                        },
                      },
                    },
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

      const queryResult = historyQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', {
          issues: queryResult.error.issues,
        });
      }

      const { page, limit, type, startDate, endDate } = queryResult.data;
      const offset = (page - 1) * limit;

      // Get or create account for user
      const account = await getOrCreateCreditAccount(userId);

      // Build WHERE conditions
      const conditions = [eq(creditLedgerEntries.accountId, account.id)];

      if (type) {
        conditions.push(eq(creditLedgerEntries.type, type));
      }

      if (startDate) {
        conditions.push(gte(creditLedgerEntries.createdAt, new Date(startDate)));
      }

      if (endDate) {
        conditions.push(lte(creditLedgerEntries.createdAt, new Date(endDate)));
      }

      // Get total count
      const [countResult] = await db
        .select({ total: count() })
        .from(creditLedgerEntries)
        .where(and(...conditions));

      const total = countResult?.total ?? 0;

      // Get transactions with match details where applicable
      const transactions = await db
        .select({
          id: creditLedgerEntries.id,
          idempotencyKey: creditLedgerEntries.idempotencyKey,
          accountId: creditLedgerEntries.accountId,
          counterpartyAccountId: creditLedgerEntries.counterpartyAccountId,
          type: creditLedgerEntries.type,
          amount: creditLedgerEntries.amount,
          matchId: creditLedgerEntries.matchId,
          metadataJson: creditLedgerEntries.metadataJson,
          createdAt: creditLedgerEntries.createdAt,
        })
        .from(creditLedgerEntries)
        .where(and(...conditions))
        .orderBy(desc(creditLedgerEntries.createdAt))
        .limit(limit)
        .offset(offset);

      // Get match details for transactions with matchId
      const matchIds = transactions
        .map((t) => t.matchId)
        .filter((id): id is string => id !== null);

      let matchDetailsMap: Map<
        string,
        { id: string; challenge: { title: string; slug: string } }
      > = new Map();

      if (matchIds.length > 0) {
        const matchDetails = await db
          .select({
            matchId: matches.id,
            challengeTitle: challenges.title,
            challengeSlug: challenges.slug,
          })
          .from(matches)
          .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
          .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
          .where(sql`${matches.id} IN ${matchIds}`);

        for (const detail of matchDetails) {
          matchDetailsMap.set(detail.matchId, {
            id: detail.matchId,
            challenge: {
              title: detail.challengeTitle,
              slug: detail.challengeSlug,
            },
          });
        }
      }

      // Transform transactions with descriptions and match details
      const data = transactions.map((transaction) => {
        const matchDetail = transaction.matchId
          ? matchDetailsMap.get(transaction.matchId)
          : null;
        const metadata = (transaction.metadataJson || {}) as Record<string, unknown>;

        return {
          id: transaction.id,
          idempotencyKey: transaction.idempotencyKey,
          accountId: transaction.accountId,
          counterpartyAccountId: transaction.counterpartyAccountId,
          type: transaction.type,
          amount: transaction.amount,
          matchId: transaction.matchId,
          metadataJson: metadata,
          createdAt: transaction.createdAt.toISOString(),
          description: getTransactionDescription(
            transaction.type,
            metadata,
            matchDetail?.challenge.title
          ),
          match: matchDetail || null,
        };
      });

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
   * GET /api/credits/history/export
   * Export all transaction history as CSV
   */
  app.get('/api/credits/history/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    // Parse optional filters from query
    const queryResult = z.object({
      type: z.enum([
        'purchase',
        'earn',
        'stake_hold',
        'stake_release',
        'transfer',
        'fee',
        'refund',
        'redemption',
      ]).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      format: z.enum(['csv', 'json']).default('csv'),
    }).safeParse(request.query);

    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { type, startDate, endDate, format } = queryResult.data;

    // Get account for user
    const account = await getOrCreateCreditAccount(userId);

    // Build WHERE conditions
    const conditions = [eq(creditLedgerEntries.accountId, account.id)];

    if (type) {
      conditions.push(eq(creditLedgerEntries.type, type));
    }

    if (startDate) {
      conditions.push(gte(creditLedgerEntries.createdAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(creditLedgerEntries.createdAt, new Date(endDate)));
    }

    // Get all transactions (no limit for export)
    const transactions = await db
      .select({
        id: creditLedgerEntries.id,
        type: creditLedgerEntries.type,
        amount: creditLedgerEntries.amount,
        matchId: creditLedgerEntries.matchId,
        metadataJson: creditLedgerEntries.metadataJson,
        createdAt: creditLedgerEntries.createdAt,
      })
      .from(creditLedgerEntries)
      .where(and(...conditions))
      .orderBy(desc(creditLedgerEntries.createdAt));

    // Get match details for transactions with matchId
    const matchIds = transactions
      .map((t) => t.matchId)
      .filter((id): id is string => id !== null);

    let matchDetailsMap: Map<string, { title: string; slug: string }> = new Map();

    if (matchIds.length > 0) {
      const matchDetails = await db
        .select({
          matchId: matches.id,
          challengeTitle: challenges.title,
          challengeSlug: challenges.slug,
        })
        .from(matches)
        .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
        .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
        .where(sql`${matches.id} IN ${matchIds}`);

      for (const detail of matchDetails) {
        matchDetailsMap.set(detail.matchId, {
          title: detail.challengeTitle,
          slug: detail.challengeSlug,
        });
      }
    }

    // Transform transactions
    const exportData = transactions.map((transaction) => {
      const matchDetail = transaction.matchId
        ? matchDetailsMap.get(transaction.matchId)
        : null;
      const metadata = (transaction.metadataJson || {}) as Record<string, unknown>;

      return {
        id: transaction.id,
        date: transaction.createdAt.toISOString(),
        type: transaction.type,
        amount: transaction.amount,
        description: getTransactionDescription(
          transaction.type,
          metadata,
          matchDetail?.title
        ),
        matchId: transaction.matchId || '',
        challenge: matchDetail?.title || '',
      };
    });

    if (format === 'json') {
      reply.header('Content-Type', 'application/json');
      reply.header(
        'Content-Disposition',
        `attachment; filename="reporivals-transactions-${new Date().toISOString().split('T')[0]}.json"`
      );
      return { transactions: exportData };
    }

    // CSV format
    const csvHeaders = ['ID', 'Date', 'Type', 'Amount', 'Description', 'Match ID', 'Challenge'];
    const csvRows = exportData.map((t) => [
      t.id,
      t.date,
      t.type,
      String(t.amount),
      `"${t.description.replace(/"/g, '""')}"`,
      t.matchId,
      `"${t.challenge.replace(/"/g, '""')}"`,
    ].join(','));

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header(
      'Content-Disposition',
      `attachment; filename="reporivals-transactions-${new Date().toISOString().split('T')[0]}.csv"`
    );

    return csvContent;
  });

  /**
   * GET /api/credits/holds
   * Returns paginated list of credit holds with match details
   */
  app.get(
    '/api/credits/holds',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            status: { type: 'string', enum: ['active', 'released', 'consumed'] },
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
                    accountId: { type: 'string' },
                    matchId: { type: 'string' },
                    amountReserved: { type: 'number' },
                    status: { type: 'string' },
                    createdAt: { type: 'string' },
                    releasedAt: { type: ['string', 'null'] },
                    match: {
                      type: ['object', 'null'],
                      properties: {
                        id: { type: 'string' },
                        status: { type: 'string' },
                        challenge: {
                          type: 'object',
                          properties: {
                            title: { type: 'string' },
                            slug: { type: 'string' },
                          },
                        },
                      },
                    },
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

      const queryResult = holdsQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', {
          issues: queryResult.error.issues,
        });
      }

      const { page, limit, status } = queryResult.data;
      const offset = (page - 1) * limit;

      // Get account for user
      const account = await getOrCreateCreditAccount(userId);

      // Build WHERE conditions
      const conditions = [eq(creditHolds.accountId, account.id)];

      if (status) {
        conditions.push(eq(creditHolds.status, status));
      }

      // Get total count
      const [countResult] = await db
        .select({ total: count() })
        .from(creditHolds)
        .where(and(...conditions));

      const total = countResult?.total ?? 0;

      // Get holds with match and challenge details
      const holds = await db
        .select({
          id: creditHolds.id,
          accountId: creditHolds.accountId,
          matchId: creditHolds.matchId,
          amountReserved: creditHolds.amountReserved,
          status: creditHolds.status,
          createdAt: creditHolds.createdAt,
          releasedAt: creditHolds.releasedAt,
          matchStatus: matches.status,
          challengeTitle: challenges.title,
          challengeSlug: challenges.slug,
        })
        .from(creditHolds)
        .innerJoin(matches, eq(creditHolds.matchId, matches.id))
        .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
        .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
        .where(and(...conditions))
        .orderBy(desc(creditHolds.createdAt))
        .limit(limit)
        .offset(offset);

      // Transform to expected format
      const data = holds.map((hold) => ({
        id: hold.id,
        accountId: hold.accountId,
        matchId: hold.matchId,
        amountReserved: hold.amountReserved,
        status: hold.status,
        createdAt: hold.createdAt.toISOString(),
        releasedAt: hold.releasedAt?.toISOString() || null,
        match: {
          id: hold.matchId,
          status: hold.matchStatus,
          challenge: {
            title: hold.challengeTitle,
            slug: hold.challengeSlug,
          },
        },
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
   * GET /api/credits/holds/:id
   * Returns details of a specific credit hold
   */
  app.get(
    '/api/credits/holds/:id',
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
                  accountId: { type: 'string' },
                  matchId: { type: 'string' },
                  amountReserved: { type: 'number' },
                  status: { type: 'string' },
                  createdAt: { type: 'string' },
                  releasedAt: { type: ['string', 'null'] },
                  match: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      status: { type: 'string' },
                      challenge: {
                        type: 'object',
                        properties: {
                          title: { type: 'string' },
                          slug: { type: 'string' },
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
      const userId = getUserId(request);

      const paramResult = holdIdParamSchema.safeParse(request.params);

      if (!paramResult.success) {
        throw new ValidationError('Invalid hold ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id: holdId } = paramResult.data;

      // Get account for user
      const account = await getOrCreateCreditAccount(userId);

      // Get hold with match details
      const [hold] = await db
        .select({
          id: creditHolds.id,
          accountId: creditHolds.accountId,
          matchId: creditHolds.matchId,
          amountReserved: creditHolds.amountReserved,
          status: creditHolds.status,
          createdAt: creditHolds.createdAt,
          releasedAt: creditHolds.releasedAt,
          matchStatus: matches.status,
          challengeTitle: challenges.title,
          challengeSlug: challenges.slug,
        })
        .from(creditHolds)
        .innerJoin(matches, eq(creditHolds.matchId, matches.id))
        .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
        .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
        .where(and(eq(creditHolds.id, holdId), eq(creditHolds.accountId, account.id)));

      if (!hold) {
        throw new NotFoundError('Credit Hold', holdId);
      }

      return {
        data: {
          id: hold.id,
          accountId: hold.accountId,
          matchId: hold.matchId,
          amountReserved: hold.amountReserved,
          status: hold.status,
          createdAt: hold.createdAt.toISOString(),
          releasedAt: hold.releasedAt?.toISOString() || null,
          match: {
            id: hold.matchId,
            status: hold.matchStatus,
            challenge: {
              title: hold.challengeTitle,
              slug: hold.challengeSlug,
            },
          },
        },
      };
    }
  );

  /**
   * GET /api/credits/summary
   * Returns a summary of credit activity for the user
   */
  app.get(
    '/api/credits/summary',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  balance: {
                    type: 'object',
                    properties: {
                      available: { type: 'number' },
                      reserved: { type: 'number' },
                      total: { type: 'number' },
                    },
                  },
                  activeHolds: { type: 'number' },
                  totalTransactions: { type: 'number' },
                  totalEarned: { type: 'number' },
                  totalSpent: { type: 'number' },
                  recentTransactions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        type: { type: 'string' },
                        amount: { type: 'number' },
                        createdAt: { type: 'string' },
                        description: { type: 'string' },
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
      const userId = getUserId(request);

      // Get or create account for user
      const account = await getOrCreateCreditAccount(userId);

      // Get balance
      const available = account.balanceAvailable;
      const reserved = account.balanceReserved;
      const total = available + reserved;

      // Get active holds count
      const [activeHoldsResult] = await db
        .select({ total: count() })
        .from(creditHolds)
        .where(
          and(eq(creditHolds.accountId, account.id), eq(creditHolds.status, 'active'))
        );

      const activeHolds = activeHoldsResult?.total ?? 0;

      // Get total transactions count
      const [totalTransactionsResult] = await db
        .select({ total: count() })
        .from(creditLedgerEntries)
        .where(eq(creditLedgerEntries.accountId, account.id));

      const totalTransactions = totalTransactionsResult?.total ?? 0;

      // Get total earned (positive transactions)
      const [totalEarnedResult] = await db
        .select({ total: sql<number>`COALESCE(SUM(${creditLedgerEntries.amount}), 0)` })
        .from(creditLedgerEntries)
        .where(
          and(
            eq(creditLedgerEntries.accountId, account.id),
            sql`${creditLedgerEntries.amount} > 0`
          )
        );

      const totalEarned = Number(totalEarnedResult?.total ?? 0);

      // Get total spent (negative transactions as positive number)
      const [totalSpentResult] = await db
        .select({ total: sql<number>`COALESCE(ABS(SUM(${creditLedgerEntries.amount})), 0)` })
        .from(creditLedgerEntries)
        .where(
          and(
            eq(creditLedgerEntries.accountId, account.id),
            sql`${creditLedgerEntries.amount} < 0`
          )
        );

      const totalSpent = Number(totalSpentResult?.total ?? 0);

      // Get recent transactions (last 5)
      const recentTransactions = await db
        .select({
          id: creditLedgerEntries.id,
          type: creditLedgerEntries.type,
          amount: creditLedgerEntries.amount,
          metadataJson: creditLedgerEntries.metadataJson,
          createdAt: creditLedgerEntries.createdAt,
        })
        .from(creditLedgerEntries)
        .where(eq(creditLedgerEntries.accountId, account.id))
        .orderBy(desc(creditLedgerEntries.createdAt))
        .limit(5);

      return {
        data: {
          balance: {
            available,
            reserved,
            total,
          },
          activeHolds,
          totalTransactions,
          totalEarned,
          totalSpent,
          recentTransactions: recentTransactions.map((t) => ({
            id: t.id,
            type: t.type,
            amount: t.amount,
            createdAt: t.createdAt.toISOString(),
            description: getTransactionDescription(
              t.type,
              (t.metadataJson || {}) as Record<string, unknown>
            ),
          })),
        },
      };
    }
  );

  // Staking request schemas
  const stakeRequestSchema = z.object({
    matchId: z.string().uuid(),
    amount: z.number().int().positive().optional(), // Optional, can use default
  });

  const releaseRequestSchema = z.object({
    matchId: z.string().uuid(),
    reason: z.enum(['forfeit', 'cancelled']).default('forfeit'),
  });

  const settleRequestSchema = z.object({
    outcome: z.enum(['winner_a', 'winner_b', 'tie', 'cancelled']),
  });

  /**
   * POST /api/credits/stake
   * Create a stake hold for a match
   */
  app.post('/api/credits/stake', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const parseResult = stakeRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: parseResult.error.issues,
      });
    }

    const { matchId, amount: requestedAmount } = parseResult.data;

    // Get stake amount (from config or use requested)
    const stakeAmount = requestedAmount || await getMatchStakeAmount(matchId);

    // Check if user can stake
    const hasBalance = await canStake(userId, stakeAmount);
    if (!hasBalance) {
      return reply.status(400).send({
        error: 'insufficient_balance',
        errorDescription: 'Insufficient available balance for stake',
      });
    }

    try {
      const result = await createStakeHold(userId, matchId, stakeAmount);

      return reply.status(201).send({
        data: {
          holdId: result.holdId,
          amount: result.amount,
          idempotencyKey: result.idempotencyKey,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stake creation failed';
      return reply.status(400).send({
        error: 'stake_failed',
        errorDescription: message,
      });
    }
  });

  /**
   * POST /api/credits/release
   * Release a stake hold (forfeit/cancel)
   */
  app.post('/api/credits/release', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const parseResult = releaseRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: parseResult.error.issues,
      });
    }

    const { matchId, reason } = parseResult.data;

    try {
      const result = await releaseStakeHold(userId, matchId, reason);

      if (!result) {
        return reply.status(404).send({
          error: 'not_found',
          errorDescription: 'No active stake hold found for this match',
        });
      }

      return reply.status(200).send({
        data: {
          holdId: result.holdId,
          amountReleased: result.amountReleased,
          idempotencyKey: result.idempotencyKey,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Release failed';
      return reply.status(400).send({
        error: 'release_failed',
        errorDescription: message,
      });
    }
  });

  /**
   * POST /api/credits/settle/:matchId
   * Settle match stakes (admin/system endpoint)
   */
  app.post('/api/credits/settle/:matchId', async (request: FastifyRequest, reply: FastifyReply) => {
    // In production, this would require admin authentication
    // For now, we'll use x-user-id header for basic auth check
    const userId = getUserId(request);

    const { matchId } = request.params as { matchId: string };

    // Validate matchId
    if (!matchId || !/^[0-9a-f-]{36}$/i.test(matchId)) {
      throw new ValidationError('Invalid match ID');
    }

    const parseResult = settleRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: parseResult.error.issues,
      });
    }

    const { outcome } = parseResult.data;

    try {
      const result = await settleMatch(matchId, outcome as SettlementOutcome);

      return reply.status(200).send({
        data: {
          matchId: result.matchId,
          outcome: result.outcome,
          winnerId: result.winnerId,
          distributions: result.distributions,
          platformFee: result.platformFee,
          idempotencyKey: result.idempotencyKey,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Settlement failed';
      return reply.status(400).send({
        error: 'settlement_failed',
        errorDescription: message,
      });
    }
  });

  /**
   * GET /api/credits/can-stake
   * Check if user can stake a specific amount
   */
  app.get('/api/credits/can-stake', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);
    const { amount, matchId } = request.query as { amount?: string; matchId?: string };

    let stakeAmount: number;

    if (amount) {
      stakeAmount = parseInt(amount, 10);
      if (isNaN(stakeAmount) || stakeAmount <= 0) {
        throw new ValidationError('Invalid amount');
      }
    } else if (matchId) {
      stakeAmount = await getMatchStakeAmount(matchId);
    } else {
      throw new ValidationError('Either amount or matchId required');
    }

    const hasBalance = await canStake(userId, stakeAmount);
    const account = await getOrCreateCreditAccount(userId);

    return reply.status(200).send({
      data: {
        canStake: hasBalance,
        requiredAmount: stakeAmount,
        availableBalance: account.balanceAvailable,
        shortfall: hasBalance ? 0 : stakeAmount - account.balanceAvailable,
      },
    });
  });
}
