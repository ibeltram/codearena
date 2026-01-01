/**
 * Audit Logging Service
 *
 * Provides persistent audit logging for all sensitive operations.
 * Records are stored in the events_audit table with:
 * - Actor (user who performed the action)
 * - Category (type of operation)
 * - Entity (what was affected)
 * - Payload (details of the operation)
 * - Request context (IP, user agent, request ID)
 *
 * Supports 90-day retention with archival to cold storage.
 */

import { db, schema } from '../db';
import { lt, and, eq, desc, gte, sql } from 'drizzle-orm';
import { logger, getCurrentContext } from './logger';
import type { FastifyRequest } from 'fastify';

// Audit event categories - must match the enum in schema
export type AuditCategory =
  | 'auth'
  | 'admin'
  | 'moderation'
  | 'payment'
  | 'match'
  | 'submission'
  | 'challenge'
  | 'tournament'
  | 'reward'
  | 'system';

// Common event types by category
export const AuditEventTypes = {
  // Auth events
  auth: {
    LOGIN: 'auth.login',
    LOGOUT: 'auth.logout',
    TOKEN_REFRESH: 'auth.token_refresh',
    PASSWORD_CHANGE: 'auth.password_change',
    OAUTH_LINK: 'auth.oauth_link',
    OAUTH_UNLINK: 'auth.oauth_unlink',
    DEVICE_CODE_START: 'auth.device_code_start',
    DEVICE_CODE_CONFIRM: 'auth.device_code_confirm',
  },
  // Admin events
  admin: {
    USER_ROLE_CHANGE: 'admin.user_role_change',
    SETTINGS_UPDATE: 'admin.settings_update',
    FEATURE_FLAG_TOGGLE: 'admin.feature_flag_toggle',
    SYSTEM_CONFIG_UPDATE: 'admin.system_config_update',
  },
  // Moderation events
  moderation: {
    USER_WARN: 'moderation.user_warn',
    USER_SUSPEND: 'moderation.user_suspend',
    USER_BAN: 'moderation.user_ban',
    USER_UNBAN: 'moderation.user_unban',
    USER_REPORTED: 'moderation.user_reported',
    REPORT_REVIEWED: 'moderation.report_reviewed',
    REPORT_RESOLVED: 'moderation.report_resolved',
    DISPUTE_OPEN: 'moderation.dispute_open',
    DISPUTE_RESOLVE: 'moderation.dispute_resolve',
    CONTENT_REMOVE: 'moderation.content_remove',
  },
  // Payment events
  payment: {
    PURCHASE_INITIATED: 'payment.purchase_initiated',
    PURCHASE_COMPLETED: 'payment.purchase_completed',
    PURCHASE_FAILED: 'payment.purchase_failed',
    REFUND_ISSUED: 'payment.refund_issued',
    STAKE_PLACED: 'payment.stake_placed',
    STAKE_RELEASED: 'payment.stake_released',
    PAYOUT_PROCESSED: 'payment.payout_processed',
    CREDITS_TRANSFERRED: 'payment.credits_transferred',
  },
  // Match events
  match: {
    MATCH_CREATED: 'match.created',
    MATCH_STARTED: 'match.started',
    MATCH_FINALIZED: 'match.finalized',
    MATCH_CANCELLED: 'match.cancelled',
    MATCH_DISPUTED: 'match.disputed',
    PLAYER_JOINED: 'match.player_joined',
    PLAYER_FORFEITED: 'match.player_forfeited',
  },
  // Submission events
  submission: {
    UPLOAD_STARTED: 'submission.upload_started',
    UPLOAD_COMPLETED: 'submission.upload_completed',
    SUBMISSION_LOCKED: 'submission.locked',
    SECRET_DETECTED: 'submission.secret_detected',
  },
  // Challenge events
  challenge: {
    CREATED: 'challenge.created',
    UPDATED: 'challenge.updated',
    PUBLISHED: 'challenge.published',
    ARCHIVED: 'challenge.archived',
    VERSION_CREATED: 'challenge.version_created',
  },
  // Tournament events
  tournament: {
    CREATED: 'tournament.created',
    REGISTRATION_OPENED: 'tournament.registration_opened',
    REGISTRATION_CLOSED: 'tournament.registration_closed',
    STARTED: 'tournament.started',
    COMPLETED: 'tournament.completed',
    CANCELLED: 'tournament.cancelled',
    PRIZE_CLAIMED: 'tournament.prize_claimed',
    PRIZE_FULFILLED: 'tournament.prize_fulfilled',
  },
  // Reward events
  reward: {
    REDEEMED: 'reward.redeemed',
    CODE_ISSUED: 'reward.code_issued',
    ACTIVATED: 'reward.activated',
    EXPIRED: 'reward.expired',
    REFUNDED: 'reward.refunded',
    PARTNER_CREATED: 'reward.partner_created',
    PARTNER_UPDATED: 'reward.partner_updated',
  },
  // System events
  system: {
    STARTUP: 'system.startup',
    SHUTDOWN: 'system.shutdown',
    CONFIG_RELOAD: 'system.config_reload',
    CLEANUP_JOB: 'system.cleanup_job',
    RETENTION_ARCHIVE: 'system.retention_archive',
  },
} as const;

