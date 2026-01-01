/**
 * Collusion Detection Hook
 *
 * Triggered after match finalization to check for suspicious patterns
 * among the participants. Runs detection algorithms asynchronously
 * to not block match completion.
 *
 * Exports: triggerCollusionDetectionForMatch
 */

import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { detectAndAlertForUser } from './collusion-detection';
import { logger } from './logger';

const { matchParticipants } = schema;

/**
 * Trigger collusion detection for all participants of a match
 * Called asynchronously after match finalization
 */
export async function triggerCollusionDetectionForMatch(matchId: string): Promise<void> {
  try {
    // Get all participants of the match
    const participants = await db
      .select({ userId: matchParticipants.userId })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId));

    if (participants.length === 0) {
      logger.warn({ matchId }, 'No participants found for collusion detection');
      return;
    }

    logger.info(
      { matchId, participantCount: participants.length },
      'Running collusion detection for match participants'
    );

    // Run detection for each participant
    const results = await Promise.allSettled(
      participants.map(async (p) => {
        const alerts = await detectAndAlertForUser(p.userId);
        return { userId: p.userId, alertCount: alerts.length };
      })
    );

    // Log results
    let totalAlerts = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        totalAlerts += result.value.alertCount;
        if (result.value.alertCount > 0) {
          logger.info(
            { userId: result.value.userId, alertCount: result.value.alertCount },
            'Collusion alerts generated for user'
          );
        }
      } else {
        logger.error(
          { error: result.reason },
          'Failed to run collusion detection for user'
        );
      }
    }

    if (totalAlerts > 0) {
      logger.warn(
        { matchId, totalAlerts },
        'Collusion detection generated alerts for match'
      );
    } else {
      logger.debug({ matchId }, 'No collusion alerts generated for match');
    }
  } catch (error) {
    logger.error(
      { error, matchId },
      'Failed to run collusion detection for match'
    );
    throw error;
  }
}
