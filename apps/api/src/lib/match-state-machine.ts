/**
 * Match State Machine
 *
 * Server-authoritative state machine for match lifecycle management.
 * Handles state transitions with validation, timer enforcement, and event emission.
 *
 * State Flow:
 * created → open → matched → in_progress → submission_locked → judging → finalized → archived
 *
 * Special transitions:
 * - Forfeit can occur from: matched, in_progress, submission_locked
 * - Cancel can occur from: created, open (by creator only)
 */

import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { updateMatchRatings } from './rating-service';

const { matches, matchParticipants, creditHolds, creditAccounts } = schema;

// Match status types
export type MatchStatus =
  | 'created'
  | 'open'
  | 'matched'
  | 'in_progress'
  | 'submission_locked'
  | 'judging'
  | 'finalized'
  | 'archived';

// Event types emitted by state machine
export type MatchEventType =
  | 'match.created'
  | 'match.opened'
  | 'match.matched'
  | 'match.started'
  | 'match.submissions_locked'
  | 'match.judging_started'
  | 'match.finalized'
  | 'match.archived'
  | 'match.cancelled'
  | 'match.forfeited'
  | 'participant.joined'
  | 'participant.ready'
  | 'participant.forfeited'
  | 'timer.warning'
  | 'timer.expired';

// Match event payload
export interface MatchEvent {
  type: MatchEventType;
  matchId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// Transition context
export interface TransitionContext {
  matchId: string;
  userId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// Transition result
export interface TransitionResult {
  success: boolean;
  previousStatus: MatchStatus;
  newStatus: MatchStatus;
  event?: MatchEvent;
  error?: string;
}

// Define valid state transitions
const VALID_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  created: ['open', 'archived'], // Can open or cancel (archive)
  open: ['matched', 'archived'], // Can match or cancel
  matched: ['in_progress', 'open', 'finalized', 'archived'], // Start, opponent leave, forfeit, or cancel
  in_progress: ['submission_locked', 'finalized'], // Lock or forfeit
  submission_locked: ['judging', 'finalized'], // Start judging or forfeit
  judging: ['finalized'], // Complete judging
  finalized: ['archived'], // Archive completed match
  archived: [], // Terminal state
};

// Define which transitions can be triggered by timer
const TIMER_TRIGGERED_TRANSITIONS: Partial<Record<MatchStatus, MatchStatus>> = {
  in_progress: 'submission_locked',
  submission_locked: 'judging',
};

// Forfeit-allowed states
const FORFEIT_ALLOWED_STATES: MatchStatus[] = ['matched', 'in_progress', 'submission_locked'];

// Cancel-allowed states (by creator)
const CANCEL_ALLOWED_STATES: MatchStatus[] = ['created', 'open'];

/**
 * Check if a transition is valid
 */
export function isValidTransition(from: MatchStatus, to: MatchStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Check if forfeit is allowed in current state
 */
export function canForfeit(status: MatchStatus): boolean {
  return FORFEIT_ALLOWED_STATES.includes(status);
}

/**
 * Check if cancel is allowed in current state
 */
export function canCancel(status: MatchStatus): boolean {
  return CANCEL_ALLOWED_STATES.includes(status);
}

/**
 * Get the next timer-triggered state
 */
export function getTimerTriggeredNextState(status: MatchStatus): MatchStatus | null {
  return TIMER_TRIGGERED_TRANSITIONS[status] ?? null;
}

/**
 * Event emitter store (in-memory for now, would use Redis pub/sub in production)
 */
type EventHandler = (event: MatchEvent) => void | Promise<void>;
const eventHandlers: EventHandler[] = [];

/**
 * Subscribe to match events
 */
export function onMatchEvent(handler: EventHandler): () => void {
  eventHandlers.push(handler);
  return () => {
    const index = eventHandlers.indexOf(handler);
    if (index > -1) {
      eventHandlers.splice(index, 1);
    }
  };
}

/**
 * Emit a match event
 */
async function emitEvent(event: MatchEvent): Promise<void> {
  for (const handler of eventHandlers) {
    try {
      await handler(event);
    } catch (error) {
      console.error('Error in match event handler:', error);
    }
  }
}

/**
 * Create a match event
 */
function createEvent(
  type: MatchEventType,
  matchId: string,
  data?: Record<string, unknown>
): MatchEvent {
  return {
    type,
    matchId,
    timestamp: new Date(),
    data,
  };
}

/**
 * Transition match to a new state with validation
 */
export async function transitionMatch(
  matchId: string,
  toStatus: MatchStatus,
  context: TransitionContext = { matchId }
): Promise<TransitionResult> {
  // Get current match state
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));

  if (!match) {
    return {
      success: false,
      previousStatus: 'created',
      newStatus: toStatus,
      error: `Match not found: ${matchId}`,
    };
  }