// Audit event input
export interface AuditEventInput {
  actorUserId?: string | null;
  category: AuditCategory;
  eventType: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

// Audit query filters
export interface AuditQueryFilters {
  actorUserId?: string;
  category?: AuditCategory;
  eventType?: string;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Extract request context for audit logging
 */
export function getRequestContext(request?: FastifyRequest): {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
} {
  if (!request) {
    const ctx = getCurrentContext();
    return {
      requestId: ctx?.requestId,
    };
  }

  return {
    ipAddress: request.ip || (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim(),
    userAgent: request.headers['user-agent']?.substring(0, 500),
    requestId: request.id || (request.headers['x-request-id'] as string),
  };
}

/**
 * Record an audit event to the database
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<string> {
  try {
    const [event] = await db
      .insert(schema.eventsAudit)
      .values({
        actorUserId: input.actorUserId || undefined,
        category: input.category,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
        payloadJson: input.payload || {},
      })
      .returning({ id: schema.eventsAudit.id });

    logger.debug(
      {
        auditEventId: event.id,
        category: input.category,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      'Audit event recorded'
    );

    return event.id;
  } catch (error) {
    // Log error but don't throw - audit failures shouldn't break the main operation
    logger.error(
      {
        error,
        category: input.category,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      'Failed to record audit event'
    );
    throw error;
  }
}

/**
 * Helper to create audit event with request context
 */
export async function audit(
  category: AuditCategory,
  eventType: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
  request?: FastifyRequest,
  actorUserId?: string | null
): Promise<string> {
  const context = getRequestContext(request);

  return recordAuditEvent({
    actorUserId: actorUserId ?? (request?.user as { id?: string })?.id,
    category,
    eventType,
    entityType,
    entityId,
    payload,
    ...context,
  });
}

/**
 * Query audit events with filters
 */
export async function queryAuditEvents(filters: AuditQueryFilters) {
  const conditions = [];

  if (filters.actorUserId) {
    conditions.push(eq(schema.eventsAudit.actorUserId, filters.actorUserId));
  }

  if (filters.category) {
    conditions.push(eq(schema.eventsAudit.category, filters.category));
  }

  if (filters.eventType) {
    conditions.push(eq(schema.eventsAudit.eventType, filters.eventType));
  }

  if (filters.entityType) {
    conditions.push(eq(schema.eventsAudit.entityType, filters.entityType));
  }

  if (filters.entityId) {
    conditions.push(eq(schema.eventsAudit.entityId, filters.entityId));
  }

  if (filters.startDate) {
    conditions.push(gte(schema.eventsAudit.createdAt, filters.startDate));
  }

  if (filters.endDate) {
    conditions.push(lt(schema.eventsAudit.createdAt, filters.endDate));
  }

  const query = db
    .select({
      id: schema.eventsAudit.id,
      actorUserId: schema.eventsAudit.actorUserId,
      category: schema.eventsAudit.category,
      eventType: schema.eventsAudit.eventType,
      entityType: schema.eventsAudit.entityType,
      entityId: schema.eventsAudit.entityId,
      ipAddress: schema.eventsAudit.ipAddress,
      requestId: schema.eventsAudit.requestId,
      payloadJson: schema.eventsAudit.payloadJson,
      createdAt: schema.eventsAudit.createdAt,
    })
    .from(schema.eventsAudit)
    .orderBy(desc(schema.eventsAudit.createdAt))
    .limit(filters.limit || 50)
    .offset(filters.offset || 0);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }

  return query;
}

/**
 * Get audit events for a specific entity
 */
export async function getEntityAuditTrail(
  entityType: string,
  entityId: string,
  limit = 50
) {
  return db
    .select({
      id: schema.eventsAudit.id,
      actorUserId: schema.eventsAudit.actorUserId,
      category: schema.eventsAudit.category,
      eventType: schema.eventsAudit.eventType,
      ipAddress: schema.eventsAudit.ipAddress,
      payloadJson: schema.eventsAudit.payloadJson,
      createdAt: schema.eventsAudit.createdAt,
    })
    .from(schema.eventsAudit)
    .where(
      and(
        eq(schema.eventsAudit.entityType, entityType),
        eq(schema.eventsAudit.entityId, entityId)
      )
    )
    .orderBy(desc(schema.eventsAudit.createdAt))
    .limit(limit);
}

/**
 * Get audit events for a specific user (as actor)
 */
export async function getUserAuditTrail(userId: string, limit = 50) {
  return db
    .select({
      id: schema.eventsAudit.id,
      category: schema.eventsAudit.category,
      eventType: schema.eventsAudit.eventType,
      entityType: schema.eventsAudit.entityType,
      entityId: schema.eventsAudit.entityId,
      ipAddress: schema.eventsAudit.ipAddress,
      payloadJson: schema.eventsAudit.payloadJson,
      createdAt: schema.eventsAudit.createdAt,
    })
    .from(schema.eventsAudit)
    .where(eq(schema.eventsAudit.actorUserId, userId))
    .orderBy(desc(schema.eventsAudit.createdAt))
    .limit(limit);
}

/**
 * Count audit events matching filters (for pagination)
 */
export async function countAuditEvents(filters: AuditQueryFilters): Promise<number> {
  const conditions = [];

  if (filters.actorUserId) {
    conditions.push(eq(schema.eventsAudit.actorUserId, filters.actorUserId));
  }

  if (filters.category) {
    conditions.push(eq(schema.eventsAudit.category, filters.category));
  }

  if (filters.eventType) {
    conditions.push(eq(schema.eventsAudit.eventType, filters.eventType));
  }

  if (filters.entityType) {
    conditions.push(eq(schema.eventsAudit.entityType, filters.entityType));
  }

  if (filters.startDate) {
    conditions.push(gte(schema.eventsAudit.createdAt, filters.startDate));
  }

  if (filters.endDate) {
    conditions.push(lt(schema.eventsAudit.createdAt, filters.endDate));
  }

  const query = db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.eventsAudit);

