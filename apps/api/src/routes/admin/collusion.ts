/**
 * Admin Collusion Detection Routes
 *
 * API endpoints for moderators to manage collusion alerts.
 *
 * Endpoints:
 * - GET /api/admin/collusion/alerts - List all collusion alerts
 * - GET /api/admin/collusion/alerts/:id - Get alert details
 * - PATCH /api/admin/collusion/alerts/:id - Update alert status
 * - GET /api/admin/collusion/stats - Get collusion statistics
 * - POST /api/admin/collusion/scan/:userId - Run detection for a user
 * - GET /api/admin/collusion/user/:userId/history - Get user's collusion history
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';

import { db, schema } from '../../db';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { auditModeration, AuditEventTypes } from '../../lib/audit-service';
import { type UserRole } from '../../plugins';
import {
  getPendingAlerts,
  updateAlertStatus,
  getAlertStats,
  detectAndAlertForUser,
  getUserCollusionHistory,
  COLLUSION_CONFIG,
} from '../../lib/collusion-detection';

const { collusionAlerts, users } = schema;

// Request parameter schemas
const alertIdParamSchema = z.object({
  id: z.string().uuid(),
});

const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

// Query parameter schema for listing alerts
const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'investigating', 'confirmed', 'dismissed']).optional(),
  alertType: z
    .enum([
      'frequent_opponent',
      'intentional_forfeit',
      'stake_anomaly',
      'win_trading',
      'rating_manipulation',
    ])
    .optional(),
  minConfidence: z.coerce.number().int().min(0).max(100).optional(),
});

// Status update body schema
const updateAlertStatusSchema = z.object({
  status: z.enum(['investigating', 'confirmed', 'dismissed']),
  reviewNotes: z.string().min(5).max(2000).optional(),
});

// Alert type labels for display
const alertTypeLabels: Record<string, string> = {
  frequent_opponent: 'Frequent Opponent',
  intentional_forfeit: 'Intentional Forfeit',
  stake_anomaly: 'Stake Anomaly',
  win_trading: 'Win Trading',
  rating_manipulation: 'Rating Manipulation',
};

// Status labels for display
const statusLabels: Record<string, string> = {
  pending: 'Pending Review',
  investigating: 'Under Investigation',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
};

// Admin/Moderator roles
const MODERATOR_ROLES: UserRole[] = ['admin', 'moderator'];

export async function adminCollusionRoutes(app: FastifyInstance) {
  // Apply authentication and role check to all routes in this plugin
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole(MODERATOR_ROLES));

  // GET /api/admin/collusion/alerts - List all collusion alerts
  app.get(
    '/api/admin/collusion/alerts',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const queryResult = listAlertsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', {
          issues: queryResult.error.issues,
        });
      }

      const { page, limit, status, alertType, minConfidence } = queryResult.data;
      const offset = (page - 1) * limit;

      const { alerts, total } = await getPendingAlerts({
        limit,
        offset,
        alertType,
        minConfidence,
      });

      // Filter by status if needed (getPendingAlerts returns pending/investigating)
      const filteredAlerts = status
        ? alerts.filter((a) => a.status === status)
        : alerts;

      const enrichedAlerts = filteredAlerts.map((alert) => ({
        id: alert.id,
        alertType: alert.alertType,
        alertTypeLabel: alertTypeLabels[alert.alertType] || alert.alertType,
        confidenceScore: alert.confidenceScore,
        severity: alert.severity,
        status: alert.status,
        statusLabel: statusLabels[alert.status] || alert.status,
        description: alert.description,
        evidence: alert.evidenceJson,
        createdAt: alert.createdAt,
        updatedAt: alert.updatedAt,
        resolvedAt: alert.resolvedAt,
        user: alert.user
          ? {
              id: alert.user.id,
              displayName: alert.user.displayName,
              email: alert.user.email,
            }
          : null,
        relatedUser: alert.relatedUser
          ? {
              id: alert.relatedUser.id,
              displayName: alert.relatedUser.displayName,
              email: alert.relatedUser.email,
            }
          : null,
      }));

      return {
        data: enrichedAlerts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  );

  // GET /api/admin/collusion/alerts/:id - Get alert details
  app.get(
    '/api/admin/collusion/alerts/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramResult = alertIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid alert ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id: alertId } = paramResult.data;

      const [alert] = await db
        .select()
        .from(collusionAlerts)
        .where(eq(collusionAlerts.id, alertId));

      if (!alert) {
        throw new NotFoundError('Collusion alert', alertId);
      }

      // Get user details
      const userIds = [alert.userId];
      if (alert.relatedUserId) userIds.push(alert.relatedUserId);
      if (alert.reviewedByUserId) userIds.push(alert.reviewedByUserId);

      const usersList = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          email: users.email,
          isBanned: users.isBanned,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userIds[0]));

      // Get additional users if needed
      const additionalUsers =
        userIds.length > 1
          ? await Promise.all(
              userIds.slice(1).map((id) =>
                db
                  .select({
                    id: users.id,
                    displayName: users.displayName,
                    avatarUrl: users.avatarUrl,
                    email: users.email,
                    isBanned: users.isBanned,
                    createdAt: users.createdAt,
                  })
                  .from(users)
                  .where(eq(users.id, id))
                  .then((r) => r[0])
              )
            )
          : [];

      const allUsers = [...usersList, ...additionalUsers.filter(Boolean)];
      const usersMap = new Map(allUsers.map((u) => [u.id, u]));

      // Get previous alerts for this user
      const previousAlerts = await db
        .select({
          id: collusionAlerts.id,
          alertType: collusionAlerts.alertType,
          status: collusionAlerts.status,
          confidenceScore: collusionAlerts.confidenceScore,
          createdAt: collusionAlerts.createdAt,
        })
        .from(collusionAlerts)
        .where(eq(collusionAlerts.userId, alert.userId))
        .orderBy(desc(collusionAlerts.createdAt))
        .limit(10);

      return {
        id: alert.id,
        alertType: alert.alertType,
        alertTypeLabel: alertTypeLabels[alert.alertType] || alert.alertType,
        confidenceScore: alert.confidenceScore,
        severity: alert.severity,
        status: alert.status,
        statusLabel: statusLabels[alert.status] || alert.status,
        description: alert.description,
        evidence: alert.evidenceJson,
        reviewNotes: alert.reviewNotes,
        createdAt: alert.createdAt,
        updatedAt: alert.updatedAt,
        resolvedAt: alert.resolvedAt,
        user: usersMap.get(alert.userId),
        relatedUser: alert.relatedUserId
          ? usersMap.get(alert.relatedUserId)
          : null,
        reviewedBy: alert.reviewedByUserId
          ? usersMap.get(alert.reviewedByUserId)
          : null,
        previousAlerts: previousAlerts
          .filter((a) => a.id !== alert.id)
          .map((a) => ({
            ...a,
            alertTypeLabel: alertTypeLabels[a.alertType] || a.alertType,
            statusLabel: statusLabels[a.status] || a.status,
          })),
        config: COLLUSION_CONFIG,
      };
    }
  );

  // PATCH /api/admin/collusion/alerts/:id - Update alert status
  app.patch(
    '/api/admin/collusion/alerts/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const moderatorId = request.user!.id;

      const paramResult = alertIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid alert ID', {
          issues: paramResult.error.issues,
        });
      }

      const bodyResult = updateAlertStatusSchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new ValidationError('Invalid request body', {
          issues: bodyResult.error.issues,
        });
      }

      const { id: alertId } = paramResult.data;
      const { status, reviewNotes } = bodyResult.data;

      // Get current alert
      const [currentAlert] = await db
        .select()
        .from(collusionAlerts)
        .where(eq(collusionAlerts.id, alertId));

      if (!currentAlert) {
        throw new NotFoundError('Collusion alert', alertId);
      }

      const previousStatus = currentAlert.status;

      // Update alert
      const updatedAlert = await updateAlertStatus(alertId, {
        status,
        reviewedByUserId: moderatorId,
        reviewNotes,
      });

      if (!updatedAlert) {
        throw new NotFoundError('Collusion alert', alertId);
      }

      // Create audit event
      await auditModeration(
        AuditEventTypes.moderation.REPORT_REVIEWED,
        currentAlert.userId,
        {
          alertId,
          alertType: currentAlert.alertType,
          previousStatus,
          newStatus: status,
          moderatorId,
          reviewNotes,
        },
        request
      );

      return {
        id: updatedAlert.id,
        status: updatedAlert.status,
        statusLabel: statusLabels[updatedAlert.status] || updatedAlert.status,
        message: `Alert status updated to ${statusLabels[status] || status}`,
      };
    }
  );

  // GET /api/admin/collusion/stats - Get collusion statistics
  app.get(
    '/api/admin/collusion/stats',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const stats = await getAlertStats();

      return {
        summary: {
          pendingCount: stats.pending,
          investigatingCount: stats.investigating,
          confirmedToday: stats.confirmedToday,
          dismissedToday: stats.dismissedToday,
          averageConfidence: stats.avgConfidence,
        },
        byType: Object.entries(stats.byType).map(([type, count]) => ({
          type,
          typeLabel: alertTypeLabels[type] || type,
          count,
        })),
        thresholds: {
          frequentOpponent: {
            matchThreshold:
              COLLUSION_CONFIG.FREQUENT_OPPONENT.MATCH_THRESHOLD,
            windowDays: COLLUSION_CONFIG.FREQUENT_OPPONENT.WINDOW_DAYS,
          },
          intentionalForfeit: {
            forfeitThreshold:
              COLLUSION_CONFIG.INTENTIONAL_FORFEIT.FORFEIT_THRESHOLD,
            windowDays: COLLUSION_CONFIG.INTENTIONAL_FORFEIT.WINDOW_DAYS,
          },
          winTrading: {
            minMatches: COLLUSION_CONFIG.WIN_TRADING.MIN_MATCHES,
            windowDays: COLLUSION_CONFIG.WIN_TRADING.WINDOW_DAYS,
            winRatioRange: [
              COLLUSION_CONFIG.WIN_TRADING.WIN_RATIO_MIN,
              COLLUSION_CONFIG.WIN_TRADING.WIN_RATIO_MAX,
            ],
          },
        },
      };
    }
  );

  // POST /api/admin/collusion/scan/:userId - Run detection for a user
  app.post(
    '/api/admin/collusion/scan/:userId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramResult = userIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid user ID', {
          issues: paramResult.error.issues,
        });
      }

      const { userId } = paramResult.data;

      // Verify user exists
      const [user] = await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId));

      if (!user) {
        throw new NotFoundError('User', userId);
      }

      // Run detection
      const alerts = await detectAndAlertForUser(userId);

      // Create audit event
      await auditModeration(
        AuditEventTypes.admin.SETTINGS_CHANGED,
        userId,
        {
          action: 'collusion_scan',
          userId,
          alertsGenerated: alerts.length,
          alertTypes: alerts.map((a) => a.alertType),
        },
        request
      );

      return {
        userId,
        userDisplayName: user.displayName,
        alertsGenerated: alerts.length,
        alerts: alerts.map((alert) => ({
          id: alert.id,
          alertType: alert.alertType,
          alertTypeLabel: alertTypeLabels[alert.alertType] || alert.alertType,
          confidenceScore: alert.confidenceScore,
          severity: alert.severity,
          status: alert.status,
          description: alert.description,
        })),
        message:
          alerts.length > 0
            ? `Generated ${alerts.length} alert(s) for user ${user.displayName}`
            : `No suspicious patterns detected for user ${user.displayName}`,
      };
    }
  );

  // GET /api/admin/collusion/user/:userId/history - Get user's collusion history
  app.get(
    '/api/admin/collusion/user/:userId/history',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramResult = userIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid user ID', {
          issues: paramResult.error.issues,
        });
      }

      const { userId } = paramResult.data;

      // Verify user exists
      const [user] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          email: users.email,
          isBanned: users.isBanned,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user) {
        throw new NotFoundError('User', userId);
      }

      // Get collusion history
      const history = await getUserCollusionHistory(userId);

      // Count by status
      const statusCounts = {
        pending: 0,
        investigating: 0,
        confirmed: 0,
        dismissed: 0,
      };

      for (const alert of history) {
        statusCounts[alert.status as keyof typeof statusCounts]++;
      }

      return {
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          isBanned: user.isBanned,
        },
        summary: {
          totalAlerts: history.length,
          ...statusCounts,
        },
        alerts: history.map((alert) => ({
          id: alert.id,
          alertType: alert.alertType,
          alertTypeLabel: alertTypeLabels[alert.alertType] || alert.alertType,
          confidenceScore: alert.confidenceScore,
          severity: alert.severity,
          status: alert.status,
          statusLabel: statusLabels[alert.status] || alert.status,
          description: alert.description,
          evidence: alert.evidenceJson,
          reviewNotes: alert.reviewNotes,
          createdAt: alert.createdAt,
          resolvedAt: alert.resolvedAt,
          isMainUser: alert.userId === userId,
        })),
      };
    }
  );
}
