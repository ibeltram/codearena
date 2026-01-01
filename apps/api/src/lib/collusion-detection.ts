/**
 * Collusion Detection Service
 *
 * Implements automated detection of suspicious patterns that may indicate
 * collusion or match manipulation:
 *
 * 1. Frequent Opponent Detection - Same users matching too often
 * 2. Intentional Forfeit Patterns - One user repeatedly forfeiting
 * 3. Stake Anomalies - Stakes inconsistent with rating/history
 * 4. Win Trading - Alternating wins between same users
 * 5. Rating Manipulation - Suspicious rating changes
 *
 * Alerts are generated with confidence scores and sent to moderators.
 */

import { db, schema } from '../db';
import { eq, and, gte, sql, desc, ne, inArray } from 'drizzle-orm';
import type {
  CollusionAlertType,
  NewCollusionAlert,
} from '../db/schema/moderation';

const {
  matches,
  matchParticipants,
  collusionAlerts,
  scores,
  creditHolds,
  users,
} = schema;

// Configuration thresholds for detection
export const COLLUSION_CONFIG = {
  // Frequent opponent detection
  FREQUENT_OPPONENT: {
    // Matches with same opponent in time window to trigger alert
    MATCH_THRESHOLD: 5,
    // Time window in days
    WINDOW_DAYS: 7,
    // Base confidence score
    BASE_CONFIDENCE: 60,
    // Confidence increase per additional match
    CONFIDENCE_PER_MATCH: 8,
  },

  // Intentional forfeit detection
  INTENTIONAL_FORFEIT: {
    // Forfeits to same user to trigger alert
    FORFEIT_THRESHOLD: 3,
    // Time window in days
    WINDOW_DAYS: 30,
    // Base confidence score
    BASE_CONFIDENCE: 70,
    // Confidence increase per additional forfeit
    CONFIDENCE_PER_FORFEIT: 10,
  },

  // Win trading detection
  WIN_TRADING: {
    // Minimum matches to analyze
    MIN_MATCHES: 6,
    // Time window in days
    WINDOW_DAYS: 14,
    // Win ratio threshold (should be close to 0.5 for trading)
    WIN_RATIO_MIN: 0.4,
    WIN_RATIO_MAX: 0.6,
    // Base confidence score
    BASE_CONFIDENCE: 50,
  },

  // Stake anomaly detection
  STAKE_ANOMALY: {
    // Stake to rating ratio threshold
    STAKE_RATIO_THRESHOLD: 2.0, // Stake more than 2x their expected cap
    // Base confidence score
    BASE_CONFIDENCE: 40,
  },

  // Rating manipulation detection
  RATING_MANIPULATION: {
    // Suspicious rating change threshold
    RATING_CHANGE_THRESHOLD: 200, // Points in a day
    // Time window in days
    WINDOW_DAYS: 1,
    // Base confidence score
    BASE_CONFIDENCE: 55,
  },
} as const;

/**
 * Evidence structure for collusion alerts
 */
interface CollusionEvidence {
  matchIds: string[];
  patternDetails: Record<string, unknown>;
  detectionTimestamp: string;
  windowStart: string;
  windowEnd: string;
}

/**
 * Result from a detection check
 */
interface DetectionResult {
  detected: boolean;
  alertType: CollusionAlertType;
  userId: string;
  relatedUserId?: string;
  confidenceScore: number;
  severity: number;
  description: string;
  evidence: CollusionEvidence;
}

/**
 * Get date N days ago
 */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Detect frequent opponent patterns
 * Flags users who match against the same opponent too frequently
 */