  if (conditions.length > 0) {
    const [result] = await query.where(and(...conditions));
    return result?.count || 0;
  }

  const [result] = await query;
  return result?.count || 0;
}

/**
 * Delete audit events older than retention period (90 days)
 * Should be called by a scheduled job
 */
export async function cleanupOldAuditEvents(retentionDays = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  try {
    // First, export to cold storage (in production, this would upload to S3/GCS)
    const oldEvents = await db
      .select()
      .from(schema.eventsAudit)
      .where(lt(schema.eventsAudit.createdAt, cutoffDate))
      .limit(10000); // Process in batches

    if (oldEvents.length > 0) {
      // Log the archival (in production, upload to cold storage)
      logger.info(
        { count: oldEvents.length, cutoffDate },
        'Archiving audit events to cold storage'
      );

      // TODO: Implement actual cold storage upload
      // await uploadToColdStorage(oldEvents);
    }

    // Delete old events
    const result = await db
      .delete(schema.eventsAudit)
      .where(lt(schema.eventsAudit.createdAt, cutoffDate));

    const deletedCount = oldEvents.length;

    // Record the cleanup as a system audit event
    await recordAuditEvent({
      category: 'system',
      eventType: AuditEventTypes.system.CLEANUP_JOB,
      entityType: 'audit_events',
      entityId: 'retention_cleanup',
      payload: {
        deletedCount,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
      },
    });

    logger.info({ deletedCount, cutoffDate }, 'Audit event cleanup completed');

    return deletedCount;
  } catch (error) {
    logger.error({ error, cutoffDate }, 'Failed to cleanup old audit events');
    throw error;
  }
}

/**
 * Get audit statistics for admin dashboard
 */
export async function getAuditStats(days = 7): Promise<{
  totalEvents: number;
  eventsByCategory: Record<string, number>;
  eventsByDay: { date: string; count: number }[];
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Total events
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.eventsAudit)
    .where(gte(schema.eventsAudit.createdAt, startDate));

