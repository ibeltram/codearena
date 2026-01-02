/**
 * Admin Secrets Management Routes
 *
 * Provides admin endpoints for:
 * - Viewing secrets metadata (not values)
 * - Viewing audit logs
 * - Rotating secrets
 * - Health checking secrets provider
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getSecretsManager, SecretAuditEntry } from '../../lib/secrets';
import { logger } from '../../lib/logger';

// Request/Response schemas
const auditLogQuerySchema = z.object({
  secretName: z.string().optional(),
  action: z.enum(['read', 'write', 'rotate', 'delete']).optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
});

const rotateSecretSchema = z.object({
  secretName: z.string().min(1),
  newValue: z.string().optional(),
});

interface AuditLogResponse {
  entries: SecretAuditEntry[];
  total: number;
}

interface SecretsHealthResponse {
  healthy: boolean;
  provider: string;
  message?: string;
  cacheEnabled: boolean;
  auditEnabled: boolean;
}

interface SecretMetadataResponse {
  name: string;
  provider: string;
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
  version?: string;
}

interface RotateSecretResponse {
  success: boolean;
  secretName: string;
  message: string;
}

const adminSecretsRoutes: FastifyPluginAsync = async (fastify) => {
  // Check if user is admin middleware
  fastify.addHook('preHandler', async (request, reply) => {
    // In production, verify admin role from session/JWT
    const isAdmin = request.headers['x-admin-token'] === process.env.ADMIN_TOKEN ||
      process.env.NODE_ENV === 'development';

    if (!isAdmin) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }
  });

  /**
   * GET /api/admin/secrets/health
   * Check the health of the secrets provider
   */
  fastify.get<{
    Reply: SecretsHealthResponse;
  }>('/health', {
    schema: {
      description: 'Check secrets provider health',
      tags: ['admin', 'secrets'],
      response: {
        200: {
          type: 'object',
          properties: {
            healthy: { type: 'boolean' },
            provider: { type: 'string' },
            message: { type: 'string' },
            cacheEnabled: { type: 'boolean' },
            auditEnabled: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const manager = getSecretsManager();
    const health = await manager.healthCheck();

    return {
      healthy: health.healthy,
      provider: health.provider,
      message: health.message,
      cacheEnabled: process.env.SECRETS_CACHE_ENABLED !== 'false',
      auditEnabled: process.env.SECRETS_AUDIT_ENABLED !== 'false',
    };
  });

  /**
   * GET /api/admin/secrets/audit
   * Get secrets access audit log
   */
  fastify.get<{
    Querystring: z.infer<typeof auditLogQuerySchema>;
    Reply: AuditLogResponse;
  }>('/audit', {
    schema: {
      description: 'Get secrets access audit log',
      tags: ['admin', 'secrets'],
      querystring: {
        type: 'object',
        properties: {
          secretName: { type: 'string' },
          action: { type: 'string', enum: ['read', 'write', 'rotate', 'delete'] },
          since: { type: 'string', format: 'date-time' },
          limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string' },
                  action: { type: 'string' },
                  secretName: { type: 'string' },
                  provider: { type: 'string' },
                  success: { type: 'boolean' },
                  error: { type: 'string' },
                },
              },
            },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const query = auditLogQuerySchema.parse(request.query);
    const manager = getSecretsManager();

    const entries = manager.getAuditLog({
      secretName: query.secretName,
      action: query.action,
      since: query.since ? new Date(query.since) : undefined,
      limit: query.limit,
    });

    return {
      entries,
      total: entries.length,
    };
  });

  /**
   * GET /api/admin/secrets/metadata/:name
   * Get metadata for a specific secret (not the value!)
   */
  fastify.get<{
    Params: { name: string };
    Reply: SecretMetadataResponse | { error: string };
  }>('/metadata/:name', {
    schema: {
      description: 'Get secret metadata (not value)',
      tags: ['admin', 'secrets'],
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            provider: { type: 'string' },
            createdAt: { type: 'string' },
            lastAccessed: { type: 'string' },
            accessCount: { type: 'number' },
            version: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { name } = request.params;
    const manager = getSecretsManager();

    const metadata = manager.getMetadata(name);

    if (!metadata) {
      return reply.status(404).send({
        error: 'Secret metadata not found',
      });
    }

    return {
      name: metadata.name,
      provider: metadata.provider,
      createdAt: metadata.createdAt.toISOString(),
      lastAccessed: metadata.lastAccessed.toISOString(),
      accessCount: metadata.accessCount,
      version: metadata.version,
    };
  });

  /**
   * POST /api/admin/secrets/rotate
   * Rotate a secret
   */
  fastify.post<{
    Body: z.infer<typeof rotateSecretSchema>;
    Reply: RotateSecretResponse;
  }>('/rotate', {
    schema: {
      description: 'Rotate a secret',
      tags: ['admin', 'secrets'],
      body: {
        type: 'object',
        properties: {
          secretName: { type: 'string' },
          newValue: { type: 'string' },
        },
        required: ['secretName'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            secretName: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = rotateSecretSchema.parse(request.body);
    const manager = getSecretsManager();

    logger.info({ secretName: body.secretName }, 'Admin initiated secret rotation');

    const success = await manager.rotateSecret(body.secretName, body.newValue);

    return {
      success,
      secretName: body.secretName,
      message: success
        ? 'Secret rotated successfully'
        : 'Failed to rotate secret (check logs for details)',
    };
  });

  /**
   * POST /api/admin/secrets/cache/clear
   * Clear the secrets cache
   */
  fastify.post<{
    Reply: { success: boolean; message: string };
  }>('/cache/clear', {
    schema: {
      description: 'Clear secrets cache',
      tags: ['admin', 'secrets'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const manager = getSecretsManager();
    manager.clearCache();

    logger.info('Admin cleared secrets cache');

    return {
      success: true,
      message: 'Secrets cache cleared',
    };
  });

  /**
   * GET /api/admin/secrets/config
   * Get current secrets configuration (sanitized)
   */
  fastify.get<{
    Reply: {
      provider: string;
      cacheEnabled: boolean;
      cacheTTL: number;
      auditEnabled: boolean;
      auditLevel: string;
      vaultConfigured: boolean;
      awsConfigured: boolean;
    };
  }>('/config', {
    schema: {
      description: 'Get secrets configuration',
      tags: ['admin', 'secrets'],
      response: {
        200: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            cacheEnabled: { type: 'boolean' },
            cacheTTL: { type: 'number' },
            auditEnabled: { type: 'boolean' },
            auditLevel: { type: 'string' },
            vaultConfigured: { type: 'boolean' },
            awsConfigured: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      provider: process.env.SECRETS_PROVIDER || 'local',
      cacheEnabled: process.env.SECRETS_CACHE_ENABLED !== 'false',
      cacheTTL: parseInt(process.env.SECRETS_CACHE_TTL || '300', 10),
      auditEnabled: process.env.SECRETS_AUDIT_ENABLED !== 'false',
      auditLevel: process.env.SECRETS_AUDIT_LEVEL || 'info',
      vaultConfigured: !!(process.env.VAULT_ADDR && (process.env.VAULT_TOKEN || process.env.VAULT_ROLE_ID)),
      awsConfigured: !!(process.env.AWS_REGION && (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ROLE_ARN)),
    };
  });
};

export default adminSecretsRoutes;
