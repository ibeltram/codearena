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
import { eq, and } from 'drizzle-orm';

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
import { rankings } from '../db/schema/rankings';
import { matchParticipants, matches } from '../db/schema/matches';
import { submissions } from '../db/schema/submissions';
import { tournamentRegistrations, prizeClaims } from '../db/schema/tournaments';
import { rewardRedemptions } from '../db/schema/rewards';

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
}