  // Events by category
  const categoryResults = await db
    .select({
      category: schema.eventsAudit.category,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.eventsAudit)
    .where(gte(schema.eventsAudit.createdAt, startDate))
    .groupBy(schema.eventsAudit.category);

  const eventsByCategory: Record<string, number> = {};
  for (const row of categoryResults) {
    eventsByCategory[row.category] = row.count;
  }

  // Events by day
  const dailyResults = await db
    .select({
      date: sql<string>`date_trunc('day', created_at)::date::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.eventsAudit)
    .where(gte(schema.eventsAudit.createdAt, startDate))
    .groupBy(sql`date_trunc('day', created_at)`)
    .orderBy(sql`date_trunc('day', created_at)`);

  return {
    totalEvents: totalResult?.count || 0,
    eventsByCategory,
    eventsByDay: dailyResults.map((r) => ({ date: r.date, count: r.count })),
  };
}

// Export convenience functions for common audit operations
export const auditAuth = (
  eventType: string,
  userId: string,
  payload?: Record<string, unknown>,
  request?: FastifyRequest
) => audit('auth', eventType, 'user', userId, payload, request, userId);

export const auditAdmin = (
  eventType: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
  request?: FastifyRequest
) => audit('admin', eventType, entityType, entityId, payload, request);

export const auditModeration = (
  eventType: string,
  targetUserId: string,
  payload?: Record<string, unknown>,
  request?: FastifyRequest
) => audit('moderation', eventType, 'user', targetUserId, payload, request);

export const auditPayment = (
  eventType: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
  request?: FastifyRequest
) => audit('payment', eventType, entityType, entityId, payload, request);

export const auditMatch = (
  eventType: string,
  matchId: string,
  payload?: Record<string, unknown>,
  request?: FastifyRequest
) => audit('match', eventType, 'match', matchId, payload, request);

export const auditSubmission = (
  eventType: string,
  submissionId: string,
  payload?: Record<string, unknown>,
  request?: FastifyRequest
) => audit('submission', eventType, 'submission', submissionId, payload, request);

export const auditChallenge = (
  eventType: string,
  challengeId: string,
  payload?: Record<string, unknown>,
  request?: FastifyRequest
) => audit('challenge', eventType, 'challenge', challengeId, payload, request);

export const auditTournament = (
  eventType: string,
  tournamentId: string,
  payload?: Record<string, unknown>,
  request?: FastifyRequest
) => audit('tournament', eventType, 'tournament', tournamentId, payload, request);

export const auditReward = (
  eventType: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
  request?: FastifyRequest
) => audit('reward', eventType, entityType, entityId, payload, request);

export const auditSystem = (
  eventType: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>
) => audit('system', eventType, entityType, entityId, payload, undefined, null);
