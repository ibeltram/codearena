/**
 * Admin Audit Log Routes
 *
 * API endpoints for exploring and searching audit logs.
 * Admin-only access required.
 *
 * Endpoints:
 * - GET /api/admin/audit - List audit events with filters
 * - GET /api/admin/audit/:id - Get single audit event
 * - GET /api/admin/audit/entity/:type/:id - Get audit trail for an entity
 * - GET /api/admin/audit/user/:userId - Get audit trail for a user
 * - GET /api/admin/audit/stats - Get audit statistics
 * - POST /api/admin/audit/export - Export audit events to JSON
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db, schema } from '../db';
import {
  queryAuditEvents,
  getEntityAuditTrail,
  getUserAuditTrail,
  countAuditEvents,
  getAuditStats,
  AuditCategory,
  AuditQueryFilters,
} from '../lib/audit-service';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';

// Validate admin role
function requireAdmin(request: FastifyRequest): string {
  const user = request.user as { id: string; roles?: string[] } | undefined;

  if (!user?.id) {
    throw new ForbiddenError('Authentication required');
  }

  if (!user.roles?.includes('admin')) {
    throw new ForbiddenError('Admin access required');
  }

  return user.id;
}

// Query parameter schemas
const listAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  actorUserId: z.string().uuid().optional(),
  category: z.enum([
    'auth', 'admin', 'moderation', 'payment', 'match',
    'submission', 'challenge', 'tournament', 'reward', 'system'
  ]).optional(),
  eventType: z.string().max(100).optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const entityParamsSchema = z.object({
  type: z.string().max(100),
  id: z.string().uuid(),
});

const userParamsSchema = z.object({
  userId: z.string().uuid(),
});

const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

const exportBodySchema = z.object({
  filters: z.object({
    actorUserId: z.string().uuid().optional(),
    category: z.enum([
      'auth', 'admin', 'moderation', 'payment', 'match',
      'submission', 'challenge', 'tournament', 'reward', 'system'
    ]).optional(),
    eventType: z.string().max(100).optional(),
    entityType: z.string().max(100).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }).optional().default({}),
  limit: z.number().int().min(1).max(10000).default(1000),
});

export async function adminAuditRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/audit
   * List audit events with filters and pagination
   */
  app.get('/api/admin/audit', {
    preHandler: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      requireAdmin(request);

      const queryResult = listAuditQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', {
          issues: queryResult.error.issues,
        });
      }

      const query = queryResult.data;
      const offset = (query.page - 1) * query.limit;

      const filters: AuditQueryFilters = {
        actorUserId: query.actorUserId,
        category: query.category as AuditCategory,
        eventType: query.eventType,
        entityType: query.entityType,
        entityId: query.entityId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        limit: query.limit,
        offset,
      };

      const [events, total] = await Promise.all([
        queryAuditEvents(filters),
        countAuditEvents(filters),
      ]);

      return reply.status(200).send({
        data: events.map((event) => ({
          id: event.id,
          actorUserId: event.actorUserId,
          category: event.category,
          eventType: event.eventType,
          entityType: event.entityType,
          entityId: event.entityId,
          ipAddress: event.ipAddress,
          requestId: event.requestId,
          payload: event.payloadJson,
          createdAt: event.createdAt,
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    },
  });

  /**
   * GET /api/admin/audit/:id
   * Get a single audit event by ID
   */
  app.get('/api/admin/audit/:id', {
    preHandler: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      requireAdmin(request);

      const { id } = request.params as { id: string };

      // Validate UUID
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new ValidationError('Invalid audit event ID format');
      }

      const [event] = await db
        .select()
        .from(schema.eventsAudit)
        .where(eq(schema.eventsAudit.id, id));

      if (!event) {
        throw new NotFoundError('Audit event', id);
      }

      // Get actor user info if available
      let actor = null;
      if (event.actorUserId) {
        const [user] = await db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            displayName: schema.users.displayName,
            avatarUrl: schema.users.avatarUrl,
          })
          .from(schema.users)
          .where(eq(schema.users.id, event.actorUserId));
        actor = user || null;
      }

      return reply.status(200).send({
        id: event.id,
        actor,
        category: event.category,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        requestId: event.requestId,
        payload: event.payloadJson,
        createdAt: event.createdAt,
      });
    },
  });

  /**
   * GET /api/admin/audit/entity/:type/:id
   * Get audit trail for a specific entity
   */
  app.get('/api/admin/audit/entity/:type/:id', {
    preHandler: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      requireAdmin(request);

      const paramsResult = entityParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        throw new ValidationError('Invalid parameters', {
          issues: paramsResult.error.issues,
        });
      }

      const { type, id } = paramsResult.data;
      const events = await getEntityAuditTrail(type, id, 100);

      return reply.status(200).send({
        entityType: type,
        entityId: id,
        events: events.map((event) => ({
          id: event.id,
          actorUserId: event.actorUserId,
          category: event.category,
          eventType: event.eventType,
          ipAddress: event.ipAddress,
          payload: event.payloadJson,
          createdAt: event.createdAt,
        })),
      });
    },
  });

  /**
   * GET /api/admin/audit/user/:userId
   * Get audit trail for a specific user (as actor)
   */
  app.get('/api/admin/audit/user/:userId', {
    preHandler: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      requireAdmin(request);

      const paramsResult = userParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        throw new ValidationError('Invalid user ID', {
          issues: paramsResult.error.issues,
        });
      }

      const { userId } = paramsResult.data;

      // Verify user exists
      const [user] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          displayName: schema.users.displayName,
          avatarUrl: schema.users.avatarUrl,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (!user) {
        throw new NotFoundError('User', userId);
      }

      const events = await getUserAuditTrail(userId, 100);

      return reply.status(200).send({
        user,
        events: events.map((event) => ({
          id: event.id,
          category: event.category,
          eventType: event.eventType,
          entityType: event.entityType,
          entityId: event.entityId,
          ipAddress: event.ipAddress,
          payload: event.payloadJson,
          createdAt: event.createdAt,
        })),
      });
    },
  });

  /**
   * GET /api/admin/audit/stats
   * Get audit statistics for dashboard
   */
  app.get('/api/admin/audit/stats', {
    preHandler: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      requireAdmin(request);

      const queryResult = statsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', {
          issues: queryResult.error.issues,
        });
      }

      const { days } = queryResult.data;
      const stats = await getAuditStats(days);

      return reply.status(200).send({
        period: `${days} days`,
        ...stats,
      });
    },
  });

  /**
   * POST /api/admin/audit/export
   * Export audit events to JSON
   */
  app.post('/api/admin/audit/export', {
    preHandler: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      requireAdmin(request);

      const bodyResult = exportBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new ValidationError('Invalid request body', {
          issues: bodyResult.error.issues,
        });
      }

      const { filters, limit } = bodyResult.data;

      const queryFilters: AuditQueryFilters = {
        actorUserId: filters.actorUserId,
        category: filters.category as AuditCategory,
        eventType: filters.eventType,
        entityType: filters.entityType,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
        limit,
        offset: 0,
      };

      const events = await queryAuditEvents(queryFilters);

      // Return as downloadable JSON
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.json"`);

      return reply.status(200).send({
        exportedAt: new Date().toISOString(),
        filters,
        totalEvents: events.length,
        events: events.map((event) => ({
          id: event.id,
          actorUserId: event.actorUserId,
          category: event.category,
          eventType: event.eventType,
          entityType: event.entityType,
          entityId: event.entityId,
          ipAddress: event.ipAddress,
          requestId: event.requestId,
          payload: event.payloadJson,
          createdAt: event.createdAt,
        })),
      });
    },
  });
}
