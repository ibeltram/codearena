/**
 * Rating Service
 *
 * Manages player ratings using the Glicko-2 system.
 * Handles:
 * - Rating initialization for new players
 * - Rating updates after matches
 * - Inactivity penalties
 * - Season-based tracking
 * - Rating history
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import {
  updateRating,
  updateForInactivity,
  expectedScore,
  getConfidenceInterval,
  getRatingTier,
  calculateStakeCap,
  previewRatingChange,
  GLICKO2_DEFAULTS,
  type Glicko2Rating,
  type MatchResult,
  type RatingTier,
} from './glicko2';

const { rankings, seasons, users, matches, matchParticipants, scores } = schema;

// Rating period duration (in days) - affects inactivity penalty
const RATING_PERIOD_DAYS = 7;

/**
 * Get or create the current active season
 */
export async function getCurrentSeason(): Promise<typeof seasons.$inferSelect> {
  const now = new Date();

  // Try to find active season
  const [activeSeason] = await db
    .select()
    .from(seasons)
    .where(
      and(
        sql`${seasons.startAt} <= ${now}`,
        sql`${seasons.endAt} >= ${now}`
      )
    )
    .limit(1);

  if (activeSeason) {
    return activeSeason;
  }

  // Create a new season if none exists
  const seasonStart = new Date();
  seasonStart.setHours(0, 0, 0, 0);

  const seasonEnd = new Date(seasonStart);
  seasonEnd.setMonth(seasonEnd.getMonth() + 3); // 3-month seasons

  const seasonName = `Season ${seasonStart.getFullYear()}-Q${Math.ceil((seasonStart.getMonth() + 1) / 3)}`;

  const [newSeason] = await db
    .insert(seasons)
    .values({
      name: seasonName,
      startAt: seasonStart,
      endAt: seasonEnd,
      rulesJson: {
        minGamesForRanking: 5,
        inactivityPenaltyDays: RATING_PERIOD_DAYS,
        placementGames: 3,
      },
    })
    .returning();

  return newSeason;
}

/**
 * Get or create a player's ranking for the current season
 */
export async function getOrCreateRanking(
  userId: string,
  seasonId?: string
): Promise<typeof rankings.$inferSelect> {
  // Get current season if not provided
  const season = seasonId
    ? await db.select().from(seasons).where(eq(seasons.id, seasonId)).then((r) => r[0])
    : await getCurrentSeason();

  if (!season) {
    throw new Error('No active season found');
  }

  // Try to find existing ranking
  const [existingRanking] = await db
    .select()
    .from(rankings)
    .where(and(eq(rankings.userId, userId), eq(rankings.seasonId, season.id)))
    .limit(1);

  if (existingRanking) {
    return existingRanking;
  }

  // Create new ranking with default values
  const [newRanking] = await db
    .insert(rankings)
    .values({
      userId,
      seasonId: season.id,
      rating: GLICKO2_DEFAULTS.rating,
      deviation: GLICKO2_DEFAULTS.deviation,
      volatility: GLICKO2_DEFAULTS.volatility,
    })
    .returning();

  return newRanking;
}

/**
 * Get a player's rating data
 */
export async function getPlayerRating(userId: string): Promise<Glicko2Rating & {
  tier: RatingTier;
  gamesPlayed: number;
  confidence: [number, number];
  stakeCap: number;
}> {
  const ranking = await getOrCreateRanking(userId);

  // Count games played this season
  const gamesResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .where(
      and(
        eq(matchParticipants.userId, userId),
        eq(matches.status, 'finalized')
      )
    );

  const gamesPlayed = Number(gamesResult[0]?.count ?? 0);

  const rating: Glicko2Rating = {
    rating: ranking.rating,
    deviation: ranking.deviation,
    volatility: ranking.volatility,
  };

  return {
    ...rating,
    tier: getRatingTier(rating.rating, gamesPlayed),
    gamesPlayed,
    confidence: getConfidenceInterval(rating),
    stakeCap: calculateStakeCap(rating.rating, rating.deviation),
  };
}

/**
 * Update ratings after a match
 */