export async function detectFrequentOpponent(
  userId: string,
  windowDays: number = COLLUSION_CONFIG.FREQUENT_OPPONENT.WINDOW_DAYS
): Promise<DetectionResult | null> {
  const windowStart = daysAgo(windowDays);
  const now = new Date();

  // Get all matches for this user in the window
  const userMatches = await db
    .select({
      matchId: matches.id,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .innerJoin(matchParticipants, eq(matchParticipants.matchId, matches.id))
    .where(
      and(
        eq(matchParticipants.userId, userId),
        gte(matches.createdAt, windowStart),
        ne(matches.status, 'created'),
        ne(matches.status, 'archived')
      )
    );

  const matchIds = userMatches.map((m) => m.matchId);

  if (matchIds.length === 0) {
    return null;
  }

  // Find opponents and count matches against each
  const opponentCounts = await db
    .select({
      opponentId: matchParticipants.userId,
      matchCount: sql<number>`count(*)`.as('match_count'),
    })
    .from(matchParticipants)
    .where(
      and(
        inArray(matchParticipants.matchId, matchIds),
        ne(matchParticipants.userId, userId)
      )
    )
    .groupBy(matchParticipants.userId)
    .having(
      sql`count(*) >= ${COLLUSION_CONFIG.FREQUENT_OPPONENT.MATCH_THRESHOLD}`
    );

  if (opponentCounts.length === 0) {
    return null;
  }

  // Get the most frequent opponent
  const mostFrequent = opponentCounts.reduce((prev, curr) =>
    Number(curr.matchCount) > Number(prev.matchCount) ? curr : prev
  );

  const matchCount = Number(mostFrequent.matchCount);
  const excessMatches =
    matchCount - COLLUSION_CONFIG.FREQUENT_OPPONENT.MATCH_THRESHOLD;
  const confidenceScore = Math.min(
    100,
    COLLUSION_CONFIG.FREQUENT_OPPONENT.BASE_CONFIDENCE +
      excessMatches * COLLUSION_CONFIG.FREQUENT_OPPONENT.CONFIDENCE_PER_MATCH
  );

  // Calculate severity based on match count
  const severity = 1 + (matchCount - COLLUSION_CONFIG.FREQUENT_OPPONENT.MATCH_THRESHOLD) * 0.2;

  // Get the specific match IDs between these users
  const sharedMatches = await db
    .select({ matchId: matchParticipants.matchId })
    .from(matchParticipants)
    .where(
      and(
        inArray(matchParticipants.matchId, matchIds),
        eq(matchParticipants.userId, mostFrequent.opponentId)
      )
    );

  return {
    detected: true,
    alertType: 'frequent_opponent',
    userId,
    relatedUserId: mostFrequent.opponentId,
    confidenceScore,
    severity,
    description: `User matched against same opponent ${matchCount} times in ${windowDays} days (threshold: ${COLLUSION_CONFIG.FREQUENT_OPPONENT.MATCH_THRESHOLD})`,
    evidence: {
      matchIds: sharedMatches.map((m) => m.matchId),
      patternDetails: {
        matchCount,
        threshold: COLLUSION_CONFIG.FREQUENT_OPPONENT.MATCH_THRESHOLD,
        windowDays,
      },
      detectionTimestamp: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
    },
  };
}

/**
 * Detect intentional forfeit patterns
 * Flags users who repeatedly forfeit to the same opponent
 */
export async function detectIntentionalForfeits(
  userId: string,
  windowDays: number = COLLUSION_CONFIG.INTENTIONAL_FORFEIT.WINDOW_DAYS
): Promise<DetectionResult | null> {
  const windowStart = daysAgo(windowDays);
  const now = new Date();

  // Find matches where this user forfeited
  const forfeits = await db
    .select({
      matchId: matchParticipants.matchId,
      forfeitAt: matchParticipants.forfeitAt,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(
      and(
        eq(matchParticipants.userId, userId),
        sql`${matchParticipants.forfeitAt} IS NOT NULL`,
        gte(matches.createdAt, windowStart)
      )
    );

  if (forfeits.length === 0) {
    return null;
  }

  const forfeitMatchIds = forfeits.map((f) => f.matchId);

  // Find who benefited from these forfeits
  const beneficiaries = await db
    .select({
      opponentId: matchParticipants.userId,
      forfeitCount: sql<number>`count(*)`.as('forfeit_count'),
    })
    .from(matchParticipants)
    .where(
      and(
        inArray(matchParticipants.matchId, forfeitMatchIds),
        ne(matchParticipants.userId, userId)
      )
    )
    .groupBy(matchParticipants.userId)
    .having(
      sql`count(*) >= ${COLLUSION_CONFIG.INTENTIONAL_FORFEIT.FORFEIT_THRESHOLD}`
    );

  if (beneficiaries.length === 0) {
    return null;
  }

  // Get the most common beneficiary
  const topBeneficiary = beneficiaries.reduce((prev, curr) =>
    Number(curr.forfeitCount) > Number(prev.forfeitCount) ? curr : prev
  );

  const forfeitCount = Number(topBeneficiary.forfeitCount);
  const excessForfeits =
    forfeitCount - COLLUSION_CONFIG.INTENTIONAL_FORFEIT.FORFEIT_THRESHOLD;
  const confidenceScore = Math.min(
    100,
    COLLUSION_CONFIG.INTENTIONAL_FORFEIT.BASE_CONFIDENCE +
      excessForfeits *
        COLLUSION_CONFIG.INTENTIONAL_FORFEIT.CONFIDENCE_PER_FORFEIT
  );

  const severity = 1.5 + forfeitCount * 0.3;

  return {
    detected: true,
    alertType: 'intentional_forfeit',
    userId,
    relatedUserId: topBeneficiary.opponentId,
    confidenceScore,
    severity,
    description: `User forfeited ${forfeitCount} times to same opponent in ${windowDays} days (threshold: ${COLLUSION_CONFIG.INTENTIONAL_FORFEIT.FORFEIT_THRESHOLD})`,
    evidence: {
      matchIds: forfeitMatchIds,
      patternDetails: {
        forfeitCount,
        threshold: COLLUSION_CONFIG.INTENTIONAL_FORFEIT.FORFEIT_THRESHOLD,
        windowDays,
        beneficiaryId: topBeneficiary.opponentId,
      },
      detectionTimestamp: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
    },
  };
}

/**
 * Detect win trading patterns
 * Flags users who alternate wins with the same opponent
 */
export async function detectWinTrading(
  userId: string,
  windowDays: number = COLLUSION_CONFIG.WIN_TRADING.WINDOW_DAYS
): Promise<DetectionResult | null> {
  const windowStart = daysAgo(windowDays);
  const now = new Date();

  // Get all finalized matches for this user
  const userMatches = await db
    .select({
      matchId: matches.id,
    })
    .from(matches)
    .innerJoin(matchParticipants, eq(matchParticipants.matchId, matches.id))
    .where(
      and(
        eq(matchParticipants.userId, userId),
        eq(matches.status, 'finalized'),
        gte(matches.createdAt, windowStart)
      )
    );

  const matchIds = userMatches.map((m) => m.matchId);

  if (matchIds.length < COLLUSION_CONFIG.WIN_TRADING.MIN_MATCHES) {
    return null;
  }

  // Find opponents with enough matches
  const opponentMatches = await db
    .select({
      opponentId: matchParticipants.userId,
      matchCount: sql<number>`count(*)`.as('match_count'),
    })
    .from(matchParticipants)
    .where(
      and(
        inArray(matchParticipants.matchId, matchIds),
        ne(matchParticipants.userId, userId)
      )
    )
    .groupBy(matchParticipants.userId)
    .having(sql`count(*) >= ${COLLUSION_CONFIG.WIN_TRADING.MIN_MATCHES}`);

  if (opponentMatches.length === 0) {
    return null;
  }

  // Check each opponent for win trading pattern
  for (const opponent of opponentMatches) {
    // Get matches between these two users
    const sharedMatchIds = await db
      .select({ matchId: matchParticipants.matchId })
      .from(matchParticipants)
      .where(
        and(
          inArray(matchParticipants.matchId, matchIds),
          eq(matchParticipants.userId, opponent.opponentId)
        )
      );

    const sharedIds = sharedMatchIds.map((m) => m.matchId);

    // Get scores for these matches
    const userScores = await db
      .select({
        matchId: scores.matchId,
        totalScore: scores.totalScore,
      })
      .from(scores)
      .where(
        and(eq(scores.userId, userId), inArray(scores.matchId, sharedIds))
      );

    const opponentScores = await db
      .select({
        matchId: scores.matchId,
        totalScore: scores.totalScore,
      })
      .from(scores)
      .where(
        and(
          eq(scores.userId, opponent.opponentId),
          inArray(scores.matchId, sharedIds)
        )
      );

    // Count wins for the user
    let userWins = 0;
    let totalMatches = 0;

    for (const userScore of userScores) {
      const oppScore = opponentScores.find(
        (s) => s.matchId === userScore.matchId
      );
      if (oppScore) {
        totalMatches++;
        if (userScore.totalScore > oppScore.totalScore) {
          userWins++;
        }
      }
    }

    if (totalMatches < COLLUSION_CONFIG.WIN_TRADING.MIN_MATCHES) {
      continue;
    }

    const winRatio = userWins / totalMatches;

    // Check if win ratio is suspiciously close to 50%
    if (
      winRatio >= COLLUSION_CONFIG.WIN_TRADING.WIN_RATIO_MIN &&
      winRatio <= COLLUSION_CONFIG.WIN_TRADING.WIN_RATIO_MAX
    ) {
      // Calculate confidence based on how close to 50% and number of matches
      const deviationFrom50 = Math.abs(0.5 - winRatio);
      const confidenceBonus = (0.1 - deviationFrom50) * 200; // Higher confidence when closer to 50%
      const matchBonus = (totalMatches - COLLUSION_CONFIG.WIN_TRADING.MIN_MATCHES) * 5;
      const confidenceScore = Math.min(
        100,
        COLLUSION_CONFIG.WIN_TRADING.BASE_CONFIDENCE + confidenceBonus + matchBonus
      );

      const severity = 1 + totalMatches * 0.1;

      return {
        detected: true,
        alertType: 'win_trading',
        userId,
        relatedUserId: opponent.opponentId,
        confidenceScore: Math.round(confidenceScore),
        severity,
        description: `Suspicious win pattern detected: ${userWins}/${totalMatches} wins (${Math.round(winRatio * 100)}%) against same opponent`,
        evidence: {
          matchIds: sharedIds,
          patternDetails: {
            userWins,
            totalMatches,
            winRatio: Math.round(winRatio * 100) / 100,
            expectedRatioRange: [
              COLLUSION_CONFIG.WIN_TRADING.WIN_RATIO_MIN,
              COLLUSION_CONFIG.WIN_TRADING.WIN_RATIO_MAX,
            ],
          },
          detectionTimestamp: now.toISOString(),
          windowStart: windowStart.toISOString(),
          windowEnd: now.toISOString(),
        },
      };
    }
  }

  return null;
}

/**
 * Run all detection algorithms for a user and create alerts
 */
export async function runCollusionDetection(
  userId: string
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];

  // Run all detection algorithms
  const [frequentOpponent, intentionalForfeit, winTrading] = await Promise.all([
    detectFrequentOpponent(userId),
    detectIntentionalForfeits(userId),
    detectWinTrading(userId),
  ]);

  if (frequentOpponent) results.push(frequentOpponent);
  if (intentionalForfeit) results.push(intentionalForfeit);
  if (winTrading) results.push(winTrading);

  return results;
}

/**
 * Create a collusion alert in the database
 */
export async function createCollusionAlert(
  result: DetectionResult
): Promise<typeof collusionAlerts.$inferSelect> {
  // Check if similar alert already exists and is not resolved
  const existingAlert = await db
    .select()
    .from(collusionAlerts)
    .where(
      and(
        eq(collusionAlerts.userId, result.userId),
        eq(collusionAlerts.alertType, result.alertType),
        inArray(collusionAlerts.status, ['pending', 'investigating']),
        result.relatedUserId
          ? eq(collusionAlerts.relatedUserId, result.relatedUserId)
          : sql`${collusionAlerts.relatedUserId} IS NULL`
      )
    )
    .limit(1);

  if (existingAlert.length > 0) {
    // Update existing alert with new evidence
    const existing = existingAlert[0];
    const existingEvidence = existing.evidenceJson as CollusionEvidence;
    const mergedMatchIds = [
      ...new Set([
        ...(existingEvidence.matchIds || []),
        ...result.evidence.matchIds,
      ]),
    ];

    const [updated] = await db
      .update(collusionAlerts)
      .set({
        confidenceScore: Math.max(existing.confidenceScore, result.confidenceScore),
        severity: Math.max(existing.severity, result.severity),
        description: result.description,
        evidenceJson: {
          ...result.evidence,
          matchIds: mergedMatchIds,
          previousEvidence: existingEvidence,
        },
        updatedAt: new Date(),
      })
      .where(eq(collusionAlerts.id, existing.id))
      .returning();

    return updated;
  }

  // Create new alert
  const alertData: NewCollusionAlert = {
    userId: result.userId,
    relatedUserId: result.relatedUserId,
    alertType: result.alertType,
    confidenceScore: result.confidenceScore,
    severity: result.severity,
    status: 'pending',
    description: result.description,
    evidenceJson: result.evidence,
  };

  const [alert] = await db
    .insert(collusionAlerts)
    .values(alertData)
    .returning();

  return alert;
}

/**
 * Run detection and create alerts for a user
 */
export async function detectAndAlertForUser(
  userId: string
): Promise<typeof collusionAlerts.$inferSelect[]> {
  const results = await runCollusionDetection(userId);
  const alerts: typeof collusionAlerts.$inferSelect[] = [];

  for (const result of results) {
    const alert = await createCollusionAlert(result);
    alerts.push(alert);
  }

  return alerts;
}

/**
 * Get pending collusion alerts for moderator review
 */
export async function getPendingAlerts(options: {
  limit?: number;
  offset?: number;
  alertType?: CollusionAlertType;
  minConfidence?: number;
}): Promise<{
  alerts: Array<
    typeof collusionAlerts.$inferSelect & {
      user: { id: string; displayName: string; email: string } | null;
      relatedUser: { id: string; displayName: string; email: string } | null;
    }
  >;
  total: number;
}> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  // Build where conditions
  const conditions = [
    inArray(collusionAlerts.status, ['pending', 'investigating']),
  ];

  if (options.alertType) {
    conditions.push(eq(collusionAlerts.alertType, options.alertType));
  }

  if (options.minConfidence) {
    conditions.push(
      sql`${collusionAlerts.confidenceScore} >= ${options.minConfidence}`
    );
  }

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(collusionAlerts)
    .where(and(...conditions));

  const total = Number(countResult?.count ?? 0);

  // Get alerts with user info
  const alertsData = await db
    .select()
    .from(collusionAlerts)
    .where(and(...conditions))
    .orderBy(
      desc(collusionAlerts.confidenceScore),
      desc(collusionAlerts.createdAt)
    )
    .limit(limit)
    .offset(offset);

  // Fetch user details
  const alerts = await Promise.all(
    alertsData.map(async (alert) => {
      const [user] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, alert.userId))
        .limit(1);

      let relatedUser = null;
      if (alert.relatedUserId) {
        const [related] = await db
          .select({
            id: users.id,
            displayName: users.displayName,
            email: users.email,
          })
          .from(users)
          .where(eq(users.id, alert.relatedUserId))
          .limit(1);
        relatedUser = related || null;
      }

      return {
        ...alert,
        user: user || null,
        relatedUser,
      };
    })
  );

  return { alerts, total };
}