  const fromStatus = match.status as MatchStatus;

  // Validate transition
  if (!isValidTransition(fromStatus, toStatus)) {
    return {
      success: false,
      previousStatus: fromStatus,
      newStatus: toStatus,
      error: `Invalid transition from '${fromStatus}' to '${toStatus}'`,
    };
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    status: toStatus,
  };

  // Add timestamps based on transition
  const now = new Date();

  if (toStatus === 'in_progress' && !match.startAt) {
    // Calculate end time based on duration (default 60 minutes)
    const durationMs = 60 * 60 * 1000; // TODO: Get from match config
    updatePayload.startAt = now;
    updatePayload.endAt = new Date(now.getTime() + durationMs);
    updatePayload.lockAt = new Date(now.getTime() + durationMs);
  }

  // Perform the transition
  await db.update(matches).set(updatePayload).where(eq(matches.id, matchId));

  // Determine event type
  let eventType: MatchEventType;
  switch (toStatus) {
    case 'open':
      eventType = 'match.opened';
      break;
    case 'matched':
      eventType = 'match.matched';
      break;
    case 'in_progress':
      eventType = 'match.started';
      break;
    case 'submission_locked':
      eventType = 'match.submissions_locked';
      break;
    case 'judging':
      eventType = 'match.judging_started';
      break;
    case 'finalized':
      eventType = 'match.finalized';
      break;
    case 'archived':
      eventType = 'match.archived';
      break;
    default:
      eventType = 'match.created';
  }

  const event = createEvent(eventType, matchId, {
    previousStatus: fromStatus,
    userId: context.userId,
    reason: context.reason,
    ...context.metadata,
  });

  // Emit event
  await emitEvent(event);

  return {
    success: true,
    previousStatus: fromStatus,
    newStatus: toStatus,
    event,
  };
}

/**
 * Handle forfeit action
 */
export async function forfeitMatch(
  matchId: string,
  userId: string
): Promise<TransitionResult> {
  // Get current match state
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));

  if (!match) {
    return {
      success: false,
      previousStatus: 'created',
      newStatus: 'finalized',
      error: `Match not found: ${matchId}`,
    };
  }

  const currentStatus = match.status as MatchStatus;

  // Check if forfeit is allowed
  if (!canForfeit(currentStatus)) {
    return {
      success: false,
      previousStatus: currentStatus,
      newStatus: 'finalized',
      error: `Cannot forfeit match in '${currentStatus}' state`,
    };
  }

  // Check if user is a participant
  const [participant] = await db
    .select()
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));

  if (!participant) {
    return {
      success: false,
      previousStatus: currentStatus,
      newStatus: 'finalized',
      error: 'User is not a participant in this match',
    };
  }

  // Check if already forfeited
  if (participant.forfeitAt) {
    return {
      success: false,
      previousStatus: currentStatus,
      newStatus: 'finalized',
      error: 'User has already forfeited',
    };
  }

  // Mark participant as forfeited
  const now = new Date();
  await db
    .update(matchParticipants)
    .set({ forfeitAt: now })
    .where(eq(matchParticipants.id, participant.id));

  // Emit forfeit event
  await emitEvent(
    createEvent('participant.forfeited', matchId, {
      participantId: participant.id,
      userId,
      seat: participant.seat,
    })
  );

  // Transition to finalized
  return transitionMatch(matchId, 'finalized', {
    matchId,
    userId,
    reason: 'forfeit',
    metadata: {
      forfeitedBy: userId,
      forfeitedSeat: participant.seat,
    },
  });
}

/**
 * Handle cancel action (by creator, before match starts)
 */
export async function cancelMatch(
  matchId: string,
  userId: string
): Promise<TransitionResult> {
  // Get current match state
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));

  if (!match) {
    return {
      success: false,
      previousStatus: 'created',
      newStatus: 'archived',
      error: `Match not found: ${matchId}`,
    };
  }

  const currentStatus = match.status as MatchStatus;

  // Check if cancel is allowed
  if (!canCancel(currentStatus)) {
    return {
      success: false,
      previousStatus: currentStatus,
      newStatus: 'archived',
      error: `Cannot cancel match in '${currentStatus}' state`,
    };
  }

  // Only creator can cancel
  if (match.createdBy !== userId) {
    return {
      success: false,
      previousStatus: currentStatus,
      newStatus: 'archived',
      error: 'Only the match creator can cancel the match',
    };
  }

  // Release all credit holds for this match
  await releaseAllHolds(matchId);

  // Emit cancel event
  await emitEvent(
    createEvent('match.cancelled', matchId, {
      cancelledBy: userId,
    })
  );

  // Transition to archived
  return transitionMatch(matchId, 'archived', {
    matchId,
    userId,
    reason: 'cancelled',
  });
}

/**
 * Handle timer expiration (auto-transition)
 */
