/**
 * Matchmaking Service
 *
 * Implements Redis sorted set-based ranked matchmaking:
 * - Queue management using Redis sorted sets (keyed by rating)
 * - Rating range matching (±100 initially)
 * - Range expansion after 30s, 60s, 120s
 * - Stake cap enforcement (uses lower-rated player's cap)
 * - Auto-match creation when pair is found
 *
 * Queue Key Structure:
 * - queue:ranked:{challengeVersionId|"any"} - Sorted set with rating as score
 * - queue:entry:{queueId} - Hash with player details
 */

import { getRedis, STATE_PREFIX, publish, CHANNELS, acquireLock, releaseLock } from './redis';
import { getPlayerRating } from './rating-service';
import type { RatingTier } from './glicko2';

// Queue configuration
export const QUEUE_CONFIG = {
  // Initial rating range for matching
  INITIAL_RANGE: 100,
  // Range expansion schedule (seconds -> new range)
  EXPANSION_SCHEDULE: [
    { after: 30, range: 150 },
    { after: 60, range: 200 },
    { after: 120, range: 300 },
    { after: 180, range: 500 }, // Wide match after 3 mins
  ],
  // Maximum time in queue before giving up (5 minutes)
  MAX_QUEUE_TIME_MS: 300000,
  // TTL for queue entries (10 minutes)
  ENTRY_TTL_SECONDS: 600,
  // Lock timeout for matchmaking operations
  LOCK_TIMEOUT_SECONDS: 10,
} as const;

// Queue key prefixes
const QUEUE_KEY = {
  // Sorted set: score = rating, member = queueId
  RANKED: (challengeVersionId: string) => `${STATE_PREFIX.QUEUE}ranked:${challengeVersionId}`,
  // Hash storing queue entry details
  ENTRY: (queueId: string) => `${STATE_PREFIX.QUEUE}entry:${queueId}`,
  // Lock for matchmaking operations
  LOCK: (challengeVersionId: string) => `lock:queue:${challengeVersionId}`,
} as const;

/**
 * Queue entry stored in Redis
 */
export interface QueueEntry {
  queueId: string;
  userId: string;
  rating: number;
  deviation: number;
  tier: RatingTier;
  stakeCap: number;
  requestedStake: number;
  challengeVersionId: string | null;
  category: string | null;
  difficulty: string | null;
  joinedAt: number; // Unix timestamp ms
}

/**
 * Match result from queue matching
 */
export interface QueueMatchResult {
  matched: boolean;
  queueId?: string;
  matchedWith?: QueueEntry;
  effectiveStake?: number;
}

/**
 * Generate a unique queue ID
 */
function generateQueueId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get the rating range for matching based on time in queue
 */
export function getRatingRange(joinedAtMs: number): number {
  const waitTimeSeconds = (Date.now() - joinedAtMs) / 1000;

  // Find the appropriate range based on wait time
  for (let i = QUEUE_CONFIG.EXPANSION_SCHEDULE.length - 1; i >= 0; i--) {
    const schedule = QUEUE_CONFIG.EXPANSION_SCHEDULE[i];
    if (waitTimeSeconds >= schedule.after) {
      return schedule.range;
    }
  }

  return QUEUE_CONFIG.INITIAL_RANGE;
}

/**
 * Calculate effective stake for a match
 * Uses the lower of: requested stakes and lower-rated player's stake cap
 */
export function calculateEffectiveStake(
  player1: { rating: number; stakeCap: number; requestedStake: number },
  player2: { rating: number; stakeCap: number; requestedStake: number }
): number {
  // Get the lower-rated player's stake cap
  const lowerRatedCap = player1.rating <= player2.rating
    ? player1.stakeCap
    : player2.stakeCap;

  // Effective stake is the minimum of all constraints
  return Math.min(
    player1.requestedStake,
    player2.requestedStake,
    lowerRatedCap
  );
}

/**
 * Add a player to the matchmaking queue
 */