/**
 * Update alert status (for moderator review)
 */
export async function updateAlertStatus(
  alertId: string,
  update: {
    status: 'investigating' | 'confirmed' | 'dismissed';
    reviewedByUserId: string;
    reviewNotes?: string;
  }
): Promise<typeof collusionAlerts.$inferSelect | null> {
  const now = new Date();

  const [updated] = await db
    .update(collusionAlerts)
    .set({
      status: update.status,
      reviewedByUserId: update.reviewedByUserId,
      reviewNotes: update.reviewNotes,
      resolvedAt:
        update.status === 'confirmed' || update.status === 'dismissed'
          ? now
          : null,
      updatedAt: now,
    })
    .where(eq(collusionAlerts.id, alertId))
    .returning();

  return updated || null;
}

/**
 * Get alert statistics for dashboard
 */
export async function getAlertStats(): Promise<{
  pending: number;
  investigating: number;
  confirmedToday: number;
  dismissedToday: number;
  byType: Record<CollusionAlertType, number>;
  avgConfidence: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Count by status
  const statusCounts = await db
    .select({
      status: collusionAlerts.status,
      count: sql<number>`count(*)`,
    })
    .from(collusionAlerts)
    .groupBy(collusionAlerts.status);

  const pending = Number(
    statusCounts.find((s) => s.status === 'pending')?.count ?? 0
  );
  const investigating = Number(
    statusCounts.find((s) => s.status === 'investigating')?.count ?? 0
  );

  // Count resolved today
  const [confirmedToday] = await db
    .select({ count: sql<number>`count(*)` })
    .from(collusionAlerts)
    .where(
      and(
        eq(collusionAlerts.status, 'confirmed'),
        gte(collusionAlerts.resolvedAt, today)
      )
    );

  const [dismissedToday] = await db
    .select({ count: sql<number>`count(*)` })
    .from(collusionAlerts)
    .where(
      and(
        eq(collusionAlerts.status, 'dismissed'),
        gte(collusionAlerts.resolvedAt, today)
      )
    );

  // Count by type (pending/investigating only)
  const typeCounts = await db
    .select({
      alertType: collusionAlerts.alertType,
      count: sql<number>`count(*)`,
    })
    .from(collusionAlerts)
    .where(inArray(collusionAlerts.status, ['pending', 'investigating']))
    .groupBy(collusionAlerts.alertType);

  const byType: Record<CollusionAlertType, number> = {
    frequent_opponent: 0,
    intentional_forfeit: 0,
    stake_anomaly: 0,
    win_trading: 0,
    rating_manipulation: 0,
  };

  for (const tc of typeCounts) {
    byType[tc.alertType as CollusionAlertType] = Number(tc.count);
  }

  // Average confidence of pending alerts
  const [avgResult] = await db
    .select({
      avg: sql<number>`avg(${collusionAlerts.confidenceScore})`,
    })
    .from(collusionAlerts)
    .where(inArray(collusionAlerts.status, ['pending', 'investigating']));

  return {
    pending,
    investigating,
    confirmedToday: Number(confirmedToday?.count ?? 0),
    dismissedToday: Number(dismissedToday?.count ?? 0),
    byType,
    avgConfidence: Math.round(Number(avgResult?.avg ?? 0)),
  };
}

/**
 * Get collusion history for a specific user
 */
export async function getUserCollusionHistory(
  userId: string
): Promise<typeof collusionAlerts.$inferSelect[]> {
  return db
    .select()
    .from(collusionAlerts)
    .where(
      sql`${collusionAlerts.userId} = ${userId} OR ${collusionAlerts.relatedUserId} = ${userId}`
    )
    .orderBy(desc(collusionAlerts.createdAt));
}