export async function handleTimerExpiration(matchId: string): Promise<TransitionResult> {
  // Get current match state
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));

  if (!match) {
    return {
      success: false,
      previousStatus: 'created',
      newStatus: 'created',
      error: `Match not found: ${matchId}`,
    };
  }

  const currentStatus = match.status as MatchStatus;
  const nextStatus = getTimerTriggeredNextState(currentStatus);

  if (!nextStatus) {
    return {
      success: false,
      previousStatus: currentStatus,
      newStatus: currentStatus,
      error: `No timer-triggered transition from '${currentStatus}'`,
    };
  }

  // Emit timer expired event
  await emitEvent(createEvent('timer.expired', matchId, { previousStatus: currentStatus }));

  // Perform transition
  return transitionMatch(matchId, nextStatus, {
    matchId,
    reason: 'timer_expired',
  });
}

/**
 * Handle participant joining
 */
export async function handleParticipantJoin(
  matchId: string,
  userId: string,
  seat: 'A' | 'B'
): Promise<void> {
  await emitEvent(
    createEvent('participant.joined', matchId, {
      userId,
      seat,
    })
  );

  // If this fills the match, transition to matched
  const participants = await db
    .select()
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));

  if (participants.length === 2) {
    await transitionMatch(matchId, 'matched', { matchId });
  }
}

/**
 * Handle participant ready-up
 */
export async function handleParticipantReady(
  matchId: string,
  userId: string
): Promise<TransitionResult | null> {
  // Get match
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));

  if (!match || match.status !== 'matched') {
    return null;
  }

  // Emit ready event
  await emitEvent(
    createEvent('participant.ready', matchId, {
      userId,
    })
  );

  // Check if all participants are ready
  const participants = await db
    .select()
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));

  const allReady = participants.length === 2 && participants.every((p) => p.readyAt);

  if (allReady) {
    // Transition to in_progress
    return transitionMatch(matchId, 'in_progress', {
      matchId,
      reason: 'all_ready',
    });
  }

  return null;
}

/**
 * Release all credit holds for a match
 */
async function releaseAllHolds(matchId: string): Promise<void> {
  // Get all active holds for this match
  const holds = await db
    .select()
    .from(creditHolds)
    .where(and(eq(creditHolds.matchId, matchId), eq(creditHolds.status, 'active')));

  for (const hold of holds) {
    // Update hold status
    await db
      .update(creditHolds)
      .set({
        status: 'released',
        releasedAt: new Date(),
      })
      .where(eq(creditHolds.id, hold.id));

    // Restore balance to account
    const [account] = await db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.id, hold.accountId));

    if (account) {
      await db
        .update(creditAccounts)
        .set({
          balanceAvailable: account.balanceAvailable + hold.amountReserved,
          balanceReserved: account.balanceReserved - hold.amountReserved,
          updatedAt: new Date(),
        })
        .where(eq(creditAccounts.id, hold.accountId));
    }
  }
}

/**
 * Settle credits after match finalization
 */
export async function settleMatch(
  matchId: string,
  winnerId: string | null,
  isDraw: boolean = false
): Promise<void> {
  // Get all holds for this match
  const holds = await db
    .select({
      hold: creditHolds,
      userId: matchParticipants.userId,
    })
    .from(creditHolds)
    .innerJoin(
      matchParticipants,
      and(
        eq(creditHolds.matchId, matchParticipants.matchId),
        eq(creditHolds.accountId, matchParticipants.userId) // This needs adjustment for account lookup
      )
    )
    .where(and(eq(creditHolds.matchId, matchId), eq(creditHolds.status, 'active')));

  // For simplicity, get all active holds and their accounts
  const activeHolds = await db
    .select()
    .from(creditHolds)
    .where(and(eq(creditHolds.matchId, matchId), eq(creditHolds.status, 'active')));

  if (activeHolds.length === 0) {
    return; // No stakes to settle
  }

  // Calculate total pot
  const totalPot = activeHolds.reduce((sum, h) => sum + h.amountReserved, 0);

  // Platform fee (10%)
  const platformFee = Math.floor(totalPot * 0.1);
  const winnerPayout = totalPot - platformFee;

  for (const hold of activeHolds) {
    // Get the account
    const [account] = await db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.id, hold.accountId));

    if (!account) continue;

    // Get the participant for this account
    const [participant] = await db
      .select()
      .from(matchParticipants)
      .innerJoin(
        creditAccounts,
        eq(matchParticipants.userId, creditAccounts.userId)
      )
      .where(
        and(
          eq(matchParticipants.matchId, matchId),
          eq(creditAccounts.id, hold.accountId)
        )
      );

    let balanceChange = -hold.amountReserved; // Start by removing reserved amount

    if (isDraw) {
      // In a draw, return stakes minus platform fee split
      const returnAmount = hold.amountReserved - Math.floor(platformFee / 2);
      balanceChange = returnAmount - hold.amountReserved;
    } else if (participant && participant.match_participants.userId === winnerId) {
      // Winner gets the payout
      balanceChange = winnerPayout - hold.amountReserved;
    }
    // Loser gets nothing (balanceChange stays at -hold.amountReserved + 0)

    // Update hold status
    await db
      .update(creditHolds)
      .set({
        status: 'settled',
        settledAt: new Date(),
        amountSettled: balanceChange + hold.amountReserved,
      })
      .where(eq(creditHolds.id, hold.id));

    // Update account balance
    await db
      .update(creditAccounts)
      .set({
        balanceAvailable: account.balanceAvailable + hold.amountReserved + balanceChange,
        balanceReserved: account.balanceReserved - hold.amountReserved,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, account.id));
  }

  // Update player ratings using Glicko-2 system
  try {
    const ratingChanges = await updateMatchRatings(matchId, winnerId, isDraw);
    console.log(`[Rating] Updated ratings for match ${matchId}:`, {
      player1: `${ratingChanges.player1.oldRating} → ${ratingChanges.player1.newRating} (${ratingChanges.player1.change > 0 ? '+' : ''}${ratingChanges.player1.change})`,
      player2: `${ratingChanges.player2.oldRating} → ${ratingChanges.player2.newRating} (${ratingChanges.player2.change > 0 ? '+' : ''}${ratingChanges.player2.change})`,
    });
  } catch (error) {
    // Log but don't fail settlement if rating update fails
    console.error(`[Rating] Failed to update ratings for match ${matchId}:`, error);
  }
}