export async function joinQueue(
  userId: string,
  options: {
    challengeVersionId?: string | null;
    category?: string | null;
    difficulty?: string | null;
    stakeAmount: number;
  }
): Promise<QueueEntry> {
  const redis = getRedis();

  // Get player rating info
  const ratingInfo = await getPlayerRating(userId);

  // Create queue entry
  const queueId = generateQueueId();
  const entry: QueueEntry = {
    queueId,
    userId,
    rating: ratingInfo.rating,
    deviation: ratingInfo.deviation,
    tier: ratingInfo.tier,
    stakeCap: ratingInfo.stakeCap,
    requestedStake: Math.min(options.stakeAmount, ratingInfo.stakeCap),
    challengeVersionId: options.challengeVersionId || null,
    category: options.category || null,
    difficulty: options.difficulty || null,
    joinedAt: Date.now(),
  };

  // Determine which queue to join
  const queueKey = QUEUE_KEY.RANKED(options.challengeVersionId || 'any');
  const entryKey = QUEUE_KEY.ENTRY(queueId);

  // Store entry details as hash
  await redis.hset(entryKey, {
    queueId: entry.queueId,
    userId: entry.userId,
    rating: entry.rating.toString(),
    deviation: entry.deviation.toString(),
    tier: entry.tier,
    stakeCap: entry.stakeCap.toString(),
    requestedStake: entry.requestedStake.toString(),
    challengeVersionId: entry.challengeVersionId || '',
    category: entry.category || '',
    difficulty: entry.difficulty || '',
    joinedAt: entry.joinedAt.toString(),
  });
  await redis.expire(entryKey, QUEUE_CONFIG.ENTRY_TTL_SECONDS);

  // Add to sorted set with rating as score
  await redis.zadd(queueKey, entry.rating, queueId);
  await redis.expire(queueKey, QUEUE_CONFIG.ENTRY_TTL_SECONDS);

  // Publish queue update
  await publish(CHANNELS.QUEUE_UPDATES, {
    type: 'player_joined',
    queueId,
    userId,
    rating: entry.rating,
    tier: entry.tier,
  });

  return entry;
}

/**
 * Remove a player from the matchmaking queue
 */
export async function leaveQueue(queueId: string): Promise<boolean> {
  const redis = getRedis();
  const entryKey = QUEUE_KEY.ENTRY(queueId);

  // Get entry to find which queue it's in
  const entry = await getQueueEntry(queueId);
  if (!entry) {
    return false;
  }

  // Remove from sorted set
  const queueKey = QUEUE_KEY.RANKED(entry.challengeVersionId || 'any');
  await redis.zrem(queueKey, queueId);

  // Delete entry hash
  await redis.del(entryKey);

  // Publish queue update
  await publish(CHANNELS.QUEUE_UPDATES, {
    type: 'player_left',
    queueId,
    userId: entry.userId,
  });

  return true;
}

/**
 * Get queue entry by ID
 */
export async function getQueueEntry(queueId: string): Promise<QueueEntry | null> {
  const redis = getRedis();
  const entryKey = QUEUE_KEY.ENTRY(queueId);

  const data = await redis.hgetall(entryKey);
  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return {
    queueId: data.queueId,
    userId: data.userId,
    rating: parseInt(data.rating, 10),
    deviation: parseFloat(data.deviation),
    tier: data.tier as RatingTier,
    stakeCap: parseInt(data.stakeCap, 10),
    requestedStake: parseInt(data.requestedStake, 10),
    challengeVersionId: data.challengeVersionId || null,
    category: data.category || null,
    difficulty: data.difficulty || null,
    joinedAt: parseInt(data.joinedAt, 10),
  };
}

/**
 * Find a match for a player in the queue
 * Uses rating range that expands over time
 */
export async function findMatch(
  entry: QueueEntry
): Promise<QueueMatchResult> {
  const redis = getRedis();
  const queueKey = QUEUE_KEY.RANKED(entry.challengeVersionId || 'any');

  // Calculate current rating range based on time in queue
  const range = getRatingRange(entry.joinedAt);
  const minRating = entry.rating - range;
  const maxRating = entry.rating + range;

  // Find players within rating range using ZRANGEBYSCORE
  const candidates = await redis.zrangebyscore(
    queueKey,
    minRating,
    maxRating,
    'WITHSCORES'
  );

  // Parse candidates (format: [member1, score1, member2, score2, ...])
  const candidateEntries: Array<{ queueId: string; rating: number }> = [];
  for (let i = 0; i < candidates.length; i += 2) {
    const queueId = candidates[i];
    const rating = parseFloat(candidates[i + 1]);
    if (queueId !== entry.queueId) {
      candidateEntries.push({ queueId, rating });
    }
  }

  if (candidateEntries.length === 0) {
    return { matched: false };
  }

  // Sort by closest rating
  candidateEntries.sort((a, b) =>
    Math.abs(a.rating - entry.rating) - Math.abs(b.rating - entry.rating)
  );

  // Try to match with the closest-rated player
  for (const candidate of candidateEntries) {
    const candidateEntry = await getQueueEntry(candidate.queueId);
    if (!candidateEntry) {
      // Entry expired or was removed
      await redis.zrem(queueKey, candidate.queueId);
      continue;
    }

    // Check if candidate is still valid (not in queue too long)
    const candidateWaitTime = Date.now() - candidateEntry.joinedAt;
    if (candidateWaitTime > QUEUE_CONFIG.MAX_QUEUE_TIME_MS) {
      await leaveQueue(candidate.queueId);
      continue;
    }

    // Check if candidate's expanded range also includes us
    const candidateRange = getRatingRange(candidateEntry.joinedAt);
    if (Math.abs(candidateEntry.rating - entry.rating) > candidateRange) {
      // Candidate's range hasn't expanded enough yet
      continue;
    }

    // Calculate effective stake
    const effectiveStake = calculateEffectiveStake(entry, candidateEntry);

    return {
      matched: true,
      queueId: entry.queueId,
      matchedWith: candidateEntry,
      effectiveStake,
    };
  }

  return { matched: false };
}

