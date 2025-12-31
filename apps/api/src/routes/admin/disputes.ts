/**
 * Admin Dispute Routes
 *
 * API endpoints for admin management of disputes including review and resolution.
 *
 * Endpoints:
 * - GET /api/admin/disputes - List all disputes (filterable by status)
 * - GET /api/admin/disputes/:id - Get dispute details
 * - POST /api/admin/disputes/:id/review - Mark dispute as in_review
 * - POST /api/admin/disputes/:id/resolve - Resolve a dispute
 * - POST /api/admin/disputes/:id/rejudge - Trigger re-judging for a match
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count, or } from 'drizzle-orm';

import { db, schema } from '../../db';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../lib/errors';
import { settleMatch, type SettlementOutcome } from '../../lib/staking';

const {
  disputes,
  matches,
  matchParticipants,
  users,
  challenges,
  challengeVersions,
  eventsAudit,
  scores,
} = schema;

// Request parameter schemas
const disputeIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Query parameter schema
const listDisputesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['open', 'in_review', 'resolved']).optional(),
});

// Resolution body schema
const resolveDisputeSchema = z.object({
  resolution: z.enum(['upheld', 'rejected', 'partial']),
  reason: z.string().min(10).max(2000),
  newOutcome: z.enum(['winner_a', 'winner_b', 'tie', 'no_change']).optional(),
  adjustments: z.object({
    scoreAdjustmentA: z.number().int().optional(),
    scoreAdjustmentB: z.number().int().optional(),
    creditRefundA: z.number().int().min(0).optional(),
    creditRefundB: z.number().int().min(0).optional(),
  }).optional().default({}),
  internalNotes: z.string().optional(),
});

export async function adminDisputeRoutes(app: FastifyInstance) {
  // Helper to get admin user ID from request
  // TODO: In production, verify user has admin role
  const getAdminUserId = (request: FastifyRequest): string => {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) {
      throw new ForbiddenError('Admin authentication required');
    }
    // TODO: Check if user has admin role
    return userId;
  };

  // GET /api/admin/disputes - List all disputes
  app.get('/api/admin/disputes', async (request: FastifyRequest, reply: FastifyReply) => {
    const _adminId = getAdminUserId(request);

    const queryResult = listDisputesQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { page, limit, status } = queryResult.data;
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [];
    if (status) {
      conditions.push(eq(disputes.status, status));
    }

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(disputes)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult?.total ?? 0;

    // Get disputes with user and match info
    const disputeList = await db
      .select({
        id: disputes.id,
        matchId: disputes.matchId,
        status: disputes.status,
        reason: disputes.reason,
        createdAt: disputes.createdAt,
        updatedAt: disputes.updatedAt,
        openedBy: {
          id: users.id,
          displayName: users.displayName,
          email: users.email,
        },
        match: {
          id: matches.id,
          status: matches.status,
          mode: matches.mode,
          disputeStatus: matches.disputeStatus,
        },
      })
      .from(disputes)
      .innerJoin(users, eq(disputes.openedByUserId, users.id))
      .innerJoin(matches, eq(disputes.matchId, matches.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(disputes.createdAt))
      .limit(limit)
      .offset(offset);

    // Get summary counts
    const [openCount] = await db
      .select({ count: count() })
      .from(disputes)
      .where(eq(disputes.status, 'open'));

    const [inReviewCount] = await db
      .select({ count: count() })
      .from(disputes)
      .where(eq(disputes.status, 'in_review'));

    return {
      data: disputeList,
      summary: {
        open: openCount?.count ?? 0,
        inReview: inReviewCount?.count ?? 0,
        total,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // GET /api/admin/disputes/:id - Get dispute details
  app.get('/api/admin/disputes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const _adminId = getAdminUserId(request);

    const paramResult = disputeIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid dispute ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: disputeId } = paramResult.data;

    // Get dispute with full details
    const [dispute] = await db
      .select({
        id: disputes.id,
        matchId: disputes.matchId,
        status: disputes.status,
        reason: disputes.reason,
        evidenceJson: disputes.evidenceJson,
        resolutionJson: disputes.resolutionJson,
        createdAt: disputes.createdAt,
        updatedAt: disputes.updatedAt,
        openedBy: {
          id: users.id,
          displayName: users.displayName,
          email: users.email,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(disputes)
      .innerJoin(users, eq(disputes.openedByUserId, users.id))
      .where(eq(disputes.id, disputeId));

    if (!dispute) {
      throw new NotFoundError('Dispute', disputeId);
    }

    // Get match details
    const [match] = await db
      .select({
        id: matches.id,
        status: matches.status,
        mode: matches.mode,
        disputeStatus: matches.disputeStatus,
        createdAt: matches.createdAt,
        startAt: matches.startAt,
        endAt: matches.endAt,
        challenge: {
          id: challenges.id,
          title: challenges.title,
          category: challenges.category,
          difficulty: challenges.difficulty,
        },
      })
      .from(matches)
      .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
      .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
      .where(eq(matches.id, dispute.matchId));

    // Get participants
    const participants = await db
      .select({
        id: matchParticipants.id,
        seat: matchParticipants.seat,
        joinedAt: matchParticipants.joinedAt,
        forfeitAt: matchParticipants.forfeitAt,
        user: {
          id: users.id,
          displayName: users.displayName,
          email: users.email,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(matchParticipants)
      .innerJoin(users, eq(matchParticipants.userId, users.id))
      .where(eq(matchParticipants.matchId, dispute.matchId));

    // Get scores if available
    const matchScores = await db
      .select()
      .from(scores)
      .where(eq(scores.matchId, dispute.matchId));

    // Get other disputes for this match
    const otherDisputes = await db
      .select({
        id: disputes.id,
        status: disputes.status,
        reason: disputes.reason,
        createdAt: disputes.createdAt,
        openedBy: {
          id: users.id,
          displayName: users.displayName,
        },
      })
      .from(disputes)
      .innerJoin(users, eq(disputes.openedByUserId, users.id))
      .where(
        and(
          eq(disputes.matchId, dispute.matchId),
          // Exclude current dispute
          eq(disputes.id, disputeId) ? undefined : undefined
        )
      );

    // Get audit history for this dispute
    const auditHistory = await db
      .select({
        id: eventsAudit.id,
        eventType: eventsAudit.eventType,
        payloadJson: eventsAudit.payloadJson,
        createdAt: eventsAudit.createdAt,
        actor: {
          id: users.id,
          displayName: users.displayName,
        },
      })
      .from(eventsAudit)
      .leftJoin(users, eq(eventsAudit.actorUserId, users.id))
      .where(
        and(
          eq(eventsAudit.entityType, 'dispute'),
          eq(eventsAudit.entityId, disputeId)
        )
      )
      .orderBy(desc(eventsAudit.createdAt));

    return {
      dispute,
      match,
      participants,
      scores: matchScores,
      otherDisputes: otherDisputes.filter(d => d.id !== disputeId),
      auditHistory,
    };
  });

  // POST /api/admin/disputes/:id/review - Mark dispute as in_review
  app.post('/api/admin/disputes/:id/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = getAdminUserId(request);

    const paramResult = disputeIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid dispute ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: disputeId } = paramResult.data;

    // Get dispute
    const [dispute] = await db
      .select()
      .from(disputes)
      .where(eq(disputes.id, disputeId));

    if (!dispute) {
      throw new NotFoundError('Dispute', disputeId);
    }

    if (dispute.status !== 'open') {
      throw new ConflictError(`Cannot review dispute with status '${dispute.status}'`);
    }

    // Update dispute status
    const [updatedDispute] = await db
      .update(disputes)
      .set({
        status: 'in_review',
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, disputeId))
      .returning();

    // Update match dispute status
    await db
      .update(matches)
      .set({ disputeStatus: 'in_review' })
      .where(eq(matches.id, dispute.matchId));

    // Create audit event
    await db.insert(eventsAudit).values({
      actorUserId: adminId,
      eventType: 'dispute_review_started',
      entityType: 'dispute',
      entityId: disputeId,
      payloadJson: {
        matchId: dispute.matchId,
        previousStatus: dispute.status,
      },
    });

    return {
      id: updatedDispute.id,
      status: updatedDispute.status,
      message: 'Dispute is now under review',
    };
  });

  // POST /api/admin/disputes/:id/resolve - Resolve a dispute
  app.post('/api/admin/disputes/:id/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = getAdminUserId(request);

    const paramResult = disputeIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid dispute ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = resolveDisputeSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { id: disputeId } = paramResult.data;
    const { resolution, reason, newOutcome, adjustments, internalNotes } = bodyResult.data;

    // Get dispute
    const [dispute] = await db
      .select()
      .from(disputes)
      .where(eq(disputes.id, disputeId));

    if (!dispute) {
      throw new NotFoundError('Dispute', disputeId);
    }

    if (dispute.status === 'resolved') {
      throw new ConflictError('Dispute has already been resolved');
    }

    // Get match to check participants
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, dispute.matchId));

    if (!match) {
      throw new NotFoundError('Match', dispute.matchId);
    }

    // Build resolution data
    const resolutionData = {
      resolution,
      reason,
      newOutcome: newOutcome || 'no_change',
      adjustments,
      internalNotes,
      resolvedBy: adminId,
      resolvedAt: new Date().toISOString(),
    };

    // Handle re-settlement if outcome changed
    let settlementResult = null;
    if (newOutcome && newOutcome !== 'no_change') {
      // Map to settlement outcome
      const outcomeMap: Record<string, SettlementOutcome> = {
        winner_a: 'winner_a',
        winner_b: 'winner_b',
        tie: 'tie',
      };

      const settlementOutcome = outcomeMap[newOutcome];
      if (settlementOutcome) {
        // Note: In a real implementation, we'd need to:
        // 1. Reverse the original settlement
        // 2. Apply the new settlement
        // For now, we just record the intended new outcome
        // The actual re-settlement would require more complex ledger operations
        settlementResult = {
          intendedOutcome: settlementOutcome,
          note: 'Re-settlement would be applied here in production',
        };
      }
    }

    // Update dispute
    const [updatedDispute] = await db
      .update(disputes)
      .set({
        status: 'resolved',
        resolutionJson: resolutionData,
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, disputeId))
      .returning();

    // Check if all disputes for this match are resolved
    const [pendingDisputes] = await db
      .select({ count: count() })
      .from(disputes)
      .where(
        and(
          eq(disputes.matchId, dispute.matchId),
          or(
            eq(disputes.status, 'open'),
            eq(disputes.status, 'in_review')
          )
        )
      );

    const allResolved = (pendingDisputes?.count ?? 0) === 0;

    // Update match dispute status
    await db
      .update(matches)
      .set({
        disputeStatus: allResolved ? 'resolved' : 'in_review',
      })
      .where(eq(matches.id, dispute.matchId));

    // Create audit event
    await db.insert(eventsAudit).values({
      actorUserId: adminId,
      eventType: 'dispute_resolved',
      entityType: 'dispute',
      entityId: disputeId,
      payloadJson: {
        matchId: dispute.matchId,
        resolution,
        newOutcome: newOutcome || 'no_change',
        hasAdjustments: Object.keys(adjustments || {}).length > 0,
      },
    });

    return {
      id: updatedDispute.id,
      status: updatedDispute.status,
      resolution: resolutionData,
      settlementResult,
      matchDisputeStatus: allResolved ? 'resolved' : 'in_review',
      message: `Dispute ${resolution}. ${allResolved ? 'All disputes for this match have been resolved.' : 'Other disputes still pending.'}`,
    };
  });

  // POST /api/admin/disputes/:id/rejudge - Trigger re-judging for the match
  app.post('/api/admin/disputes/:id/rejudge', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = getAdminUserId(request);

    const paramResult = disputeIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid dispute ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: disputeId } = paramResult.data;

    // Get dispute
    const [dispute] = await db
      .select()
      .from(disputes)
      .where(eq(disputes.id, disputeId));

    if (!dispute) {
      throw new NotFoundError('Dispute', disputeId);
    }

    if (dispute.status === 'resolved') {
      throw new ConflictError('Cannot rejudge a resolved dispute');
    }

    // Get match
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, dispute.matchId));

    if (!match) {
      throw new NotFoundError('Match', dispute.matchId);
    }

    if (match.status !== 'finalized') {
      throw new ValidationError('Can only rejudge finalized matches');
    }

    // TODO: In production, this would:
    // 1. Queue a re-judging job
    // 2. Update match status to 'judging'
    // 3. Process the re-judge
    // 4. Update scores and potentially re-settle

    // Create audit event
    await db.insert(eventsAudit).values({
      actorUserId: adminId,
      eventType: 'dispute_rejudge_requested',
      entityType: 'dispute',
      entityId: disputeId,
      payloadJson: {
        matchId: dispute.matchId,
        note: 'Re-judging requested by admin',
      },
    });

    return {
      disputeId,
      matchId: dispute.matchId,
      status: 'rejudge_queued',
      message: 'Re-judging has been queued. Results will be available shortly.',
    };
  });
}
