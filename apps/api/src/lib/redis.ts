/**
 * Redis Client and Cache Library
 *
 * Provides centralized Redis connection management with:
 * - Connection pooling and auto-reconnection
 * - Cache utilities with TTL and invalidation patterns
 * - Real-time match state storage
 * - Health check functionality
 *
 * Cache Key Patterns:
 * - cache:user:{userId}           - User profile cache
 * - cache:match:{matchId}         - Match details cache
 * - cache:challenge:{challengeId} - Challenge details cache
 * - cache:leaderboard:{scope}     - Leaderboard cache
 * - state:match:{matchId}         - Real-time match state
 * - lock:{resource}               - Distributed locks
 */

import { Redis, RedisOptions } from 'ioredis';
import { env } from './env';

// Cache key prefixes
export const CACHE_PREFIX = {
  USER: 'cache:user:',
  MATCH: 'cache:match:',
  CHALLENGE: 'cache:challenge:',
  LEADERBOARD: 'cache:leaderboard:',
  RANKING: 'cache:ranking:',
} as const;

export const STATE_PREFIX = {
  MATCH: 'state:match:',
  QUEUE: 'state:queue:',
} as const;

export const LOCK_PREFIX = 'lock:';

// Default TTLs (in seconds)
export const TTL = {
  SHORT: 60,           // 1 minute
  MEDIUM: 300,         // 5 minutes
  LONG: 3600,          // 1 hour
  VERY_LONG: 86400,    // 24 hours
  USER_CACHE: 300,     // 5 minutes
  MATCH_CACHE: 60,     // 1 minute (matches change frequently)
  CHALLENGE_CACHE: 3600, // 1 hour (challenges rarely change)
  LEADERBOARD_CACHE: 60, // 1 minute
} as const;

// Redis connection options
const DEFAULT_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  // Reconnection strategy
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('Redis: Max reconnection attempts reached');
      return null; // Stop retrying
    }
    return Math.min(times * 100, 3000); // Exponential backoff up to 3s
  },
};

// Singleton Redis client
let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;

/**
 * Get the main Redis client (for commands)
 */
export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, DEFAULT_OPTIONS);

    redisClient.on('connect', () => {
      console.log('Redis: Connected');
    });

    redisClient.on('ready', () => {
      console.log('Redis: Ready');
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });

    redisClient.on('close', () => {
      console.log('Redis: Connection closed');
    });
  }

  return redisClient;
}

/**
 * Get a dedicated subscriber client (for pub/sub)
 * Note: Subscriber clients can't be used for regular commands
 */
export function getSubscriber(): Redis {
  if (!subscriberClient) {
    subscriberClient = new Redis(env.REDIS_URL, {
      ...DEFAULT_OPTIONS,
      // Subscriber-specific options
    });

    subscriberClient.on('error', (err) => {
      console.error('Redis subscriber error:', err.message);
    });
  }

  return subscriberClient;
}

/**
 * Close all Redis connections
 */
export async function closeRedis(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (redisClient) {
    promises.push(
      redisClient.quit().then(() => {
        redisClient = null;
      })
    );
  }

  if (subscriberClient) {
    promises.push(
      subscriberClient.quit().then(() => {
        subscriberClient = null;
      })
    );
  }

  await Promise.all(promises);
}

/**
 * Check Redis connection health
 */
export async function checkRedisConnection(): Promise<boolean> {
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
}

/**
 * Get Redis connection info for debugging
 */
