import rateLimit from '@fastify/rate-limit';
import { FastifyInstance, FastifyRequest, FastifyReply, RouteOptions } from 'fastify';

import { env } from '../lib/env';
import { getRedis } from '../lib/redis';

/**
 * Rate Limit Configuration
 *
 * Different limits per endpoint type as specified:
 * - Global: 1000 req/min per IP
 * - Auth endpoints: 10 req/min per IP
 * - Upload endpoints: 20 req/min per user
 * - API endpoints: 100 req/min per user
 */

export interface RateLimitConfig {
  max: number;
  timeWindow: string | number; // e.g., '1 minute' or 60000 (ms)
  keyGenerator?: (request: FastifyRequest) => string;
}

// Rate limit configurations by endpoint type
export const RATE_LIMIT_CONFIGS = {
  // Global limit - applied to all requests as baseline
  global: {
    max: env.NODE_ENV === 'production' ? 1000 : 10000,
    timeWindow: '1 minute',
  },
  // Auth endpoints - stricter limit per IP
  auth: {
    max: env.NODE_ENV === 'production' ? 10 : 100,
    timeWindow: '1 minute',
  },
  // Upload endpoints - per user limit
  upload: {
    max: env.NODE_ENV === 'production' ? 20 : 200,
    timeWindow: '1 minute',
  },
  // Standard API endpoints - per user limit
  api: {
    max: env.NODE_ENV === 'production' ? 100 : 1000,
    timeWindow: '1 minute',
  },
  // Health/status endpoints - very high limit
  health: {
    max: env.NODE_ENV === 'production' ? 1000 : 10000,
    timeWindow: '1 minute',
  },
} as const;

export type RateLimitType = keyof typeof RATE_LIMIT_CONFIGS;

// Route patterns for auto-detection of rate limit type
const ROUTE_PATTERNS: { pattern: RegExp; type: RateLimitType }[] = [
  { pattern: /^\/api\/auth\//, type: 'auth' },
  { pattern: /^\/api\/uploads\//, type: 'upload' },
  { pattern: /^\/api\/matches\/[^/]+\/submissions\/init/, type: 'upload' },
  { pattern: /^\/health/, type: 'health' },
  { pattern: /^\/api\//, type: 'api' },
];

/**
 * Detect the appropriate rate limit type for a route
 */
function detectRateLimitType(url: string): RateLimitType {
  for (const { pattern, type } of ROUTE_PATTERNS) {
    if (pattern.test(url)) {
      return type;
    }
  }
  return 'global';
}

/**
 * Generate rate limit key based on endpoint type
 */
function generateKey(request: FastifyRequest, type: RateLimitType): string {
  const userId = (request as unknown as { userId?: string }).userId;
  const ip = request.ip || 'unknown';

  switch (type) {
    case 'auth':
    case 'global':
    case 'health':
      // IP-based limiting for auth and global
      return `ip:${ip}`;
    case 'upload':
    case 'api':
      // User-based limiting for authenticated routes, fall back to IP
      return userId ? `user:${userId}` : `ip:${ip}`;
    default:
      return `ip:${ip}`;
  }
}

/**
 * Build 429 error response with Retry-After header
 */
function errorResponseBuilder(
  request: FastifyRequest,
  context: { max: number; after: string }
) {
  return {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
      retryAfter: context.after,
    },
  };
}

/**
 * Register the global rate limit plugin with Redis backend
 */
export async function registerRateLimit(app: FastifyInstance) {
  const redis = getRedis();

  await app.register(rateLimit, {
    global: true,
    max: RATE_LIMIT_CONFIGS.global.max,
    timeWindow: RATE_LIMIT_CONFIGS.global.timeWindow,
    redis,
    nameSpace: 'rate-limit:',
    errorResponseBuilder,
    keyGenerator: (request) => {
      const url = request.url || '';
      const type = detectRateLimitType(url);
      return `${type}:${generateKey(request, type)}`;
    },
    // Add rate limit headers
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  // Decorate with helper to create route-specific rate limits
  app.decorate('rateLimitConfig', RATE_LIMIT_CONFIGS);
}

/**
 * Create route-specific rate limit options
 * Use in route definitions to override default limits
 *
 * @example
 * app.post('/api/auth/login', {
 *   config: {
 *     rateLimit: createRouteRateLimit('auth', { max: 5 }),
 *   },
 * }, handler);
 */
export function createRouteRateLimit(
  type: RateLimitType,
  overrides?: Partial<RateLimitConfig>
): { max: number; timeWindow: string | number; keyGenerator?: (request: FastifyRequest) => string } {
  const baseConfig = RATE_LIMIT_CONFIGS[type];

  return {
    max: overrides?.max ?? baseConfig.max,
    timeWindow: overrides?.timeWindow ?? baseConfig.timeWindow,
    keyGenerator: overrides?.keyGenerator ?? ((request) => generateKey(request, type)),
  };
}

/**
 * Helper to apply stricter rate limits to specific routes
 * This can be used as a preHandler hook
 *
 * @example
 * app.post('/api/auth/device/start', {
 *   preHandler: [strictRateLimit('auth')],
 * }, handler);
 */
export function strictRateLimit(type: RateLimitType, customMax?: number) {
  const config = RATE_LIMIT_CONFIGS[type];
  const max = customMax ?? config.max;

  return async function rateLimitPreHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const key = generateKey(request, type);
    const redis = getRedis();
    const redisKey = `strict-rate-limit:${type}:${key}`;

    // Parse time window to seconds
    const windowSeconds = typeof config.timeWindow === 'string'
      ? parseTimeWindow(config.timeWindow)
      : Math.floor(config.timeWindow / 1000);

    const current = await redis.incr(redisKey);

    if (current === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    const ttl = await redis.ttl(redisKey);
    const remaining = Math.max(0, max - current);
    const resetTime = ttl > 0 ? ttl : windowSeconds;

    // Set headers
    reply.header('X-RateLimit-Limit', max);
    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', resetTime);

    if (current > max) {
      reply.header('Retry-After', resetTime);
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          retryAfter: resetTime,
        },
      });
    }
  };
}

/**
 * Parse time window string to seconds
 */
function parseTimeWindow(window: string): number {
  const match = window.match(/^(\d+)\s*(second|seconds|minute|minutes|hour|hours|day|days)$/i);
  if (!match) return 60; // Default to 1 minute

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'second':
    case 'seconds':
      return value;
    case 'minute':
    case 'minutes':
      return value * 60;
    case 'hour':
    case 'hours':
      return value * 3600;
    case 'day':
    case 'days':
      return value * 86400;
    default:
      return 60;
  }
}

// Extend FastifyInstance type
declare module 'fastify' {
  interface FastifyInstance {
    rateLimitConfig: typeof RATE_LIMIT_CONFIGS;
  }
}