/**
 * Schedule timer-based transition (would use BullMQ in production)
 */
export async function scheduleTimerTransition(
  matchId: string,
  transitionAt: Date,
  toStatus: MatchStatus
): Promise<string> {
  // In production, this would add a job to BullMQ
  // For now, we'll use setTimeout as a placeholder

  const delay = transitionAt.getTime() - Date.now();

  if (delay <= 0) {
    // Already past, trigger immediately
    await handleTimerExpiration(matchId);
    return `immediate_${matchId}`;
  }

  // Create a job ID
  const jobId = `timer_${matchId}_${toStatus}_${Date.now()}`;

  // In production: await matchTimerQueue.add('transition', { matchId, toStatus }, { delay, jobId });

  // Placeholder: setTimeout (not persistent, would not survive server restart)
  setTimeout(async () => {
    try {
      await handleTimerExpiration(matchId);
    } catch (error) {
      console.error(`Timer transition failed for match ${matchId}:`, error);
    }
  }, delay);

  console.log(`Scheduled transition for match ${matchId} to ${toStatus} at ${transitionAt.toISOString()}`);

  return jobId;
}

/**
 * Cancel scheduled timer transition
 */
export async function cancelScheduledTransition(jobId: string): Promise<void> {
  // In production: await matchTimerQueue.remove(jobId);
  console.log(`Cancelled scheduled transition: ${jobId}`);
}

/**
 * Get match state summary for WebSocket/SSE clients
 */
export async function getMatchState(matchId: string): Promise<{
  status: MatchStatus;
  participants: Array<{
    userId: string;
    seat: string;
    isReady: boolean;
    hasForfeited: boolean;
  }>;
  timer: {
    startAt: Date | null;
    endAt: Date | null;
    lockAt: Date | null;
    remainingMs: number | null;
  };
} | null> {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));

  if (!match) {
    return null;
  }

  const participants = await db
    .select()
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));

  const now = Date.now();
  let remainingMs: number | null = null;

  if (match.endAt) {
    remainingMs = Math.max(0, new Date(match.endAt).getTime() - now);
  }

  return {
    status: match.status as MatchStatus,
    participants: participants.map((p) => ({
      userId: p.userId,
      seat: p.seat,
      isReady: !!p.readyAt,
      hasForfeited: !!p.forfeitAt,
    })),
    timer: {
      startAt: match.startAt,
      endAt: match.endAt,
      lockAt: match.lockAt,
      remainingMs,
    },
  };
}

/**
 * Get valid next states from current state
 */
export function getValidNextStates(currentStatus: MatchStatus): MatchStatus[] {
  return VALID_TRANSITIONS[currentStatus] ?? [];
}

/**
 * Check if match is in a terminal state
 */
export function isTerminalState(status: MatchStatus): boolean {
  return status === 'archived';
}

/**
 * Check if match is active (in progress)
 */
export function isActiveState(status: MatchStatus): boolean {
  return ['in_progress', 'submission_locked'].includes(status);
}

/**
 * Check if match is waiting for players
 */
export function isWaitingState(status: MatchStatus): boolean {
  return ['created', 'open', 'matched'].includes(status);
}