export async function updateMatchRatings(
  matchId: string,
  winnerId: string | null,
  isDraw: boolean = false
): Promise<{
  player1: { userId: string; oldRating: number; newRating: number; change: number };
  player2: { userId: string; oldRating: number; newRating: number; change: number };
}> {
  // Get match participants
  const participants = await db
    .select()
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));

  if (participants.length !== 2) {
    throw new Error(`Invalid participant count for match ${matchId}: ${participants.length}`);
  }

  const [p1, p2] = participants;

  // Get current ratings
  const ranking1 = await getOrCreateRanking(p1.userId);
  const ranking2 = await getOrCreateRanking(p2.userId);

  // Determine scores
  let p1Score: number;
  let p2Score: number;

  if (isDraw) {
    p1Score = 0.5;
    p2Score = 0.5;
  } else if (winnerId === p1.userId) {
    p1Score = 1;
    p2Score = 0;
  } else if (winnerId === p2.userId) {
    p1Score = 0;
    p2Score = 1;
  } else {
    // No winner (shouldn't happen for finalized match)
    p1Score = 0.5;
    p2Score = 0.5;
  }

  // Calculate new ratings
  const p1Rating: Glicko2Rating = {
    rating: ranking1.rating,
    deviation: ranking1.deviation,
    volatility: ranking1.volatility,
  };

  const p2Rating: Glicko2Rating = {
    rating: ranking2.rating,
    deviation: ranking2.deviation,
    volatility: ranking2.volatility,
  };

  const p1MatchResult: MatchResult = {
    opponentRating: p2Rating.rating,
    opponentDeviation: p2Rating.deviation,
    score: p1Score,
  };

  const p2MatchResult: MatchResult = {
    opponentRating: p1Rating.rating,
    opponentDeviation: p1Rating.deviation,
    score: p2Score,
  };

  const newP1Rating = updateRating(p1Rating, [p1MatchResult]);
  const newP2Rating = updateRating(p2Rating, [p2MatchResult]);

  // Update database
  const now = new Date();

  await db
    .update(rankings)
    .set({
      rating: newP1Rating.rating,
      deviation: newP1Rating.deviation,
      volatility: newP1Rating.volatility,
      updatedAt: now,
    })
    .where(eq(rankings.id, ranking1.id));

  await db
    .update(rankings)
    .set({
      rating: newP2Rating.rating,
      deviation: newP2Rating.deviation,
      volatility: newP2Rating.volatility,
      updatedAt: now,
    })
    .where(eq(rankings.id, ranking2.id));

  return {
    player1: {
      userId: p1.userId,
      oldRating: ranking1.rating,
      newRating: newP1Rating.rating,
      change: newP1Rating.rating - ranking1.rating,
    },
    player2: {
      userId: p2.userId,
      oldRating: ranking2.rating,
      newRating: newP2Rating.rating,
      change: newP2Rating.rating - ranking2.rating,
    },
  };
}

/**
 * Apply inactivity penalty to players who haven't played recently
 */
export async function applyInactivityPenalties(): Promise<number> {
  const season = await getCurrentSeason();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RATING_PERIOD_DAYS);

  // Find rankings that haven't been updated recently
  const staleRankings = await db
    .select()
    .from(rankings)
    .where(
      and(
        eq(rankings.seasonId, season.id),
        sql`${rankings.updatedAt} < ${cutoffDate}`
      )
    );

  let updated = 0;

  for (const ranking of staleRankings) {
    // Calculate periods of inactivity
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(ranking.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    const periodsInactive = Math.floor(daysSinceUpdate / RATING_PERIOD_DAYS);

    if (periodsInactive > 0) {
      const currentRating: Glicko2Rating = {
        rating: ranking.rating,
        deviation: ranking.deviation,
        volatility: ranking.volatility,
      };

      const updatedRating = updateForInactivity(currentRating, periodsInactive);

      await db
        .update(rankings)
        .set({
          deviation: updatedRating.deviation,
          updatedAt: new Date(),
        })
        .where(eq(rankings.id, ranking.id));

      updated++;
    }
  }

  return updated;
}

/**
 * Get leaderboard for the current season
 */
export async function getLeaderboard(options: {
  seasonId?: string;
  limit?: number;
  offset?: number;
  category?: string;
}): Promise<Array<{
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  deviation: number;
  tier: RatingTier;
  gamesPlayed: number;
}>> {
  const season = options.seasonId
    ? await db.select().from(seasons).where(eq(seasons.id, options.seasonId)).then((r) => r[0])
    : await getCurrentSeason();

  if (!season) {
    return [];
  }

  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  // Get rankings with user info, ordered by rating
  const results = await db
    .select({
      userId: rankings.userId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      rating: rankings.rating,
      deviation: rankings.deviation,
    })
    .from(rankings)
    .innerJoin(users, eq(rankings.userId, users.id))
    .where(eq(rankings.seasonId, season.id))
    .orderBy(desc(rankings.rating))
    .limit(limit)
    .offset(offset);

  // Add rank and games played
  const leaderboard = await Promise.all(
    results.map(async (r, index) => {
      // Count games played
      const gamesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(matchParticipants)
        .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
        .where(
          and(
            eq(matchParticipants.userId, r.userId),
            eq(matches.status, 'finalized')
          )
        );

      const gamesPlayed = Number(gamesResult[0]?.count ?? 0);

      return {
        rank: offset + index + 1,
        userId: r.userId,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        rating: r.rating,
        deviation: r.deviation,
        tier: getRatingTier(r.rating, gamesPlayed),
        gamesPlayed,
      };
    })
  );

  return leaderboard;
}

/**
 * Get a player's rating history
 */