export async function getRedisInfo(): Promise<Record<string, string>> {
  try {
    const redis = getRedis();
    const info = await redis.info('server');
    const lines = info.split('\r\n').filter((line) => line.includes(':'));
    const result: Record<string, string> = {};

    for (const line of lines) {
      const [key, value] = line.split(':');
      if (key && value) {
        result[key] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

// ============================================================
// Cache Operations
// ============================================================

/**
 * Set a cache value with optional TTL
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = TTL.MEDIUM
): Promise<void> {
  const redis = getRedis();
  const serialized = JSON.stringify(value);
  await redis.setex(key, ttlSeconds, serialized);
}

/**
 * Get a cached value
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const data = await redis.get(key);

  if (!data) return null;

  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Delete a cached value
 */
export async function cacheDelete(key: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.del(key);
  return result > 0;
}

/**
 * Delete multiple cached values by pattern
 */
export async function cacheDeletePattern(pattern: string): Promise<number> {
  const redis = getRedis();
  let deleted = 0;

  // Use SCAN to find matching keys (safer than KEYS for production)
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;

    if (keys.length > 0) {
      deleted += await redis.del(...keys);
    }
  } while (cursor !== '0');

  return deleted;
}

/**
 * Get or set cache (cache-aside pattern)
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = TTL.MEDIUM
): Promise<T> {
  // Try to get from cache first
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch and cache
  const value = await fetcher();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

/**
 * Check if key exists in cache
 */
export async function cacheExists(key: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.exists(key);
  return result > 0;
}

/**
 * Get TTL remaining for a key (in seconds)
 */
export async function cacheTTL(key: string): Promise<number> {
  const redis = getRedis();
  return redis.ttl(key);
}

// ============================================================
// Entity-Specific Cache Functions
// ============================================================

/**
 * Cache user profile
 */
export async function cacheUser(
  userId: string,
  data: Record<string, unknown>
): Promise<void> {
  await cacheSet(`${CACHE_PREFIX.USER}${userId}`, data, TTL.USER_CACHE);
}

/**
 * Get cached user profile
 */
export async function getCachedUser(
  userId: string
): Promise<Record<string, unknown> | null> {
  return cacheGet(`${CACHE_PREFIX.USER}${userId}`);
}

/**
 * Invalidate user cache
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await cacheDelete(`${CACHE_PREFIX.USER}${userId}`);
}

/**
 * Cache match details
 */
export async function cacheMatch(
  matchId: string,
  data: Record<string, unknown>
): Promise<void> {
  await cacheSet(`${CACHE_PREFIX.MATCH}${matchId}`, data, TTL.MATCH_CACHE);
}

/**
 * Get cached match details
 */
export async function getCachedMatch(
  matchId: string
): Promise<Record<string, unknown> | null> {
  return cacheGet(`${CACHE_PREFIX.MATCH}${matchId}`);
}

/**
 * Invalidate match cache
 */
export async function invalidateMatchCache(matchId: string): Promise<void> {
  await cacheDelete(`${CACHE_PREFIX.MATCH}${matchId}`);
}

/**
 * Cache challenge details
 */
export async function cacheChallenge(
  challengeId: string,
  data: Record<string, unknown>
): Promise<void> {
  await cacheSet(`${CACHE_PREFIX.CHALLENGE}${challengeId}`, data, TTL.CHALLENGE_CACHE);
}

/**
 * Get cached challenge details
 */
export async function getCachedChallenge(
  challengeId: string
): Promise<Record<string, unknown> | null> {
  return cacheGet(`${CACHE_PREFIX.CHALLENGE}${challengeId}`);
}

/**
 * Invalidate challenge cache
 */
export async function invalidateChallengeCache(challengeId: string): Promise<void> {
  await cacheDelete(`${CACHE_PREFIX.CHALLENGE}${challengeId}`);
}

/**
 * Cache leaderboard
 */
export async function cacheLeaderboard(
  scope: string,
  data: unknown[]
): Promise<void> {
  await cacheSet(`${CACHE_PREFIX.LEADERBOARD}${scope}`, data, TTL.LEADERBOARD_CACHE);
}

/**
 * Get cached leaderboard
 */
export async function getCachedLeaderboard(scope: string): Promise<unknown[] | null> {
  return cacheGet(`${CACHE_PREFIX.LEADERBOARD}${scope}`);
}

/**
 * Invalidate leaderboard cache
 */
export async function invalidateLeaderboardCache(scope?: string): Promise<void> {
  if (scope) {
    await cacheDelete(`${CACHE_PREFIX.LEADERBOARD}${scope}`);
  } else {
    // Invalidate all leaderboard caches
    await cacheDeletePattern(`${CACHE_PREFIX.LEADERBOARD}*`);
  }
}

// ============================================================
// Real-time Match State
// ============================================================

export interface MatchState {
  matchId: string;
  status: 'pending' | 'active' | 'judging' | 'completed' | 'cancelled';
  startedAt?: string;
  endsAt?: string;
  participants: {
    id: string;
    userId: string;
    status: 'joined' | 'submitted' | 'forfeited';
    submittedAt?: string;
  }[];
  lastUpdated: string;
}

/**
 * Store real-time match state
 */
export async function setMatchState(
  matchId: string,
  state: MatchState
): Promise<void> {
  const redis = getRedis();
  const key = `${STATE_PREFIX.MATCH}${matchId}`;
  // Match state expires after 24 hours
  await redis.setex(key, TTL.VERY_LONG, JSON.stringify(state));
}

/**
 * Get real-time match state
 */
export async function getMatchState(matchId: string): Promise<MatchState | null> {
  const redis = getRedis();
  const key = `${STATE_PREFIX.MATCH}${matchId}`;
  const data = await redis.get(key);

  if (!data) return null;

  try {
    return JSON.parse(data) as MatchState;
  } catch {
    return null;
  }
}

/**
 * Update match state field
 */
export async function updateMatchState(
  matchId: string,
  updates: Partial<MatchState>
): Promise<MatchState | null> {
  const current = await getMatchState(matchId);
  if (!current) return null;

  const updated: MatchState = {
    ...current,
    ...updates,
    lastUpdated: new Date().toISOString(),
  };

  await setMatchState(matchId, updated);
  return updated;
}

/**
 * Delete match state
 */
export async function deleteMatchState(matchId: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.del(`${STATE_PREFIX.MATCH}${matchId}`);
  return result > 0;
}

// ============================================================
// Distributed Locks
// ============================================================

/**
 * Acquire a distributed lock
 */
export async function acquireLock(
  resource: string,
  ttlSeconds: number = 30
): Promise<string | null> {
  const redis = getRedis();
  const lockKey = `${LOCK_PREFIX}${resource}`;
  const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // SET NX EX - Only set if not exists with expiry
  const result = await redis.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');

  return result === 'OK' ? lockValue : null;
}

/**
 * Release a distributed lock
 */
export async function releaseLock(
  resource: string,
  lockValue: string
): Promise<boolean> {
  const redis = getRedis();
  const lockKey = `${LOCK_PREFIX}${resource}`;

  // Only release if we own the lock (using Lua script for atomicity)
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(script, 1, lockKey, lockValue);
  return result === 1;
}

/**
 * Execute with lock (automatic acquire/release)
 */
export async function withLock<T>(
  resource: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 30
): Promise<T | null> {
  const lockValue = await acquireLock(resource, ttlSeconds);
  if (!lockValue) {
    return null; // Could not acquire lock
  }

  try {
    return await fn();
  } finally {
    await releaseLock(resource, lockValue);
  }
}

// ============================================================
// Pub/Sub for Real-time Updates
// ============================================================

export const CHANNELS = {
  MATCH_UPDATES: 'match:updates',
  QUEUE_UPDATES: 'queue:updates',
  LEADERBOARD_UPDATES: 'leaderboard:updates',
} as const;

/**
 * Publish a message to a channel
 */
export async function publish(
  channel: string,
  message: unknown
): Promise<number> {
  const redis = getRedis();
  return redis.publish(channel, JSON.stringify(message));
}

/**
 * Subscribe to a channel
 */
export async function subscribe(
  channel: string,
  handler: (message: unknown) => void
): Promise<void> {
  const subscriber = getSubscriber();

  subscriber.on('message', (ch, msg) => {
    if (ch === channel) {
      try {
        handler(JSON.parse(msg));
      } catch {
        handler(msg);
      }
    }
  });

  await subscriber.subscribe(channel);
}

/**
 * Unsubscribe from a channel
 */
export async function unsubscribe(channel: string): Promise<void> {
  const subscriber = getSubscriber();
  await subscriber.unsubscribe(channel);
}
