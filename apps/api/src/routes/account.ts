/**
 * Account Routes
 *
 * Implements GDPR-compliant account management:
 * - Data export (all user data as JSON)
 * - Account deletion with 30-day grace period
 * - Account recovery (cancel deletion)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, or, ilike, desc, sql, count, avg, sum } from 'drizzle-orm';

import { db } from '../db';
import {
  users,
  oauthAccounts,
  sessions,
} from '../db/schema/users';
import {
  creditAccounts,
  creditLedgerEntries,
  purchases,
} from '../db/schema/credits';
import { rankings, seasons } from '../db/schema/rankings';
import { matchParticipants, matches } from '../db/schema/matches';
import { submissions } from '../db/schema/submissions';
import { scores } from '../db/schema/judging';
import { tournamentRegistrations, prizeClaims } from '../db/schema/tournaments';
import { rewardRedemptions } from '../db/schema/rewards';
import { challenges, challengeVersions } from '../db/schema/challenges';

import {
  verifyAccessToken,
  extractAccessToken,
  revokeAllSessions,
} from '../lib/session';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../lib/errors';

// Constants
const DELETION_GRACE_PERIOD_DAYS = 30;

// Request schemas
const cancelDeletionSchema = z.object({
  confirm: z.literal(true),
});

const requestDeletionSchema = z.object({
  confirmText: z.string().refine((val) => val === 'DELETE MY ACCOUNT', {
    message: 'You must type "DELETE MY ACCOUNT" to confirm',
  }),
});

// Helper to get authenticated user ID
async function getAuthenticatedUserId(
  app: FastifyInstance,
  request: FastifyRequest
): Promise<string> {
  const token = extractAccessToken(request);
  if (!token) {
    throw new ForbiddenError('Authentication required');
  }

  const payload = await verifyAccessToken(app, token);
  if (!payload) {
    throw new ForbiddenError('Invalid or expired access token');
  }

  return payload.sub;
}

export async function accountRoutes(app: FastifyInstance) {
  /**
   * GET /api/users/me/export
   * Export all user data as JSON (GDPR data portability)
   */
  app.get('/api/users/me/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await getAuthenticatedUserId(app, request);

    // Fetch user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (user.deletedAt) {
      throw new ForbiddenError('Account has been deleted');
    }

    // Fetch all related data
    const [
      oauthAccountsData,
      sessionsData,
      creditAccountData,
      creditLedgerData,
      purchasesData,
      rankingsData,
      matchParticipationsData,
      submissionsData,
      tournamentRegsData,
      prizeClaimsData,
      redemptionsData,
    ] = await Promise.all([
      // OAuth accounts (excluding encrypted tokens)
      db
        .select({
          id: oauthAccounts.id,
          provider: oauthAccounts.provider,
          providerUserId: oauthAccounts.providerUserId,
          scopes: oauthAccounts.scopes,
          createdAt: oauthAccounts.createdAt,
        })
        .from(oauthAccounts)
        .where(eq(oauthAccounts.userId, userId)),

      // Sessions (excluding token hashes for security)
      db
        .select({
          id: sessions.id,
          deviceName: sessions.deviceName,
          deviceType: sessions.deviceType,
          lastUsedAt: sessions.lastUsedAt,
          createdAt: sessions.createdAt,
          revokedAt: sessions.revokedAt,
        })
        .from(sessions)
        .where(eq(sessions.userId, userId)),

      // Credit account
      db
        .select()
        .from(creditAccounts)
        .where(eq(creditAccounts.userId, userId)),

      // Credit ledger (transaction history)
      db
        .select({
          id: creditLedgerEntries.id,
          type: creditLedgerEntries.type,
          amount: creditLedgerEntries.amount,
          matchId: creditLedgerEntries.matchId,
          metadataJson: creditLedgerEntries.metadataJson,
          createdAt: creditLedgerEntries.createdAt,
        })
        .from(creditLedgerEntries)
        .innerJoin(creditAccounts, eq(creditLedgerEntries.accountId, creditAccounts.id))
        .where(eq(creditAccounts.userId, userId)),

      // Purchases
      db
        .select({
          id: purchases.id,
          amountFiat: purchases.amountFiat,
          currency: purchases.currency,
          creditsIssued: purchases.creditsIssued,
          status: purchases.status,
          createdAt: purchases.createdAt,
        })
        .from(purchases)
        .where(eq(purchases.userId, userId)),

      // Rankings
      db
        .select()
        .from(rankings)
        .where(eq(rankings.userId, userId)),

      // Match participations
      db
        .select({
          id: matchParticipants.id,
          matchId: matchParticipants.matchId,
          seat: matchParticipants.seat,
          joinedAt: matchParticipants.joinedAt,
          readyAt: matchParticipants.readyAt,
          forfeitAt: matchParticipants.forfeitAt,
        })
        .from(matchParticipants)
        .where(eq(matchParticipants.userId, userId)),

      // Submissions
      db
        .select({
          id: submissions.id,
          matchId: submissions.matchId,
          storagePath: submissions.storagePath,
          sizeBytes: submissions.sizeBytes,
          uploadedAt: submissions.uploadedAt,
          status: submissions.status,
        })
        .from(submissions)
        .where(eq(submissions.uploadedBy, userId)),

      // Tournament registrations
      db
        .select()
        .from(tournamentRegistrations)
        .where(eq(tournamentRegistrations.userId, userId)),

      // Prize claims
      db
        .select({
          id: prizeClaims.id,
          tournamentId: prizeClaims.tournamentId,
          prizeType: prizeClaims.prizeType,
          amountOrBundleRef: prizeClaims.amountOrBundleRef,
          placement: prizeClaims.placement,
          status: prizeClaims.status,
          createdAt: prizeClaims.createdAt,
          fulfilledAt: prizeClaims.fulfilledAt,
        })
        .from(prizeClaims)
        .where(eq(prizeClaims.userId, userId)),

      // Reward redemptions
      db
        .select()
        .from(rewardRedemptions)
        .where(eq(rewardRedemptions.userId, userId)),
    ]);

    // Build the export object
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        roles: user.roles,
        isVerified: user.isVerified,
        preferences: user.preferences,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
      oauthAccounts: oauthAccountsData,
      sessions: sessionsData,
      credits: {
        account: creditAccountData[0] || null,
        transactions: creditLedgerData,
        purchases: purchasesData,
      },
      rankings: rankingsData,
      matches: {
        participations: matchParticipationsData,
        submissions: submissionsData,
      },
      tournaments: {
        registrations: tournamentRegsData,
        prizeClaims: prizeClaimsData,
      },
      rewards: {
        redemptions: redemptionsData,
      },
    };

    // Set headers for download
    reply.header('Content-Type', 'application/json');
    reply.header(
      'Content-Disposition',
      `attachment; filename="repoarrivals-data-export-${user.id}-${new Date().toISOString().split('T')[0]}.json"`
    );

    return exportData;
  });

  /**
   * DELETE /api/users/me
   * Request account deletion (30-day soft delete)
   */
  app.delete('/api/users/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await getAuthenticatedUserId(app, request);

    // Validate confirmation
    const bodyResult = requestDeletionSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('You must confirm deletion by typing "DELETE MY ACCOUNT"', {
        issues: bodyResult.error.issues,
      });
    }

    // Fetch user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (user.deletedAt) {
      throw new ConflictError('Account already deleted');
    }

    if (user.deletionRequestedAt) {
      throw new ConflictError('Deletion already requested');
    }

    // Calculate deletion date (30 days from now)
    const deletionScheduledAt = new Date();
    deletionScheduledAt.setDate(deletionScheduledAt.getDate() + DELETION_GRACE_PERIOD_DAYS);

    // Update user with deletion request
    await db
      .update(users)
      .set({
        deletionRequestedAt: new Date(),
        deletionScheduledAt,
      })
      .where(eq(users.id, userId));

    // Revoke all sessions
    await revokeAllSessions(userId);

    return reply.status(200).send({
      message: 'Account deletion scheduled',
      deletionScheduledAt: deletionScheduledAt.toISOString(),
      gracePeriodDays: DELETION_GRACE_PERIOD_DAYS,
      canCancelUntil: deletionScheduledAt.toISOString(),
    });
  });

  /**
   * GET /api/users/me/deletion-status
   * Check account deletion status
   */
  app.get('/api/users/me/deletion-status', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await getAuthenticatedUserId(app, request);

    const [user] = await db
      .select({
        deletionRequestedAt: users.deletionRequestedAt,
        deletionScheduledAt: users.deletionScheduledAt,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (user.deletedAt) {
      return reply.status(410).send({
        status: 'deleted',
        deletedAt: user.deletedAt,
      });
    }

    if (user.deletionRequestedAt && user.deletionScheduledAt) {
      const daysRemaining = Math.ceil(
        (user.deletionScheduledAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      return reply.status(200).send({
        status: 'pending_deletion',
        deletionRequestedAt: user.deletionRequestedAt,
        deletionScheduledAt: user.deletionScheduledAt,
        daysRemaining: Math.max(0, daysRemaining),
        canCancel: daysRemaining > 0,
      });
    }

    return reply.status(200).send({
      status: 'active',
      deletionRequestedAt: null,
      deletionScheduledAt: null,
    });
  });

  /**
   * POST /api/users/me/cancel-deletion
   * Cancel a pending account deletion
   */
  app.post('/api/users/me/cancel-deletion', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await getAuthenticatedUserId(app, request);

    const bodyResult = cancelDeletionSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Must confirm cancellation', {
        issues: bodyResult.error.issues,
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (user.deletedAt) {
      throw new ConflictError('Account already deleted and cannot be recovered');
    }

    if (!user.deletionRequestedAt) {
      throw new ConflictError('No deletion request to cancel');
    }

    // Clear deletion request
    await db
      .update(users)
      .set({
        deletionRequestedAt: null,
        deletionScheduledAt: null,
      })
      .where(eq(users.id, userId));

    return reply.status(200).send({
      message: 'Account deletion cancelled',
      status: 'active',
    });
  });

  /**
   * PATCH /api/users/me
   * Update user profile
   */
  app.patch('/api/users/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await getAuthenticatedUserId(app, request);

    const updateSchema = z.object({
      displayName: z.string().min(2).max(100).optional(),
      avatarUrl: z.string().url().max(500).optional(),
      preferences: z.record(z.unknown()).optional(),
    });

    const bodyResult = updateSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid update data', {
        issues: bodyResult.error.issues,
      });
    }

    const updateData = bodyResult.data;

    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('No fields to update');
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (user.deletedAt) {
      throw new ForbiddenError('Account has been deleted');
    }

    // Update user
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    return reply.status(200).send({
      id: updatedUser.id,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      avatarUrl: updatedUser.avatarUrl,
      preferences: updatedUser.preferences,
    });
  });

  /**
   * GET /api/users/:username/profile
   * Public user profile endpoint - returns user info, stats, ranking, and badges
   */
  app.get<{ Params: { username: string } }>(
    '/api/users/:username/profile',
    async (request: FastifyRequest<{ Params: { username: string } }>, reply: FastifyReply) => {
      const { username } = request.params;

      // Check if username is a valid UUID format
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(username);

      // Find user by displayName (case-insensitive) or by ID (only if valid UUID)
      // Note: Select only columns that exist in the database
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
          roles: users.roles,
          isBanned: users.isBanned,
          isVerified: users.isVerified,
          preferences: users.preferences,
        })
        .from(users)
        .where(
          isValidUUID
            ? or(ilike(users.displayName, username), eq(users.id, username))
            : ilike(users.displayName, username)
        )
        .limit(1);

      if (!user || user.isBanned) {
        throw new NotFoundError('User', username);
      }

      // Get user's ranking for current season
      const [currentSeason] = await db
        .select()
        .from(seasons)
        .where(
          and(
            sql`${seasons.startAt} <= NOW()`,
            sql`${seasons.endAt} >= NOW()`
          )
        )
        .limit(1);

      let userRanking = null;
      if (currentSeason) {
        const [ranking] = await db
          .select()
          .from(rankings)
          .where(
            and(
              eq(rankings.userId, user.id),
              eq(rankings.seasonId, currentSeason.id)
            )
          );

        if (ranking) {
          // Calculate rank position
          const rankPosition = await db
            .select({ count: count() })
            .from(rankings)
            .where(
              and(
                eq(rankings.seasonId, currentSeason.id),
                sql`${rankings.rating} > ${ranking.rating}`
              )
            );

          const totalRanked = await db
            .select({ count: count() })
            .from(rankings)
            .where(eq(rankings.seasonId, currentSeason.id));

          const rank = (rankPosition[0]?.count || 0) + 1;
          const percentile = totalRanked[0]?.count
            ? Math.round((1 - rank / totalRanked[0].count) * 100)
            : 0;

          userRanking = {
            id: ranking.id,
            seasonId: currentSeason.id,
            seasonName: currentSeason.name,
            rating: ranking.rating,
            deviation: ranking.deviation,
            volatility: ranking.volatility,
            rank,
            percentile,
            updatedAt: ranking.updatedAt?.toISOString() || new Date().toISOString(),
          };
        }
      }

      // Get user's match statistics
      const userParticipations = await db
        .select({
          matchId: matchParticipants.matchId,
          matchStatus: matches.status,
          category: challenges.category,
        })
        .from(matchParticipants)
        .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
        .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
        .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
        .where(eq(matchParticipants.userId, user.id));

      // Get scores for the user
      const userScores = await db
        .select({
          matchId: scores.matchId,
          totalScore: scores.totalScore,
        })
        .from(scores)
        .where(eq(scores.userId, user.id));

      const scoreMap = new Map(userScores.map(s => [s.matchId, s.totalScore]));

      // For each finalized match, determine win/loss/draw
      let wins = 0;
      let losses = 0;
      let draws = 0;
      let totalScore = 0;
      let scoredMatches = 0;
      const categoryStats: Record<string, { played: number; wins: number; losses: number; draws: number; totalScore: number; scoredMatches: number }> = {};

      for (const participation of userParticipations) {
        if (participation.matchStatus !== 'finalized') continue;

        const userScore = scoreMap.get(participation.matchId);
        if (userScore === undefined) continue;

        // Get opponent's score
        const [opponentScore] = await db
          .select({ totalScore: scores.totalScore })
          .from(scores)
          .where(
            and(
              eq(scores.matchId, participation.matchId),
              sql`${scores.userId} != ${user.id}`
            )
          );

        const oppScore = opponentScore?.totalScore ?? 0;

        // Initialize category stats
        const cat = participation.category || 'unknown';
        if (!categoryStats[cat]) {
          categoryStats[cat] = { played: 0, wins: 0, losses: 0, draws: 0, totalScore: 0, scoredMatches: 0 };
        }

        categoryStats[cat].played++;
        categoryStats[cat].totalScore += userScore;
        categoryStats[cat].scoredMatches++;
        totalScore += userScore;
        scoredMatches++;

        if (userScore > oppScore) {
          wins++;
          categoryStats[cat].wins++;
        } else if (userScore < oppScore) {
          losses++;
          categoryStats[cat].losses++;
        } else {
          draws++;
          categoryStats[cat].draws++;
        }
      }

      const totalMatches = wins + losses + draws;
      const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
      const averageScore = scoredMatches > 0 ? Math.round(totalScore / scoredMatches) : 0;

      // Build category stats array
      const byCategory = Object.entries(categoryStats).map(([category, stats]) => ({
        category,
        matchesPlayed: stats.played,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        winRate: stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0,
        averageScore: stats.scoredMatches > 0 ? Math.round(stats.totalScore / stats.scoredMatches) : 0,
      }));

      const userStats = {
        totalMatches,
        wins,
        losses,
        draws,
        winRate,
        currentStreak: 0, // TODO: Calculate streaks
        bestStreak: 0,
        averageScore,
        byCategory,
      };

      // Build user badges (placeholder - could be expanded)
      const badges: Array<{ id: string; name: string; description: string; icon: string; earnedAt: string }> = [];

      // Award badges based on achievements
      if (totalMatches >= 10) {
        badges.push({
          id: 'competitor',
          name: 'Competitor',
          description: 'Participated in 10+ matches',
          icon: '🎯',
          earnedAt: new Date().toISOString(),
        });
      }
      if (wins >= 5) {
        badges.push({
          id: 'winner',
          name: 'Winner',
          description: 'Won 5+ matches',
          icon: '🏆',
          earnedAt: new Date().toISOString(),
        });
      }
      if (winRate >= 70 && totalMatches >= 5) {
        badges.push({
          id: 'champion',
          name: 'Champion',
          description: 'Maintained 70%+ win rate over 5+ matches',
          icon: '👑',
          earnedAt: new Date().toISOString(),
        });
      }

      // Build profile response
      const profile = {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() || null,
          roles: user.roles || ['user'],
          isBanned: user.isBanned,
          isVerified: user.isVerified,
          preferences: user.preferences || { publicArtifacts: false, emailNotifications: true },
        },
        ranking: userRanking,
        stats: userStats,
        badges,
        recentMatches: [], // Will be fetched separately via /api/users/:username/matches
      };

      return reply.status(200).send({ data: profile });
    }
  );

  /**
   * GET /api/users/:username/matches
   * Get user's match history
   */
  app.get<{ Params: { username: string }; Querystring: { page?: string; limit?: string } }>(
    '/api/users/:username/matches',
    async (
      request: FastifyRequest<{ Params: { username: string }; Querystring: { page?: string; limit?: string } }>,
      reply: FastifyReply
    ) => {
      const { username } = request.params;
      const page = parseInt(request.query.page || '1', 10);
      const limit = Math.min(parseInt(request.query.limit || '10', 10), 50);
      const offset = (page - 1) * limit;

      // Check if username is a valid UUID format
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(username);

      // Find user (select only existing columns)
      const [user] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          isBanned: users.isBanned,
        })
        .from(users)
        .where(
          isValidUUID
            ? or(ilike(users.displayName, username), eq(users.id, username))
            : ilike(users.displayName, username)
        )
        .limit(1);

      if (!user || user.isBanned) {
        throw new NotFoundError('User', username);
      }

      // Get user's matches with details
      const userMatches = await db
        .select({
          matchId: matches.id,
          status: matches.status,
          mode: matches.mode,
          startAt: matches.startAt,
          endAt: matches.endAt,
          createdAt: matches.createdAt,
          challengeTitle: challenges.title,
          challengeCategory: challenges.category,
          challengeSlug: challenges.slug,
        })
        .from(matchParticipants)
        .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
        .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
        .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
        .where(eq(matchParticipants.userId, user.id))
        .orderBy(desc(matches.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ totalCount }] = await db
        .select({ totalCount: count() })
        .from(matchParticipants)
        .where(eq(matchParticipants.userId, user.id));

      // Enrich matches with opponent info and scores
      const enrichedMatches = await Promise.all(
        userMatches.map(async (match) => {
          // Get opponent
          const [opponent] = await db
            .select({
              id: users.id,
              displayName: users.displayName,
              avatarUrl: users.avatarUrl,
            })
            .from(matchParticipants)
            .innerJoin(users, eq(matchParticipants.userId, users.id))
            .where(
              and(
                eq(matchParticipants.matchId, match.matchId),
                sql`${matchParticipants.userId} != ${user.id}`
              )
            );

          // Get scores if finalized
          let userScore = null;
          let opponentScore = null;
          let result: 'win' | 'loss' | 'draw' | 'pending' = 'pending';

          if (match.status === 'finalized') {
            const matchScores = await db
              .select({
                userId: scores.userId,
                totalScore: scores.totalScore,
              })
              .from(scores)
              .where(eq(scores.matchId, match.matchId));

            for (const score of matchScores) {
              if (score.userId === user.id) {
                userScore = score.totalScore;
              } else {
                opponentScore = score.totalScore;
              }
            }

            if (userScore !== null && opponentScore !== null) {
              if (userScore > opponentScore) result = 'win';
              else if (userScore < opponentScore) result = 'loss';
              else result = 'draw';
            }
          }

          return {
            id: match.matchId,
            status: match.status,
            mode: match.mode,
            challenge: {
              title: match.challengeTitle,
              category: match.challengeCategory,
              slug: match.challengeSlug,
            },
            opponent: opponent || null,
            userScore,
            opponentScore,
            result,
            startAt: match.startAt?.toISOString() || null,
            endAt: match.endAt?.toISOString() || null,
            createdAt: match.createdAt?.toISOString() || new Date().toISOString(),
          };
        })
      );

      return reply.status(200).send({
        data: enrichedMatches,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
    }
  );
}
