/**
 * Feature Flags API Routes
 *
 * Endpoints for retrieving and managing feature flags
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getFeatureFlags,
  getAllFlagDefinitions,
  updateFlag,
  isFeatureEnabled,
  FeatureFlagContext,
} from '../lib/feature-flags.js';
import { z } from 'zod';

// Schema for flag update
const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
  enabledForUsers: z.array(z.string()).optional(),
  enabledForEmails: z.array(z.string()).optional(),
});

// Schema for flag check
const checkFlagSchema = z.object({
  flagKey: z.string(),
});

export async function featureFlagsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/feature-flags
   * Get all feature flags for the current user
   */
  fastify.get('/api/feature-flags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Build context from authenticated user
      const context: FeatureFlagContext = {
        userId: (request as { userId?: string }).userId,
        email: (request as { userEmail?: string }).userEmail,
        anonymous: !(request as { userId?: string }).userId,
      };

      const flags = await getFeatureFlags(context);

      return reply.send({
        flags,
        context: {
          userId: context.userId || null,
          anonymous: context.anonymous,
        },
      });
    } catch (error) {
      request.log.error(error, 'Failed to get feature flags');
      return reply.status(500).send({ error: 'Failed to get feature flags' });
    }
  });

  /**
   * GET /api/feature-flags/:flagKey
   * Check if a specific feature flag is enabled
   */
  fastify.get(
    '/api/feature-flags/:flagKey',
    async (
      request: FastifyRequest<{ Params: { flagKey: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { flagKey } = request.params;

        const context: FeatureFlagContext = {
          userId: (request as { userId?: string }).userId,
          email: (request as { userEmail?: string }).userEmail,
          anonymous: !(request as { userId?: string }).userId,
        };

        const enabled = await isFeatureEnabled(flagKey, context);

        return reply.send({
          flagKey,
          enabled,
        });
      } catch (error) {
        request.log.error(error, 'Failed to check feature flag');
        return reply.status(500).send({ error: 'Failed to check feature flag' });
      }
    }
  );

  /**
   * POST /api/feature-flags/check
   * Check multiple flags at once
   */
  fastify.post(
    '/api/feature-flags/check',
    async (
      request: FastifyRequest<{ Body: { flagKeys: string[] } }>,
      reply: FastifyReply
    ) => {
      try {
        const { flagKeys } = request.body || { flagKeys: [] };

        if (!Array.isArray(flagKeys)) {
          return reply.status(400).send({ error: 'flagKeys must be an array' });
        }

        const context: FeatureFlagContext = {
          userId: (request as { userId?: string }).userId,
          email: (request as { userEmail?: string }).userEmail,
          anonymous: !(request as { userId?: string }).userId,
        };

        const results: Record<string, boolean> = {};
        for (const key of flagKeys) {
          results[key] = await isFeatureEnabled(key, context);
        }

        return reply.send({ flags: results });
      } catch (error) {
        request.log.error(error, 'Failed to check feature flags');
        return reply.status(500).send({ error: 'Failed to check feature flags' });
      }
    }
  );

  /**
   * GET /api/admin/feature-flags
   * Get all flag definitions (admin only)
   */
  fastify.get(
    '/api/admin/feature-flags',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Check admin role
      const userRole = (request as { userRole?: string }).userRole;
      if (userRole !== 'admin') {
        return reply.status(403).send({ error: 'Admin access required' });
      }

      try {
        const flags = getAllFlagDefinitions();

        return reply.send({
          flags,
          total: flags.length,
        });
      } catch (error) {
        request.log.error(error, 'Failed to get flag definitions');
        return reply.status(500).send({ error: 'Failed to get flag definitions' });
      }
    }
  );

  /**
   * PUT /api/admin/feature-flags/:flagKey
   * Update a feature flag (admin only)
   */
  fastify.put(
    '/api/admin/feature-flags/:flagKey',
    async (
      request: FastifyRequest<{
        Params: { flagKey: string };
        Body: z.infer<typeof updateFlagSchema>;
      }>,
      reply: FastifyReply
    ) => {
      // Check admin role
      const userRole = (request as { userRole?: string }).userRole;
      if (userRole !== 'admin') {
        return reply.status(403).send({ error: 'Admin access required' });
      }

      try {
        const { flagKey } = request.params;
        const updates = updateFlagSchema.parse(request.body);

        const success = updateFlag(flagKey, updates);

        if (!success) {
          return reply.status(404).send({ error: 'Feature flag not found' });
        }

        // Log the admin action
        request.log.info(
          { flagKey, updates, adminUserId: (request as { userId?: string }).userId },
          'Feature flag updated by admin'
        );

        return reply.send({
          success: true,
          flagKey,
          updates,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Invalid update data',
            details: error.errors,
          });
        }
        request.log.error(error, 'Failed to update feature flag');
        return reply.status(500).send({ error: 'Failed to update feature flag' });
      }
    }
  );
}
