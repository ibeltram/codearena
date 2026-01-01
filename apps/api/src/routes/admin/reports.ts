/**
 * Admin Report Management Routes
 *
 * API endpoints for admin management of user reports.
 *
 * Endpoints:
 * - GET /api/admin/reports - List all reports (with pagination/filters)
 * - GET /api/admin/reports/:id - Get report details
 * - PATCH /api/admin/reports/:id/status - Update report status
 * - POST /api/admin/reports/:id/resolve - Resolve a report
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, desc, count, and, or, ilike } from 'drizzle-orm';

import { db, schema } from '../../db';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { auditModeration, AuditEventTypes } from '../../lib/audit-service';
import { type UserRole } from '../../plugins';

const { userReports, users } = schema;

// Request parameter schemas
const reportIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Query parameter schema
const listReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'in_review', 'resolved', 'dismissed']).optional(),
  reason: z.enum(['cheating', 'harassment', 'inappropriate_content', 'spam', 'other']).optional(),
  search: z.string().optional(),
});

// Status update body schema
const updateStatusSchema = z.object({
  status: z.enum(['pending', 'in_review', 'resolved', 'dismissed']),
});

// Resolve report body schema
const resolveReportSchema = z.object({
  resolution: z.enum(['resolved', 'dismissed']),
  notes: z.string().min(5).max(2000),
  actionTaken: z.enum(['none', 'warn', 'suspend', 'ban']).optional().default('none'),
});

// Reason labels for display
const reasonLabels: Record<string, string> = {
  cheating: 'Cheating/Unfair Play',
  harassment: 'Harassment',
  inappropriate_content: 'Inappropriate Content',
  spam: 'Spam/Bot Activity',
  other: 'Other',
};

// Status labels for display
const statusLabels: Record<string, string> = {
  pending: 'Pending Review',
  in_review: 'Under Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

// Admin/Moderator roles
const MODERATOR_ROLES: UserRole[] = ['admin', 'moderator'];

export async function adminReportRoutes(app: FastifyInstance) {
  // Apply authentication and role check to all routes in this plugin
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole(MODERATOR_ROLES));

  // GET /api/admin/reports - List all reports
  app.get('/api/admin/reports', async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = listReportsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { page, limit, status, reason, search } = queryResult.data;
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [];

    if (status) {
      conditions.push(eq(userReports.status, status));
    }

    if (reason) {
      conditions.push(eq(userReports.reason, reason));
    }

    // Search by reporter or reported user
    // Note: This is simplified; proper search would involve joining

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(userReports)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult?.total ?? 0;

    // Get reports with user info
    // Using aliases for multiple user joins
    const reporterUsers = schema.users;
    const reportedUsers = schema.users;

    const reports = await db
      .select({
        id: userReports.id,
        reason: userReports.reason,
        description: userReports.description,
        evidenceJson: userReports.evidenceJson,
        status: userReports.status,
        reviewNotes: userReports.reviewNotes,
        createdAt: userReports.createdAt,
        updatedAt: userReports.updatedAt,
        resolvedAt: userReports.resolvedAt,
        reporterUserId: userReports.reporterUserId,
        reportedUserId: userReports.reportedUserId,
        reviewedByUserId: userReports.reviewedByUserId,
      })
      .from(userReports)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(userReports.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch user details separately for simplicity
    const userIds = new Set<string>();
    reports.forEach((r) => {
      userIds.add(r.reporterUserId);
      userIds.add(r.reportedUserId);
      if (r.reviewedByUserId) userIds.add(r.reviewedByUserId);
    });

    const usersList = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isBanned: users.isBanned,
      })
      .from(users)
      .where(or(...Array.from(userIds).map((id) => eq(users.id, id))));

    const usersMap = new Map(usersList.map((u) => [u.id, u]));

    const enrichedReports = reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      reasonLabel: reasonLabels[r.reason] || r.reason,
      description: r.description,
      evidence: r.evidenceJson,
      status: r.status,
      statusLabel: statusLabels[r.status] || r.status,
      reviewNotes: r.reviewNotes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      resolvedAt: r.resolvedAt,
      reporter: usersMap.get(r.reporterUserId) || { id: r.reporterUserId, displayName: 'Unknown' },
      reportedUser: usersMap.get(r.reportedUserId) || { id: r.reportedUserId, displayName: 'Unknown' },
      reviewedBy: r.reviewedByUserId ? usersMap.get(r.reviewedByUserId) : null,
    }));

    return {
      data: enrichedReports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // GET /api/admin/reports/:id - Get report details
  app.get('/api/admin/reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = reportIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid report ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: reportId } = paramResult.data;

    const [report] = await db
      .select()
      .from(userReports)
      .where(eq(userReports.id, reportId));

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    // Get user details
    const userIds = [report.reporterUserId, report.reportedUserId];
    if (report.reviewedByUserId) userIds.push(report.reviewedByUserId);

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
      .where(or(...userIds.map((id) => eq(users.id, id))));

    const usersMap = new Map(usersList.map((u) => [u.id, u]));

    // Get previous reports against this user
    const previousReports = await db
      .select({
        id: userReports.id,
        reason: userReports.reason,
        status: userReports.status,
        createdAt: userReports.createdAt,
      })
      .from(userReports)
      .where(
        and(
          eq(userReports.reportedUserId, report.reportedUserId),
          // Exclude current report
        )
      )
      .orderBy(desc(userReports.createdAt))
      .limit(10);

    return {
      id: report.id,
      reason: report.reason,
      reasonLabel: reasonLabels[report.reason] || report.reason,
      description: report.description,
      evidence: report.evidenceJson,
      status: report.status,
      statusLabel: statusLabels[report.status] || report.status,
      reviewNotes: report.reviewNotes,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      resolvedAt: report.resolvedAt,
      reporter: usersMap.get(report.reporterUserId),
      reportedUser: usersMap.get(report.reportedUserId),
      reviewedBy: report.reviewedByUserId ? usersMap.get(report.reviewedByUserId) : null,
      previousReports: previousReports.filter((r) => r.id !== report.id).map((r) => ({
        ...r,
        reasonLabel: reasonLabels[r.reason] || r.reason,
        statusLabel: statusLabels[r.status] || r.status,
      })),
    };
  });

  // PATCH /api/admin/reports/:id/status - Update report status
  app.patch('/api/admin/reports/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const moderatorId = request.user!.id;

    const paramResult = reportIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid report ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = updateStatusSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { id: reportId } = paramResult.data;
    const { status } = bodyResult.data;

    // Get report
    const [report] = await db
      .select()
      .from(userReports)
      .where(eq(userReports.id, reportId));

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const previousStatus = report.status;

    // Update report
    const [updatedReport] = await db
      .update(userReports)
      .set({
        status,
        reviewedByUserId: moderatorId,
        updatedAt: new Date(),
        resolvedAt: status === 'resolved' || status === 'dismissed' ? new Date() : null,
      })
      .where(eq(userReports.id, reportId))
      .returning();

    // Create audit event
    await auditModeration(
      AuditEventTypes.moderation.REPORT_REVIEWED,
      report.reportedUserId,
      {
        reportId,
        previousStatus,
        newStatus: status,
        moderatorId,
      },
      request
    );

    return {
      id: updatedReport.id,
      status: updatedReport.status,
      statusLabel: statusLabels[updatedReport.status] || updatedReport.status,
      message: `Report status updated to ${statusLabels[status] || status}`,
    };
  });

  // POST /api/admin/reports/:id/resolve - Resolve a report with action
  app.post('/api/admin/reports/:id/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const moderatorId = request.user!.id;

    const paramResult = reportIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid report ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = resolveReportSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { id: reportId } = paramResult.data;
    const { resolution, notes, actionTaken } = bodyResult.data;

    // Get report
    const [report] = await db
      .select()
      .from(userReports)
      .where(eq(userReports.id, reportId));

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    // Update report
    const [updatedReport] = await db
      .update(userReports)
      .set({
        status: resolution,
        reviewNotes: notes,
        reviewedByUserId: moderatorId,
        updatedAt: new Date(),
        resolvedAt: new Date(),
      })
      .where(eq(userReports.id, reportId))
      .returning();

    // Apply action to reported user if needed
    if (actionTaken === 'ban') {
      await db
        .update(users)
        .set({ isBanned: true })
        .where(eq(users.id, report.reportedUserId));

      await auditModeration(
        AuditEventTypes.moderation.USER_BAN,
        report.reportedUserId,
        {
          reason: `Report resolution: ${report.reason}`,
          reportId,
          moderatorId,
        },
        request
      );
    }

    // Create audit event for resolution
    await auditModeration(
      AuditEventTypes.moderation.REPORT_RESOLVED,
      report.reportedUserId,
      {
        reportId,
        resolution,
        actionTaken,
        notes,
        moderatorId,
      },
      request
    );

    return {
      id: updatedReport.id,
      status: updatedReport.status,
      statusLabel: statusLabels[updatedReport.status] || updatedReport.status,
      actionTaken,
      message: `Report ${resolution === 'resolved' ? 'resolved' : 'dismissed'}${actionTaken !== 'none' ? ` with ${actionTaken} action` : ''}`,
    };
  });

  // GET /api/admin/reports/stats - Get report statistics
  app.get('/api/admin/reports/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    // Count by status
    const statusCounts = await db
      .select({
        status: userReports.status,
        count: count(),
      })
      .from(userReports)
      .groupBy(userReports.status);

    // Count by reason
    const reasonCounts = await db
      .select({
        reason: userReports.reason,
        count: count(),
      })
      .from(userReports)
      .groupBy(userReports.reason);

    // Total pending
    const pendingCount = statusCounts.find((s) => s.status === 'pending')?.count || 0;

    return {
      totalPending: pendingCount,
      byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s.count])),
      byReason: Object.fromEntries(reasonCounts.map((r) => [r.reason, r.count])),
    };
  });
}
