/**
 * Admin Rewards Routes
 *
 * API endpoints for admin management of rewards partners, inventory, and redemptions.
 *
 * Endpoints:
 * - POST /api/admin/rewards/partners - Create new partner
 * - PUT /api/admin/rewards/partners/:id - Update partner
 * - DELETE /api/admin/rewards/partners/:id - Soft delete (deactivate) partner
 * - GET /api/admin/rewards/inventory - Get inventory status dashboard
 * - POST /api/admin/rewards/inventory/upload - Bulk upload reward codes (CSV)
 * - GET /api/admin/rewards/redemptions - List all redemptions with filters
 * - POST /api/admin/rewards/refund/:id - Process refund for failed redemption
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count, sql, asc } from 'drizzle-orm';

import { db, schema } from '../../db';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../../lib/errors';
import { type UserRole } from '../../plugins';

const {
  partnerRewards,
  rewardInventory,
  rewardRedemptions,
  creditAccounts,
  creditLedgerEntries,
  eventsAudit,
  users,
} = schema;

// Only admins can manage rewards
const ADMIN_ROLES: UserRole[] = ['admin'];

// Tier schema
const tierSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Tier slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  creditsRequired: z.number().int().positive(),
  valueDescription: z.string().min(1).max(200),
});

// Partner request schemas
const createPartnerSchema = z.object({
  partnerSlug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Partner slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(100),
  logoUrl: z.string().url().max(500).optional(),
  description: z.string().min(1).max(2000).optional(),
  rewardType: z.enum(['saas_offset', 'compute_credit']),
  tiers: z.array(tierSchema).min(1).max(10),
});

const updatePartnerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  description: z.string().min(1).max(2000).nullable().optional(),
  rewardType: z.enum(['saas_offset', 'compute_credit']).optional(),
  tiers: z.array(tierSchema).min(1).max(10).optional(),
  isActive: z.boolean().optional(),
});

const partnerIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Inventory query schema
const inventoryQuerySchema = z.object({
  partnerId: z.string().uuid().optional(),
  status: z.enum(['available', 'reserved', 'redeemed', 'expired']).optional(),
});

// Bulk upload schema - CSV format: tier_slug,code,expires_at(optional)
const bulkUploadSchema = z.object({
  partnerId: z.string().uuid(),
  codes: z.array(z.object({
    tierSlug: z.string().min(1).max(50),
    code: z.string().min(1).max(500),
    codeType: z.enum(['single_use', 'multi_use', 'api_generated']).default('single_use'),
    expiresAt: z.string().datetime().optional(),
  })).min(1).max(1000),
});

// Redemptions query schema
const redemptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  partnerId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  status: z.enum(['pending', 'issued', 'activated', 'expired', 'refunded']).optional(),
});

// Refund param schema
const refundIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Refund body schema
const refundBodySchema = z.object({
  reason: z.string().min(10).max(500),
});

export async function adminRewardsRoutes(app: FastifyInstance) {
  // Apply authentication and role check to all routes in this plugin
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole(ADMIN_ROLES));

  /**
   * POST /api/admin/rewards/partners
   * Create a new rewards partner
   */
  app.post('/api/admin/rewards/partners', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodyResult = createPartnerSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { partnerSlug, name, logoUrl, description, rewardType, tiers } = bodyResult.data;

    // Check if slug already exists
    const [existing] = await db
      .select({ id: partnerRewards.id })
      .from(partnerRewards)
      .where(eq(partnerRewards.partnerSlug, partnerSlug));

    if (existing) {
      throw new ConflictError(`Partner with slug '${partnerSlug}' already exists`);
    }

    // Calculate min/max credits from tiers
    const creditsValues = tiers.map(t => t.creditsRequired);
    const creditsRequiredMin = Math.min(...creditsValues);
    const creditsRequiredMax = Math.max(...creditsValues);

    // Create partner
    const [partner] = await db
      .insert(partnerRewards)
      .values({
        partnerSlug,
        name,
        logoUrl,
        description,
        rewardType,
        tiersJson: tiers,
        creditsRequiredMin,
        creditsRequiredMax,
        isActive: true,
      })
      .returning();

    // Create audit log entry
    await db.insert(eventsAudit).values({
      actorUserId: request.user?.id,
      eventType: 'admin.rewards.partner.created',
      entityType: 'partner_reward',
      entityId: partner.id,
      payloadJson: {
        partnerSlug,
        name,
        rewardType,
        tiersCount: tiers.length,
      },
    });

    return reply.status(201).send({
      data: {
        id: partner.id,
        partnerSlug: partner.partnerSlug,
        name: partner.name,
        logoUrl: partner.logoUrl,
        description: partner.description,
        rewardType: partner.rewardType,
        tiers,
        creditsRequiredMin,
        creditsRequiredMax,
        isActive: partner.isActive,
        createdAt: partner.createdAt.toISOString(),
      },
    });
  });

  /**
   * PUT /api/admin/rewards/partners/:id
   * Update an existing rewards partner
   */
  app.put('/api/admin/rewards/partners/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = partnerIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid partner ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = updatePartnerSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { id } = paramResult.data;
    const updates = bodyResult.data;

    // Get existing partner
    const [existing] = await db
      .select()
      .from(partnerRewards)
      .where(eq(partnerRewards.id, id));

    if (!existing) {
      throw new NotFoundError('Partner', id);
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.logoUrl !== undefined) updateData.logoUrl = updates.logoUrl;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.rewardType !== undefined) updateData.rewardType = updates.rewardType;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    if (updates.tiers !== undefined) {
      updateData.tiersJson = updates.tiers;
      const creditsValues = updates.tiers.map(t => t.creditsRequired);
      updateData.creditsRequiredMin = Math.min(...creditsValues);
      updateData.creditsRequiredMax = Math.max(...creditsValues);
    }

    // Update partner
    const [updated] = await db
      .update(partnerRewards)
      .set(updateData)
      .where(eq(partnerRewards.id, id))
      .returning();

    // Create audit log entry
    await db.insert(eventsAudit).values({
      actorUserId: request.user?.id,
      eventType: 'admin.rewards.partner.updated',
      entityType: 'partner_reward',
      entityId: id,
      payloadJson: {
        partnerSlug: updated.partnerSlug,
        changes: Object.keys(updates),
      },
    });

    return {
      data: {
        id: updated.id,
        partnerSlug: updated.partnerSlug,
        name: updated.name,
        logoUrl: updated.logoUrl,
        description: updated.description,
        rewardType: updated.rewardType,
        tiers: updated.tiersJson,
        creditsRequiredMin: updated.creditsRequiredMin,
        creditsRequiredMax: updated.creditsRequiredMax,
        isActive: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  });

  /**
   * DELETE /api/admin/rewards/partners/:id
   * Soft delete (deactivate) a partner
   */
  app.delete('/api/admin/rewards/partners/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = partnerIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid partner ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    // Get existing partner
    const [existing] = await db
      .select()
      .from(partnerRewards)
      .where(eq(partnerRewards.id, id));

    if (!existing) {
      throw new NotFoundError('Partner', id);
    }

    // Soft delete - set isActive to false
    await db
      .update(partnerRewards)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(partnerRewards.id, id));

    // Create audit log entry
    await db.insert(eventsAudit).values({
      actorUserId: request.user?.id,
      eventType: 'admin.rewards.partner.deactivated',
      entityType: 'partner_reward',
      entityId: id,
      payloadJson: {
        partnerSlug: existing.partnerSlug,
        name: existing.name,
      },
    });

    return { success: true };
  });

  /**
   * GET /api/admin/rewards/inventory
   * Get inventory status dashboard with counts by partner and status
   */
  app.get('/api/admin/rewards/inventory', async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = inventoryQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { partnerId, status } = queryResult.data;

    // Build conditions
    const conditions = [];
    if (partnerId) {
      conditions.push(eq(rewardInventory.partnerRewardId, partnerId));
    }
    if (status) {
      conditions.push(eq(rewardInventory.status, status));
    }

    // Get inventory summary grouped by partner and tier
    const inventorySummary = await db
      .select({
        partnerId: rewardInventory.partnerRewardId,
        partnerSlug: partnerRewards.partnerSlug,
        partnerName: partnerRewards.name,
        tierSlug: rewardInventory.tierSlug,
        status: rewardInventory.status,
        count: count(),
      })
      .from(rewardInventory)
      .innerJoin(partnerRewards, eq(rewardInventory.partnerRewardId, partnerRewards.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(
        rewardInventory.partnerRewardId,
        partnerRewards.partnerSlug,
        partnerRewards.name,
        rewardInventory.tierSlug,
        rewardInventory.status
      )
      .orderBy(asc(partnerRewards.name), asc(rewardInventory.tierSlug));

    // Restructure the data for easier consumption
    const partnerMap = new Map<string, {
      partnerId: string;
      partnerSlug: string;
      partnerName: string;
      tiers: Map<string, Record<string, number>>;
    }>();

    for (const row of inventorySummary) {
      if (!partnerMap.has(row.partnerId)) {
        partnerMap.set(row.partnerId, {
          partnerId: row.partnerId,
          partnerSlug: row.partnerSlug,
          partnerName: row.partnerName,
          tiers: new Map(),
        });
      }

      const partner = partnerMap.get(row.partnerId)!;
      if (!partner.tiers.has(row.tierSlug)) {
        partner.tiers.set(row.tierSlug, {
          available: 0,
          reserved: 0,
          redeemed: 0,
          expired: 0,
        });
      }

      const tierStats = partner.tiers.get(row.tierSlug)!;
      tierStats[row.status] = row.count;
    }

    // Convert to array format
    const data = Array.from(partnerMap.values()).map(partner => ({
      partnerId: partner.partnerId,
      partnerSlug: partner.partnerSlug,
      partnerName: partner.partnerName,
      tiers: Array.from(partner.tiers.entries()).map(([tierSlug, stats]) => ({
        tierSlug,
        ...stats,
        total: stats.available + stats.reserved + stats.redeemed + stats.expired,
      })),
    }));

    // Calculate totals
    const totals = {
      available: 0,
      reserved: 0,
      redeemed: 0,
      expired: 0,
    };
    for (const row of inventorySummary) {
      totals[row.status as keyof typeof totals] += row.count;
    }

    return {
      data,
      totals: {
        ...totals,
        total: totals.available + totals.reserved + totals.redeemed + totals.expired,
      },
    };
  });

  /**
   * POST /api/admin/rewards/inventory/upload
   * Bulk upload reward codes
   */
  app.post('/api/admin/rewards/inventory/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodyResult = bulkUploadSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { partnerId, codes } = bodyResult.data;

    // Verify partner exists
    const [partner] = await db
      .select()
      .from(partnerRewards)
      .where(eq(partnerRewards.id, partnerId));

    if (!partner) {
      throw new NotFoundError('Partner', partnerId);
    }

    // Get valid tier slugs from partner
    const validTiers = new Set((partner.tiersJson as Array<{ slug: string }>).map(t => t.slug));

    // Validate all tier slugs
    const invalidTiers = codes.filter(c => !validTiers.has(c.tierSlug));
    if (invalidTiers.length > 0) {
      throw new ValidationError('Invalid tier slugs', {
        invalidTiers: [...new Set(invalidTiers.map(c => c.tierSlug))],
        validTiers: [...validTiers],
      });
    }

    // Insert codes
    const insertData = codes.map(c => ({
      partnerRewardId: partnerId,
      tierSlug: c.tierSlug,
      code: c.code,
      codeType: c.codeType,
      expiresAt: c.expiresAt ? new Date(c.expiresAt) : undefined,
      status: 'available' as const,
    }));

    const inserted = await db
      .insert(rewardInventory)
      .values(insertData)
      .returning({ id: rewardInventory.id });

    // Create audit log entry
    await db.insert(eventsAudit).values({
      actorUserId: request.user?.id,
      eventType: 'admin.rewards.inventory.uploaded',
      entityType: 'partner_reward',
      entityId: partnerId,
      payloadJson: {
        partnerSlug: partner.partnerSlug,
        codesCount: inserted.length,
        tierBreakdown: codes.reduce((acc, c) => {
          acc[c.tierSlug] = (acc[c.tierSlug] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
    });

    return reply.status(201).send({
      success: true,
      uploaded: inserted.length,
    });
  });

  /**
   * GET /api/admin/rewards/redemptions
   * List all redemptions with filters
   */
  app.get('/api/admin/rewards/redemptions', async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = redemptionsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { page, limit, partnerId, userId, status } = queryResult.data;
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [];
    if (partnerId) {
      conditions.push(eq(rewardRedemptions.partnerRewardId, partnerId));
    }
    if (userId) {
      conditions.push(eq(rewardRedemptions.userId, userId));
    }
    if (status) {
      conditions.push(eq(rewardRedemptions.status, status));
    }

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(rewardRedemptions)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult?.total ?? 0;

    // Get redemptions with partner and user info
    const redemptions = await db
      .select({
        id: rewardRedemptions.id,
        userId: rewardRedemptions.userId,
        userEmail: users.email,
        userDisplayName: users.displayName,
        partnerSlug: partnerRewards.partnerSlug,
        partnerName: partnerRewards.name,
        tierSlug: rewardRedemptions.tierSlug,
        creditsSpent: rewardRedemptions.creditsSpent,
        codeIssued: rewardRedemptions.codeIssued,
        status: rewardRedemptions.status,
        issuedAt: rewardRedemptions.issuedAt,
        activatedAt: rewardRedemptions.activatedAt,
        expiresAt: rewardRedemptions.expiresAt,
        createdAt: rewardRedemptions.createdAt,
      })
      .from(rewardRedemptions)
      .innerJoin(partnerRewards, eq(rewardRedemptions.partnerRewardId, partnerRewards.id))
      .innerJoin(users, eq(rewardRedemptions.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(rewardRedemptions.createdAt))
      .limit(limit)
      .offset(offset);

    const data = redemptions.map(r => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.userEmail,
      userDisplayName: r.userDisplayName,
      partnerSlug: r.partnerSlug,
      partnerName: r.partnerName,
      tierSlug: r.tierSlug,
      creditsSpent: r.creditsSpent,
      codeIssued: r.codeIssued, // Admin can see the code
      status: r.status,
      issuedAt: r.issuedAt?.toISOString() || null,
      activatedAt: r.activatedAt?.toISOString() || null,
      expiresAt: r.expiresAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  /**
   * POST /api/admin/rewards/refund/:id
   * Process refund for a failed redemption
   */
  app.post('/api/admin/rewards/refund/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = refundIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid redemption ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = refundBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { id } = paramResult.data;
    const { reason } = bodyResult.data;

    // Get redemption
    const [redemption] = await db
      .select({
        id: rewardRedemptions.id,
        userId: rewardRedemptions.userId,
        partnerRewardId: rewardRedemptions.partnerRewardId,
        tierSlug: rewardRedemptions.tierSlug,
        creditsSpent: rewardRedemptions.creditsSpent,
        status: rewardRedemptions.status,
        partnerSlug: partnerRewards.partnerSlug,
        partnerName: partnerRewards.name,
      })
      .from(rewardRedemptions)
      .innerJoin(partnerRewards, eq(rewardRedemptions.partnerRewardId, partnerRewards.id))
      .where(eq(rewardRedemptions.id, id));

    if (!redemption) {
      throw new NotFoundError('Redemption', id);
    }

    // Check if already refunded
    if (redemption.status === 'refunded') {
      return reply.status(400).send({
        error: 'already_refunded',
        errorDescription: 'This redemption has already been refunded',
      });
    }

    // Only allow refund for certain statuses
    const refundableStatuses = ['pending', 'issued', 'expired'];
    if (!refundableStatuses.includes(redemption.status)) {
      return reply.status(400).send({
        error: 'not_refundable',
        errorDescription: `Redemption with status '${redemption.status}' cannot be refunded`,
      });
    }

    // Process refund in transaction
    await db.transaction(async (tx) => {
      // Get user's credit account
      const [account] = await tx
        .select()
        .from(creditAccounts)
        .where(eq(creditAccounts.userId, redemption.userId));

      if (!account) {
        throw new NotFoundError('Credit account for user', redemption.userId);
      }

      // Refund credits
      await tx
        .update(creditAccounts)
        .set({
          balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${redemption.creditsSpent}`,
          updatedAt: new Date(),
        })
        .where(eq(creditAccounts.id, account.id));

      // Create ledger entry
      const idempotencyKey = `refund-${id}-${Date.now()}`;
      await tx.insert(creditLedgerEntries).values({
        idempotencyKey,
        accountId: account.id,
        type: 'refund',
        amount: redemption.creditsSpent,
        metadataJson: {
          redemptionId: id,
          partnerSlug: redemption.partnerSlug,
          tierSlug: redemption.tierSlug,
          reason,
          refundedBy: request.user?.id,
        },
      });

      // Update redemption status
      await tx
        .update(rewardRedemptions)
        .set({ status: 'refunded' })
        .where(eq(rewardRedemptions.id, id));

      // Create audit log entry
      await tx.insert(eventsAudit).values({
        actorUserId: request.user?.id,
        eventType: 'admin.rewards.redemption.refunded',
        entityType: 'reward_redemption',
        entityId: id,
        payloadJson: {
          userId: redemption.userId,
          partnerSlug: redemption.partnerSlug,
          tierSlug: redemption.tierSlug,
          creditsRefunded: redemption.creditsSpent,
          reason,
        },
      });
    });

    return {
      success: true,
      refunded: {
        redemptionId: id,
        creditsRefunded: redemption.creditsSpent,
        userId: redemption.userId,
      },
    };
  });

  /**
   * GET /api/admin/rewards/partners
   * List all partners (including inactive) for admin
   */
  app.get('/api/admin/rewards/partners', async (request: FastifyRequest, reply: FastifyReply) => {
    const partners = await db
      .select()
      .from(partnerRewards)
      .orderBy(asc(partnerRewards.name));

    return {
      data: partners.map(p => ({
        id: p.id,
        partnerSlug: p.partnerSlug,
        name: p.name,
        logoUrl: p.logoUrl,
        description: p.description,
        rewardType: p.rewardType,
        tiers: p.tiersJson,
        creditsRequiredMin: p.creditsRequiredMin,
        creditsRequiredMax: p.creditsRequiredMax,
        isActive: p.isActive,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  });
}