/**
 * Atomically match two players and remove them from queue
 * Uses distributed lock to prevent race conditions
 */
export async function executeMatch(
  entry1: QueueEntry,
  entry2: QueueEntry
): Promise<{ success: boolean; error?: string }> {
  const lockKey = QUEUE_KEY.LOCK(entry1.challengeVersionId || 'any');
  const lockValue = await acquireLock(lockKey, QUEUE_CONFIG.LOCK_TIMEOUT_SECONDS);

  if (!lockValue) {
    return { success: false, error: 'Could not acquire queue lock' };
  }

  try {
    const redis = getRedis();
    const queueKey = QUEUE_KEY.RANKED(entry1.challengeVersionId || 'any');

    // Verify both players are still in queue
    const [score1, score2] = await Promise.all([
      redis.zscore(queueKey, entry1.queueId),
      redis.zscore(queueKey, entry2.queueId),
    ]);

    if (score1 === null || score2 === null) {
      return { success: false, error: 'One or both players no longer in queue' };
    }

    // Remove both from queue atomically using pipeline
    const pipeline = redis.pipeline();
    pipeline.zrem(queueKey, entry1.queueId, entry2.queueId);
    pipeline.del(QUEUE_KEY.ENTRY(entry1.queueId));
    pipeline.del(QUEUE_KEY.ENTRY(entry2.queueId));
    await pipeline.exec();

    // Publish match event
    await publish(CHANNELS.QUEUE_UPDATES, {
      type: 'players_matched',
      player1: { queueId: entry1.queueId, userId: entry1.userId, rating: entry1.rating },
      player2: { queueId: entry2.queueId, userId: entry2.userId, rating: entry2.rating },
    });

    return { success: true };
  } finally {
    await releaseLock(lockKey, lockValue);
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(
  challengeVersionId?: string
): Promise<{
  totalPlayers: number;
  ratingDistribution: Record<string, number>;
  averageWaitTimeMs: number;
}> {
  const redis = getRedis();
  const queueKey = QUEUE_KEY.RANKED(challengeVersionId || 'any');

  // Get all queue entries
  const entries = await redis.zrange(queueKey, 0, -1);

  if (entries.length === 0) {
    return {
      totalPlayers: 0,
      ratingDistribution: {},
      averageWaitTimeMs: 0,
    };
  }

  // Gather stats
  const ratingDistribution: Record<string, number> = {
    'Bronze': 0,
    'Silver': 0,
    'Gold': 0,
    'Platinum': 0,
    'Diamond': 0,
    'Master': 0,
    'Grandmaster': 0,
    'Unranked': 0,
  };
  let totalWaitTime = 0;
  let validEntries = 0;

  for (const queueId of entries) {
    const entry = await getQueueEntry(queueId);
    if (entry) {
      ratingDistribution[entry.tier] = (ratingDistribution[entry.tier] || 0) + 1;
      totalWaitTime += Date.now() - entry.joinedAt;
      validEntries++;
    }
  }

  return {
    totalPlayers: entries.length,
    ratingDistribution,
    averageWaitTimeMs: validEntries > 0 ? Math.round(totalWaitTime / validEntries) : 0,
  };
}

/**
 * Check if a user is in the queue
 */
export async function isUserInQueue(userId: string): Promise<QueueEntry | null> {
  const redis = getRedis();

  // Check "any" queue
  const anyQueueKey = QUEUE_KEY.RANKED('any');
  const anyEntries = await redis.zrange(anyQueueKey, 0, -1);

  for (const queueId of anyEntries) {
    const entry = await getQueueEntry(queueId);
    if (entry && entry.userId === userId) {
      return entry;
    }
  }

  // Could also check specific challenge queues if needed
  // For now, we primarily use the "any" queue

  return null;
}

/**
 * Remove user from all queues
 */
export async function removeUserFromQueues(userId: string): Promise<boolean> {
  const entry = await isUserInQueue(userId);
  if (entry) {
    return leaveQueue(entry.queueId);
  }
  return false;
}

/**
 * Clean up expired queue entries
 * Should be called periodically (e.g., via cron job)
 */
export async function cleanupExpiredEntries(): Promise<number> {
  const redis = getRedis();
  const queueKey = QUEUE_KEY.RANKED('any');

  const entries = await redis.zrange(queueKey, 0, -1);
  let cleaned = 0;

  for (const queueId of entries) {
    const entry = await getQueueEntry(queueId);
    if (!entry) {
      // Entry hash expired, remove from sorted set
      await redis.zrem(queueKey, queueId);
      cleaned++;
    } else if (Date.now() - entry.joinedAt > QUEUE_CONFIG.MAX_QUEUE_TIME_MS) {
      // Entry expired by time
      await leaveQueue(queueId);
      cleaned++;
    }
  }

  return cleaned;
}