export async function getRatingHistory(
  userId: string,
  options: {
    limit?: number;
    seasonId?: string;
  } = {}
): Promise<Array<{
  matchId: string;
  timestamp: Date;
  rating: number;
  ratingChange: number;
  opponentId: string;
  opponentRating: number;
  result: 'win' | 'loss' | 'draw';
}>> {
  const limit = options.limit ?? 20;

  // Get user's matches with scores
  const matchHistory = await db
    .select({
      matchId: matches.id,
      timestamp: matches.endAt,
      participantId: matchParticipants.id,
      userId: matchParticipants.userId,
      seat: matchParticipants.seat,
    })
    .from(matches)
    .innerJoin(matchParticipants, eq(matches.id, matchParticipants.matchId))
    .where(
      and(
        eq(matchParticipants.userId, userId),
        eq(matches.status, 'finalized')
      )
    )
    .orderBy(desc(matches.endAt))
    .limit(limit);

  const history = await Promise.all(
    matchHistory.map(async (m) => {
      // Get opponent
      const [opponent] = await db
        .select()
        .from(matchParticipants)
        .where(
          and(
            eq(matchParticipants.matchId, m.matchId),
            sql`${matchParticipants.userId} != ${userId}`
          )
        )
        .limit(1);

      // Get scores
      const [userScore] = await db
        .select()
        .from(scores)
        .where(
          and(eq(scores.matchId, m.matchId), eq(scores.userId, userId))
        )
        .limit(1);

      const [opponentScore] = opponent
        ? await db
            .select()
            .from(scores)
            .where(
              and(eq(scores.matchId, m.matchId), eq(scores.userId, opponent.userId))
            )
            .limit(1)
        : [null];

      // Determine result
      let result: 'win' | 'loss' | 'draw' = 'draw';
      if (userScore && opponentScore) {
        if (userScore.totalScore > opponentScore.totalScore) {
          result = 'win';
        } else if (userScore.totalScore < opponentScore.totalScore) {
          result = 'loss';
        }
      }

      // Get opponent's ranking at time of match (simplified - just current)
      const opponentRanking = opponent
        ? await getOrCreateRanking(opponent.userId)
        : null;

      return {
        matchId: m.matchId,
        timestamp: m.timestamp || new Date(),
        rating: 0, // Would need to store historical ratings for accurate values
        ratingChange: 0, // Would need rating history tracking
        opponentId: opponent?.userId || '',
        opponentRating: opponentRanking?.rating || GLICKO2_DEFAULTS.rating,
        result,
      };
    })
  );

  return history;
}

/**
 * Preview rating changes for a potential match
 */
export async function previewMatchRatingChanges(
  userId: string,
  opponentId: string
): Promise<{
  win: number;
  loss: number;
  draw: number;
  expectedScore: number;
  opponentTier: RatingTier;
}> {
  const playerRating = await getPlayerRating(userId);
  const opponentRating = await getPlayerRating(opponentId);

  const playerGlicko: Glicko2Rating = {
    rating: playerRating.rating,
    deviation: playerRating.deviation,
    volatility: playerRating.volatility,
  };

  const opponentGlicko: Glicko2Rating = {
    rating: opponentRating.rating,
    deviation: opponentRating.deviation,
    volatility: opponentRating.volatility,
  };

  const changes = previewRatingChange(playerGlicko, opponentGlicko);
  const expected = expectedScore(playerGlicko, opponentGlicko);

  return {
    ...changes,
    expectedScore: Math.round(expected * 100) / 100,
    opponentTier: opponentRating.tier,
  };
}

/**
 * Reset ratings for a new season
 */
export async function resetForNewSeason(
  oldSeasonId: string,
  newSeasonId: string,
  decayFactor: number = 0.8
): Promise<number> {
  // Get all rankings from old season
  const oldRankings = await db
    .select()
    .from(rankings)
    .where(eq(rankings.seasonId, oldSeasonId));

  let created = 0;

  for (const oldRanking of oldRankings) {
    // Apply rating decay towards default
    const decayedRating = Math.round(
      GLICKO2_DEFAULTS.rating +
        (oldRanking.rating - GLICKO2_DEFAULTS.rating) * decayFactor
    );

    // Increase deviation for new season (more uncertainty)
    const newDeviation = Math.min(
      GLICKO2_DEFAULTS.deviation,
      oldRanking.deviation + 50
    );

    await db.insert(rankings).values({
      userId: oldRanking.userId,
      seasonId: newSeasonId,
      rating: decayedRating,
      deviation: newDeviation,
      volatility: oldRanking.volatility,
    });

    created++;
  }

  return created;
}

/**
 * Get stake cap for a user
 */
export async function getUserStakeCap(userId: string): Promise<number> {
  const rating = await getPlayerRating(userId);
  return rating.stakeCap;
}

/**
 * Validate if a stake amount is allowed for a user
 */
export async function validateStakeAmount(
  userId: string,
  stakeAmount: number
): Promise<{ valid: boolean; maxAllowed: number; reason?: string }> {
  const stakeCap = await getUserStakeCap(userId);

  if (stakeAmount <= 0) {
    return { valid: false, maxAllowed: stakeCap, reason: 'Stake must be positive' };
  }

  if (stakeAmount > stakeCap) {
    return {
      valid: false,
      maxAllowed: stakeCap,
      reason: `Stake exceeds your cap of ${stakeCap} credits based on your rating`,
    };
  }

  return { valid: true, maxAllowed: stakeCap };
}
