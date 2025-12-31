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
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, desc, count, ilike, or, and } from 'drizzle-orm';

import { db, schema } from '../../db';
import { NotFoundError, ValidationError, ForbiddenError } from '../../lib/errors';
import { type UserRole } from '../../plugins';

const { users, eventsAudit } = schema;

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

    // Ban user
    const [updatedUser] = await db
      .update(users)
      .set({ isBanned: true })
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
      },
    });

    return {
      id: updatedUser.id,
      isBanned: updatedUser.isBanned,
      message: 'User has been banned',
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
      .set({ isBanned: false })
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
}
