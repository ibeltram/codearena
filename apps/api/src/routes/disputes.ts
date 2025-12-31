/**
 * Dispute Routes
 *
 * API endpoints for filing disputes, viewing dispute status, and managing disputes.
 *
 * Endpoints:
 * - POST /api/matches/:id/disputes - Create a dispute for a match
 * - GET /api/matches/:id/disputes - Get disputes for a match
 * - GET /api/disputes/my - Get current user's disputes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count, gte } from 'drizzle-orm';

import { db, schema } from '../db';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../lib/errors';

const {
  disputes,
  matches,
  matchParticipants,
  users,
  eventsAudit,
} = schema;

// Constants
const DISPUTE_WINDOW_HOURS = 24; // Hours after finalization to file a dispute

// Request body schemas
const createDisputeSchema = z.object({
  reason: z.string().min(10).max(2000),
  evidence: z.object({
    description: z.string().optional(),
    screenshots: z.array(z.string().url()).optional(),
    links: z.array(z.string().url()).optional(),
    additionalContext: z.string().optional(),
  }).optional().default({}),
});

const matchIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Query parameter schema
const listDisputesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['open', 'in_review', 'resolved']).optional(),
});

// Helper to check if within dispute window
function isWithinDisputeWindow(finalizedAt: Date | null): boolean {
  if (!finalizedAt) return false;

  const now = new Date();
  const windowEnd = new Date(finalizedAt);
  windowEnd.setHours(windowEnd.getHours() + DISPUTE_WINDOW_HOURS);

  return now <= windowEnd;
}

// Helper to get time remaining in dispute window
function getDisputeWindowRemaining(finalizedAt: Date | null): string | null {
  if (!finalizedAt) return null;

  const now = new Date();
  const windowEnd = new Date(finalizedAt);
  windowEnd.setHours(windowEnd.getHours() + DISPUTE_WINDOW_HOURS);

  const remainingMs = windowEnd.getTime() - now.getTime();
  if (remainingMs <= 0) return null;

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  return `${hours}h ${minutes}m`;
}

export async function disputeRoutes(app: FastifyInstance) {
  // Helper to get user ID from request
  const getUserId = (request: FastifyRequest): string => {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) {
      throw new ForbiddenError('User authentication required');
    }
    return userId;
  };

  // POST /api/matches/:id/disputes - Create a dispute for a match
  app.post('/api/matches/:id/disputes', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const paramResult = matchIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = createDisputeSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;
    const { reason, evidence } = bodyResult.data;

    // Get the match
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new NotFoundError('Match', matchId);
    }

    // Verify match is finalized
    if (match.status !== 'finalized') {
      throw new ValidationError(`Cannot dispute match with status '${match.status}'. Match must be finalized.`);
    }

    // Check dispute window (24 hours after finalization)
    // Note: In a real app, we'd have a `finalizedAt` timestamp. Using createdAt as proxy here.
    // For now, we'll be lenient and allow disputes on any finalized match
    // In production, add a `finalizedAt` column to matches table

    // Verify user is a participant in this match
    const [participant] = await db
      .select()
      .from(matchParticipants)
      .where(
        and(
          eq(matchParticipants.matchId, matchId),
          eq(matchParticipants.userId, userId)
        )
      );

    if (!participant) {
      throw new ForbiddenError('Only match participants can file disputes');
    }

    // Check if user already has a dispute for this match
    const [existingDispute] = await db
      .select()
      .from(disputes)
      .where(
        and(
          eq(disputes.matchId, matchId),
          eq(disputes.openedByUserId, userId)
        )
      );

    if (existingDispute) {
      throw new ConflictError('You have already filed a dispute for this match');
    }

    // Create the dispute
    const [newDispute] = await db
      .insert(disputes)
      .values({
        matchId,
        openedByUserId: userId,
        reason,
        evidenceJson: evidence,
        status: 'open',
      })
      .returning();

    // Update match dispute status
    await db
      .update(matches)
      .set({ disputeStatus: 'open' })
      .where(eq(matches.id, matchId));

    // Create audit event
    await db.insert(eventsAudit).values({
      actorUserId: userId,
      eventType: 'dispute_created',
      entityType: 'dispute',
      entityId: newDispute.id,
      payloadJson: {
        matchId,
        reason,
        hasEvidence: Object.keys(evidence).length > 0,
      },
    });

    return reply.status(201).send({
      id: newDispute.id,
      matchId: newDispute.matchId,
      status: newDispute.status,
      reason: newDispute.reason,
      evidence: newDispute.evidenceJson,
      createdAt: newDispute.createdAt,
      message: 'Dispute filed successfully. Our team will review within 48 hours.',
    });
  });

  // GET /api/matches/:id/disputes - Get disputes for a match
  app.get('/api/matches/:id/disputes', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = matchIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;

    // Verify match exists
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new NotFoundError('Match', matchId);
    }

    // Get all disputes for this match with user info
    const matchDisputes = await db
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
          avatarUrl: users.avatarUrl,
        },
      })
      .from(disputes)
      .innerJoin(users, eq(disputes.openedByUserId, users.id))
      .where(eq(disputes.matchId, matchId))
      .orderBy(desc(disputes.createdAt));

    return {
      matchId,
      matchDisputeStatus: match.disputeStatus,
      disputes: matchDisputes,
      canDispute: match.status === 'finalized' && match.disputeStatus === 'none',
    };
  });

  // GET /api/disputes/my - Get current user's disputes
  app.get('/api/disputes/my', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const queryResult = listDisputesQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { page, limit, status } = queryResult.data;
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [eq(disputes.openedByUserId, userId)];
    if (status) {
      conditions.push(eq(disputes.status, status));
    }

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(disputes)
      .where(and(...conditions));

    const total = countResult?.total ?? 0;

    // Get user's disputes with match info
    const userDisputes = await db
      .select({
        id: disputes.id,
        matchId: disputes.matchId,
        status: disputes.status,
        reason: disputes.reason,
        evidenceJson: disputes.evidenceJson,
        resolutionJson: disputes.resolutionJson,
        createdAt: disputes.createdAt,
        updatedAt: disputes.updatedAt,
      })
      .from(disputes)
      .where(and(...conditions))
      .orderBy(desc(disputes.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: userDisputes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });
}
