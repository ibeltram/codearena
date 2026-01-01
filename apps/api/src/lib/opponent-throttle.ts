/**
 * Opponent Throttling Service
 *
 * Implements repeat opponent throttling to limit matches against the same
 * opponent per day. This increases diversity of competition and prevents
 * gaming the system through coordinated matches.
 *
 * Default: Maximum 3 matches vs same opponent per day
 * Resets at midnight UTC
 */

import { db, schema } from '../db';
import { eq, and, gte, sql, ne } from 'drizzle-orm';

const { matches, matchParticipants } = schema;

// Configuration - can be made configurable per category in the future
const DEFAULT_DAILY_OPPONENT_LIMIT = 3;

export interface OpponentThrottleResult {
  allowed: boolean;
  matchCount: number;
  limit: number;
  reason?: string;
  resetsAt?: Date;
}

/**
 * Get the start of the current UTC day
 */
function getUTCDayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Get the start of the next UTC day (when the limit resets)
 */
function getNextUTCDayStart(): Date {
  const today = getUTCDayStart();
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Count how many matches two users have played against each other today
 */
export async function countDailyMatchesBetweenUsers(
  userId1: string,
  userId2: string
): Promise<number> {
  const todayStart = getUTCDayStart();

  // Find all matches where both users participated, created today
  // We need to find matches where:
  // 1. Match was created today
  // 2. Both user1 and user2 are participants
  // 3. Match is not in created/archived state (actual matches that happened or are happening)

  const result = await db
    .select({
      matchId: matches.id,
    })
    .from(matches)
    .innerJoin(matchParticipants, eq(matchParticipants.matchId, matches.id))
    .where(
      and(
        gte(matches.createdAt, todayStart),
        ne(matches.status, 'created'),
        ne(matches.status, 'archived')
      )
    )
    .groupBy(matches.id)
    .having(
      sql`COUNT(DISTINCT CASE WHEN ${matchParticipants.userId} IN (${userId1}, ${userId2}) THEN ${matchParticipants.userId} END) = 2`
    );

  return result.length;
}

/**
 * Check if a user can compete against a specific opponent
 * Returns whether the match is allowed and details about the throttle
 */
export async function checkOpponentThrottle(
  userId: string,
  opponentId: string,
  limit: number = DEFAULT_DAILY_OPPONENT_LIMIT
): Promise<OpponentThrottleResult> {
  // Same user check (edge case)
  if (userId === opponentId) {
    return {
      allowed: false,
      matchCount: 0,
      limit,
      reason: 'Cannot match against yourself',
    };
  }

  const matchCount = await countDailyMatchesBetweenUsers(userId, opponentId);
  const resetsAt = getNextUTCDayStart();

  if (matchCount >= limit) {
    return {
      allowed: false,
      matchCount,
      limit,
      reason: `You have already played ${matchCount} match${matchCount === 1 ? '' : 'es'} against this opponent today. Daily limit is ${limit}. Try again after midnight UTC.`,
      resetsAt,
    };
  }

  return {
    allowed: true,
    matchCount,
    limit,
    resetsAt,
  };
}

/**
 * Get the daily opponent limit for a given challenge category
 * For now returns the default, but can be extended to have per-category limits
 */
export function getDailyOpponentLimit(category?: string): number {
  // Future: could have different limits per category
  // For example, algorithm challenges might have higher limits
  // since they're typically shorter
  return DEFAULT_DAILY_OPPONENT_LIMIT;
}

/**
 * Get opponent throttle status for a user against all their recent opponents
 * Useful for displaying in the UI which opponents are still available
 */
export async function getOpponentThrottleStatus(userId: string): Promise<{
  throttledOpponents: Array<{
    opponentId: string;
    matchCount: number;
    limit: number;
    resetsAt: Date;
  }>;
}> {
  const todayStart = getUTCDayStart();
  const limit = DEFAULT_DAILY_OPPONENT_LIMIT;
  const resetsAt = getNextUTCDayStart();

  // Find all opponents the user has played today
  const todayMatches = await db
    .select({
      matchId: matches.id,
      opponentId: matchParticipants.userId,
    })
    .from(matches)
    .innerJoin(matchParticipants, eq(matchParticipants.matchId, matches.id))
    .where(
      and(
        gte(matches.createdAt, todayStart),
        ne(matches.status, 'created'),
        ne(matches.status, 'archived'),
        ne(matchParticipants.userId, userId)
      )
    );

  // Get matches where the user participated
  const userMatchIds = await db
    .select({ matchId: matchParticipants.matchId })
    .from(matchParticipants)
    .where(eq(matchParticipants.userId, userId));

  const userMatchIdSet = new Set(userMatchIds.map((m) => m.matchId));

  // Filter to only opponents from matches the user was in
  const opponentMatches = todayMatches.filter((m) => userMatchIdSet.has(m.matchId));

  // Count matches per opponent
  const opponentCounts = new Map<string, number>();
  for (const match of opponentMatches) {
    const count = opponentCounts.get(match.opponentId) || 0;
    opponentCounts.set(match.opponentId, count + 1);
  }

  // Return throttled opponents (those at or above limit)
  const throttledOpponents = Array.from(opponentCounts.entries())
    .filter(([_, count]) => count >= limit)
    .map(([opponentId, matchCount]) => ({
      opponentId,
      matchCount,
      limit,
      resetsAt,
    }));

  return { throttledOpponents };
}
