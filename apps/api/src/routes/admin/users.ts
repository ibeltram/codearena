/**
 * Admin User Management Routes
 *
 * API endpoints for admin management of users including role assignment.
 *
 * Endpoints:
 * - GET /api/admin/users - List all users (with pagination)
 * - GET /api/admin/users/:id - Get user details
 * - PATCH /api/admin/users/:id/roles - Update user roles
 * - POST /api/admin/users/:id/ban - Ban a user
 * - POST /api/admin/users/:id/unban - Unban a user
 * - POST /api/admin/users/:id/suspend - Suspend a user temporarily
 * - POST /api/admin/users/:id/unsuspend - Remove user suspension
 * - POST /api/admin/users/:id/warn - Issue a warning to a user
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, desc, count, ilike, or, and, inArray } from 'drizzle-orm';

import { db, schema } from '../../db';
import { NotFoundError, ValidationError, ForbiddenError } from '../../lib/errors';
import { type UserRole } from '../../plugins';
import { releaseStakeHold } from '../../lib/staking';

const { users, eventsAudit, matches, matchParticipants } = schema;

// Request parameter schemas
const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Query parameter schema
const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(['user', 'admin', 'moderator']).optional(),
});

// Role update body schema
const updateRolesSchema = z.object({
  roles: z.array(z.enum(['user', 'admin', 'moderator'])).min(1),
});

// Ban body schema
const banUserSchema = z.object({
  reason: z.string().min(5).max(500),
});

// Suspend body schema
const suspendUserSchema = z.object({
  reason: z.string().min(5).max(500),
  durationHours: z.number().int().min(1).max(8760), // 1 hour to 1 year
});

// Warn body schema
const warnUserSchema = z.object({
  reason: z.string().min(5).max(500),
});

// Admin user routes require admin role
const ADMIN_ROLES: UserRole[] = ['admin'];

export async function adminUserRoutes(app: FastifyInstance) {
  // Apply authentication and admin role check to all routes in this plugin
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole(ADMIN_ROLES));

  // GET /api/admin/users - List all users
  app.get('/api/admin/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = listUsersQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { page, limit, search, role } = queryResult.data;
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(users.email, `%${search}%`),
          ilike(users.displayName, `%${search}%`)
        )
      );
    }

    // Note: Filtering by role in array requires different approach
    // For now, we'll skip role filtering and do it in the app layer if needed

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult?.total ?? 0;

    // Get users
    const userList = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        roles: users.roles,
        isBanned: users.isBanned,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: userList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // GET /api/admin/users/:id - Get user details
  app.get('/api/admin/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = userIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid user ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: userId } = paramResult.data;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        roles: users.roles,
        isBanned: users.isBanned,
        isVerified: users.isVerified,
        preferences: users.preferences,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Get audit history for this user
    const auditHistory = await db
      .select({
        id: eventsAudit.id,
        eventType: eventsAudit.eventType,
        payloadJson: eventsAudit.payloadJson,
        createdAt: eventsAudit.createdAt,
      })
      .from(eventsAudit)
      .where(
        and(
          eq(eventsAudit.entityType, 'user'),
          eq(eventsAudit.entityId, userId)
        )
      )
      .orderBy(desc(eventsAudit.createdAt))
      .limit(20);

    return {
      user,
      auditHistory,
    };
  });

  // PATCH /api/admin/users/:id/roles - Update user roles
  app.patch('/api/admin/users/:id/roles', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = request.user!.id;

    const paramResult = userIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid user ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = updateRolesSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { id: userId } = paramResult.data;
    const { roles: newRoles } = bodyResult.data;

    // Prevent self-demotion (admin cannot remove their own admin role)
    if (userId === adminId && !newRoles.includes('admin')) {
      throw new ForbiddenError('Cannot remove your own admin role');
    }

    // Get current user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    const previousRoles = user.roles;

    // Update roles
    const [updatedUser] = await db
      .update(users)
      .set({ roles: newRoles })
      .where(eq(users.id, userId))
      .returning();

    // Create audit event
    await db.insert(eventsAudit).values({
      actorUserId: adminId,
      eventType: 'user_roles_updated',
      entityType: 'user',
      entityId: userId,
      payloadJson: {
        previousRoles,
        newRoles,
      },
    });

    return {
      id: updatedUser.id,
      roles: updatedUser.roles,
      message: 'User roles updated successfully',
    };
  });

  // POST /api/admin/users/:id/ban - Ban a user
  app.post('/api/admin/users/:id/ban', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = request.user!.id;

    const paramResult = userIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid user ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = banUserSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { id: userId } = paramResult.data;
    const { reason } = bodyResult.data;

    // Prevent self-ban
    if (userId === adminId) {
      throw new ForbiddenError('Cannot ban yourself');
    }

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (user.isBanned) {
      return {
        id: user.id,
        isBanned: true,
        message: 'User is already banned',
      };
    }

    // Prevent banning other admins
    if (user.roles?.includes('admin')) {
      throw new ForbiddenError('Cannot ban an admin user');
    }

    // Find active matches where user is a participant
    const activeMatchStatuses = ['created', 'open', 'matched', 'in_progress', 'submission_locked'];
    const userMatches = await db
      .select({
        matchId: matchParticipants.matchId,
        matchStatus: matches.status,
      })
      .from(matchParticipants)
      .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
      .where(
        and(
          eq(matchParticipants.userId, userId),
          inArray(matches.status, activeMatchStatuses as any)
        )
      );

    const cancelledMatches: string[] = [];
    const refundedParticipants: { matchId: string; userId: string }[] = [];

    // Cancel active matches and refund stakes
    for (const { matchId, matchStatus } of userMatches) {
      // Get all participants in this match
      const participants = await db
        .select()
        .from(matchParticipants)
        .where(eq(matchParticipants.matchId, matchId));

      // Release stake holds for all participants (refund)
      for (const participant of participants) {
        try {
          await releaseStakeHold(participant.userId, matchId, 'cancelled');
          refundedParticipants.push({ matchId, userId: participant.userId });
        } catch (err) {
          // Hold may not exist if match hadn't required stakes yet
          console.warn(`Could not release stake for user ${participant.userId} in match ${matchId}:`, err);
        }
      }

      // Cancel the match
      await db
        .update(matches)
        .set({ status: 'archived' })
        .where(eq(matches.id, matchId));

      cancelledMatches.push(matchId);

      // Create audit event for match cancellation
      await db.insert(eventsAudit).values({
        actorUserId: adminId,
        eventType: 'match_cancelled_moderation',
        entityType: 'match',
        entityId: matchId,
        payloadJson: {
          reason: 'User banned',
          bannedUserId: userId,
          previousStatus: matchStatus,
          refundedParticipants: participants.map(p => p.userId),
        },
      });
    }

    // Ban user
    const [updatedUser] = await db
      .update(users)
      .set({
        isBanned: true,
        banReason: reason,
        bannedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    // Create audit event
    await db.insert(eventsAudit).values({
      actorUserId: adminId,
      eventType: 'user_banned',
      entityType: 'user',
      entityId: userId,
      payloadJson: {
        reason,
        cancelledMatches,
        refundedParticipants,
      },
    });

    return {
      id: updatedUser.id,
      isBanned: updatedUser.isBanned,
      message: 'User has been banned',
      cancelledMatches,
      refundedParticipants: refundedParticipants.length,
    };
  });

  // POST /api/admin/users/:id/unban - Unban a user
  app.post('/api/admin/users/:id/unban', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = request.user!.id;

    const paramResult = userIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid user ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: userId } = paramResult.data;

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (!user.isBanned) {
      return {
        id: user.id,
        isBanned: false,
        message: 'User is not banned',
      };
    }

    // Unban user
    const [updatedUser] = await db
      .update(users)
      .set({
        isBanned: false,
        banReason: null,
        bannedAt: null,
      })
      .where(eq(users.id, userId))
      .returning();

    // Create audit event
    await db.insert(eventsAudit).values({
      actorUserId: adminId,
      eventType: 'user_unbanned',
      entityType: 'user',
      entityId: userId,
      payloadJson: {},
    });

    return {
      id: updatedUser.id,
      isBanned: updatedUser.isBanned,
      message: 'User has been unbanned',
    };
  });

  // POST /api/admin/users/:id/suspend - Temporarily suspend a user
  app.post('/api/admin/users/:id/suspend', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = request.user!.id;

    const paramResult = userIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid user ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = suspendUserSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { id: userId } = paramResult.data;
    const { reason, durationHours } = bodyResult.data;

    // Prevent self-suspension
    if (userId === adminId) {
      throw new ForbiddenError('Cannot suspend yourself');
    }

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Prevent suspending admins
    if (user.roles?.includes('admin')) {
      throw new ForbiddenError('Cannot suspend an admin user');
    }

    // Check if already banned (more severe action)
    if (user.isBanned) {
      return {
        id: user.id,
        message: 'User is already banned (permanent). Use unban first if you want to suspend instead.',
      };
    }

    // Calculate suspension end time
    const suspendedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    // Suspend user
    const [updatedUser] = await db
      .update(users)
      .set({
        suspendedUntil,
        suspensionReason: reason,
      })
      .where(eq(users.id, userId))
      .returning();

    // Create audit event
    await db.insert(eventsAudit).values({
      actorUserId: adminId,
      eventType: 'user_suspended',
      entityType: 'user',
      entityId: userId,
      payloadJson: {
        reason,
        durationHours,
        suspendedUntil: suspendedUntil.toISOString(),
      },
    });

    return {
      id: updatedUser.id,
      suspendedUntil: updatedUser.suspendedUntil,
      message: `User has been suspended until ${suspendedUntil.toISOString()}`,
    };
  });

  // POST /api/admin/users/:id/unsuspend - Remove user suspension
  app.post('/api/admin/users/:id/unsuspend', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = request.user!.id;

    const paramResult = userIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid user ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: userId } = paramResult.data;

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Check if user is not suspended
    if (!user.suspendedUntil || new Date(user.suspendedUntil) <= new Date()) {
      return {
        id: user.id,
        message: 'User is not currently suspended',
      };
    }

    // Remove suspension
    const [updatedUser] = await db
      .update(users)
      .set({
        suspendedUntil: null,
        suspensionReason: null,
      })
      .where(eq(users.id, userId))
      .returning();

    // Create audit event
    await db.insert(eventsAudit).values({
      actorUserId: adminId,
      eventType: 'user_unsuspended',
      entityType: 'user',
      entityId: userId,
      payloadJson: {
        previousSuspendedUntil: user.suspendedUntil?.toISOString(),
      },
    });

    return {
      id: updatedUser.id,
      message: 'User suspension has been removed',
    };
  });

  // POST /api/admin/users/:id/warn - Issue a warning to a user
  app.post('/api/admin/users/:id/warn', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = request.user!.id;

    const paramResult = userIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid user ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = warnUserSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { id: userId } = paramResult.data;
    const { reason } = bodyResult.data;

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Increment warning count
    const newWarningCount = (user.warningCount || 0) + 1;

    const [updatedUser] = await db
      .update(users)
      .set({
        warningCount: newWarningCount,
        lastWarningAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    // Create audit event
    await db.insert(eventsAudit).values({
      actorUserId: adminId,
      eventType: 'user_warned',
      entityType: 'user',
      entityId: userId,
      payloadJson: {
        reason,
        warningNumber: newWarningCount,
      },
    });

    // TODO: Send email notification to user about the warning

    return {
      id: updatedUser.id,
      warningCount: updatedUser.warningCount,
      message: `Warning issued to user. Total warnings: ${newWarningCount}`,
    };
  });
}
