/**
 * Credit Staking Service
 *
 * Handles the staking lifecycle for competitive matches:
 * - Creating holds when joining a match
 * - Releasing holds on forfeit/cancel
 * - Settling stakes after match completion
 *
 * All operations are idempotent using idempotency keys.
 */

import crypto from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  creditAccounts,
  creditHolds,
  creditLedgerEntries,
  matches,
  matchParticipants,
  type CreditAccount,
  type CreditHold,
} from '../db/schema';

// Platform fee percentage (e.g., 10%)
const PLATFORM_FEE_PERCENT = 10;

// Types
export interface StakeResult {
  holdId: string;
  amount: number;
  idempotencyKey: string;
}

export interface ReleaseResult {
  holdId: string;
  amountReleased: number;
  idempotencyKey: string;
}

export interface SettlementResult {
  matchId: string;
  outcome: 'winner' | 'tie' | 'cancelled';
  winnerId?: string;
  distributions: Array<{
    userId: string;
    amount: number;
    type: 'winnings' | 'refund' | 'tie_split';
  }>;
  platformFee: number;
  idempotencyKey: string;
}

export type SettlementOutcome = 'winner_a' | 'winner_b' | 'tie' | 'cancelled';

// Helper to generate idempotency key
function generateIdempotencyKey(prefix: string, ...parts: string[]): string {
  const data = [prefix, ...parts].join(':');
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 32);
}

/**
 * Get or create a credit account for a user
 */
export async function getOrCreateAccount(userId: string): Promise<CreditAccount> {
  const [existingAccount] = await db
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
    .limit(1);

  if (existingAccount) {
    return existingAccount;
  }

  const [newAccount] = await db
    .insert(creditAccounts)
    .values({ userId })
    .returning();

  return newAccount;
}

/**
 * Create a stake hold for a match
 *
 * - Checks sufficient available balance
 * - Creates a hold record
 * - Updates account balances (available -> reserved)
 * - Creates ledger entry
 *
 * Idempotent: returns existing hold if already created
 */
export async function createStakeHold(
  userId: string,
  matchId: string,
  amount: number
): Promise<StakeResult> {
  if (amount <= 0) {
    throw new Error('Stake amount must be positive');
  }

  const idempotencyKey = generateIdempotencyKey('stake', matchId, userId);

  // Check if already processed (idempotent)
  const [existingEntry] = await db
    .select()
    .from(creditLedgerEntries)
    .where(eq(creditLedgerEntries.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existingEntry) {
    // Find the associated hold
    const [hold] = await db
      .select()
      .from(creditHolds)
      .where(
        and(
          eq(creditHolds.matchId, matchId),
          eq(creditHolds.amountReserved, amount)
        )
      )
      .limit(1);

    if (hold) {
      return {
        holdId: hold.id,
        amount,
        idempotencyKey,
      };
    }
  }

  // Get or create account
  const account = await getOrCreateAccount(userId);

  // Check sufficient balance
  if (account.balanceAvailable < amount) {
    throw new Error(
      `Insufficient balance. Available: ${account.balanceAvailable}, Required: ${amount}`
    );
  }

  // Check if hold already exists for this match
  const [existingHold] = await db
    .select()
    .from(creditHolds)
    .where(
      and(
        eq(creditHolds.accountId, account.id),
        eq(creditHolds.matchId, matchId),
        eq(creditHolds.status, 'active')
      )
    )
    .limit(1);

  if (existingHold) {
    return {
      holdId: existingHold.id,
      amount: existingHold.amountReserved,
      idempotencyKey,
    };
  }

  // Create hold and update balances atomically
  const [hold] = await db.transaction(async (tx) => {
    // Update account balances
    await tx
      .update(creditAccounts)
      .set({
        balanceAvailable: sql`${creditAccounts.balanceAvailable} - ${amount}`,
        balanceReserved: sql`${creditAccounts.balanceReserved} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, account.id));

    // Create hold record
    const [newHold] = await tx
      .insert(creditHolds)
      .values({
        accountId: account.id,
        matchId,
        amountReserved: amount,
        status: 'active',
      })
      .returning();

    // Create ledger entry
    await tx.insert(creditLedgerEntries).values({
      idempotencyKey,
      accountId: account.id,
      type: 'stake_hold',
      amount: -amount, // Negative for holds
      matchId,
      metadataJson: {
        holdId: newHold.id,
        reason: 'Match stake hold',
      },
    });

    return [newHold];
  });

  return {
    holdId: hold.id,
    amount,
    idempotencyKey,
  };
}

/**
 * Release a stake hold (forfeit/cancel)
 *
 * - Returns credits to available balance
 * - Marks hold as released
 * - Creates ledger entry
 *
 * Idempotent: no-op if already released
 */
export async function releaseStakeHold(
  userId: string,
  matchId: string,
  reason: 'forfeit' | 'cancelled' = 'forfeit'
): Promise<ReleaseResult | null> {
  const idempotencyKey = generateIdempotencyKey('release', matchId, userId, reason);

  // Check if already processed (idempotent)
  const [existingEntry] = await db
    .select()
    .from(creditLedgerEntries)
    .where(eq(creditLedgerEntries.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existingEntry) {
    return {
      holdId: '',
      amountReleased: Math.abs(existingEntry.amount),
      idempotencyKey,
    };
  }

  // Get account
  const account = await getOrCreateAccount(userId);

  // Find active hold for this match
  const [hold] = await db
    .select()
    .from(creditHolds)
    .where(
      and(
        eq(creditHolds.accountId, account.id),
        eq(creditHolds.matchId, matchId),
        eq(creditHolds.status, 'active')
      )
    )
    .limit(1);

  if (!hold) {
    // No active hold found
    return null;
  }

  const amount = hold.amountReserved;

  // Release hold atomically
  await db.transaction(async (tx) => {
    // Update account balances
    await tx
      .update(creditAccounts)
      .set({
        balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${amount}`,
        balanceReserved: sql`${creditAccounts.balanceReserved} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, account.id));

    // Update hold status
    await tx
      .update(creditHolds)
      .set({
        status: 'released',
        releasedAt: new Date(),
      })
      .where(eq(creditHolds.id, hold.id));

    // Create ledger entry
    await tx.insert(creditLedgerEntries).values({
      idempotencyKey,
      accountId: account.id,
      type: 'stake_release',
      amount: amount, // Positive for release
      matchId,
      metadataJson: {
        holdId: hold.id,
        reason,
      },
    });
  });

  return {
    holdId: hold.id,
    amountReleased: amount,
    idempotencyKey,
  };
}

/**
 * Settle a match
 *
 * - Distributes stakes based on outcome
 * - Winner gets loser's stake minus platform fee
 * - Tie splits stakes evenly
 * - Creates ledger entries for all parties
 *
 * Idempotent: returns cached result if already settled
 */
export async function settleMatch(
  matchId: string,
  outcome: SettlementOutcome
): Promise<SettlementResult> {
  const idempotencyKey = generateIdempotencyKey('settle', matchId, outcome);

  // Check if already processed (idempotent)
  const existingEntries = await db
    .select()
    .from(creditLedgerEntries)
    .where(
      and(
        eq(creditLedgerEntries.matchId, matchId),
        sql`${creditLedgerEntries.metadataJson}->>'settlementKey' = ${idempotencyKey}`
      )
    );

  if (existingEntries.length > 0) {
    // Reconstruct result from existing entries
    const metadata = existingEntries[0].metadataJson as Record<string, unknown>;
    return metadata.settlementResult as SettlementResult;
  }

  // Get match with participants
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    throw new Error(`Match not found: ${matchId}`);
  }

  // Get participants
  const participants = await db
    .select()
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));

  if (participants.length !== 2) {
    throw new Error(`Expected 2 participants, found ${participants.length}`);
  }

  const participantA = participants.find(p => p.seat === 'A');
  const participantB = participants.find(p => p.seat === 'B');

  if (!participantA || !participantB) {
    throw new Error('Missing participant in seat A or B');
  }

  // Get holds for both participants
  const accountA = await getOrCreateAccount(participantA.userId);
  const accountB = await getOrCreateAccount(participantB.userId);

  const [holdA] = await db
    .select()
    .from(creditHolds)
    .where(
      and(
        eq(creditHolds.accountId, accountA.id),
        eq(creditHolds.matchId, matchId),
        eq(creditHolds.status, 'active')
      )
    )
    .limit(1);

  const [holdB] = await db
    .select()
    .from(creditHolds)
    .where(
      and(
        eq(creditHolds.accountId, accountB.id),
        eq(creditHolds.matchId, matchId),
        eq(creditHolds.status, 'active')
      )
    )
    .limit(1);

  if (!holdA || !holdB) {
    throw new Error('Missing stake holds for participants');
  }

  const stakeA = holdA.amountReserved;
  const stakeB = holdB.amountReserved;
  const totalPot = stakeA + stakeB;

  let result: SettlementResult;
  const distributions: SettlementResult['distributions'] = [];

  // Execute settlement based on outcome
  await db.transaction(async (tx) => {
    // Mark both holds as consumed
    await tx
      .update(creditHolds)
      .set({ status: 'consumed', releasedAt: new Date() })
      .where(eq(creditHolds.id, holdA.id));

    await tx
      .update(creditHolds)
      .set({ status: 'consumed', releasedAt: new Date() })
      .where(eq(creditHolds.id, holdB.id));

    // Reduce reserved balance for both
    await tx
      .update(creditAccounts)
      .set({
        balanceReserved: sql`${creditAccounts.balanceReserved} - ${stakeA}`,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, accountA.id));

    await tx
      .update(creditAccounts)
      .set({
        balanceReserved: sql`${creditAccounts.balanceReserved} - ${stakeB}`,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, accountB.id));

    let platformFee = 0;
    let winnerId: string | undefined;

    if (outcome === 'cancelled') {
      // Full refund to both
      await tx
        .update(creditAccounts)
        .set({
          balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${stakeA}`,
        })
        .where(eq(creditAccounts.id, accountA.id));

      await tx
        .update(creditAccounts)
        .set({
          balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${stakeB}`,
        })
        .where(eq(creditAccounts.id, accountB.id));

      distributions.push(
        { userId: participantA.userId, amount: stakeA, type: 'refund' },
        { userId: participantB.userId, amount: stakeB, type: 'refund' }
      );

      result = {
        matchId,
        outcome: 'cancelled',
        distributions,
        platformFee: 0,
        idempotencyKey,
      };

    } else if (outcome === 'tie') {
      // Split pot evenly, no platform fee on ties
      const splitAmount = Math.floor(totalPot / 2);
      const remainder = totalPot - splitAmount * 2;

      await tx
        .update(creditAccounts)
        .set({
          balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${splitAmount}`,
        })
        .where(eq(creditAccounts.id, accountA.id));

      // Give any remainder to player B (arbitrary)
      await tx
        .update(creditAccounts)
        .set({
          balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${splitAmount + remainder}`,
        })
        .where(eq(creditAccounts.id, accountB.id));

      distributions.push(
        { userId: participantA.userId, amount: splitAmount, type: 'tie_split' },
        { userId: participantB.userId, amount: splitAmount + remainder, type: 'tie_split' }
      );

      result = {
        matchId,
        outcome: 'tie',
        distributions,
        platformFee: 0,
        idempotencyKey,
      };

    } else {
      // Winner takes all (minus platform fee)
      const isWinnerA = outcome === 'winner_a';
      const winnerAccount = isWinnerA ? accountA : accountB;
      const loserAccount = isWinnerA ? accountB : accountA;
      const loserStake = isWinnerA ? stakeB : stakeA;
      const winnerStake = isWinnerA ? stakeA : stakeB;
      winnerId = isWinnerA ? participantA.userId : participantB.userId;

      // Calculate platform fee (only on loser's stake, the "winnings")
      platformFee = Math.floor(loserStake * PLATFORM_FEE_PERCENT / 100);
      const winnings = loserStake - platformFee;
      const winnerTotal = winnerStake + winnings;

      // Winner gets their stake back + winnings
      await tx
        .update(creditAccounts)
        .set({
          balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${winnerTotal}`,
        })
        .where(eq(creditAccounts.id, winnerAccount.id));

      // Loser gets nothing (stake already consumed)

      distributions.push({
        userId: winnerId,
        amount: winnerTotal,
        type: 'winnings',
      });

      result = {
        matchId,
        outcome: 'winner',
        winnerId,
        distributions,
        platformFee,
        idempotencyKey,
      };
    }

    // Create ledger entries for both participants
    for (const dist of distributions) {
      const account = dist.userId === participantA.userId ? accountA : accountB;
      await tx.insert(creditLedgerEntries).values({
        idempotencyKey: generateIdempotencyKey('settle-dist', matchId, dist.userId),
        accountId: account.id,
        type: dist.type === 'refund' ? 'stake_release' : 'earn',
        amount: dist.amount,
        matchId,
        metadataJson: {
          settlementKey: idempotencyKey,
          distributionType: dist.type,
          settlementResult: result,
        },
      });
    }

    // Create platform fee entry if applicable
    if (platformFee > 0) {
      await tx.insert(creditLedgerEntries).values({
        idempotencyKey: generateIdempotencyKey('settle-fee', matchId),
        accountId: accountA.id, // Arbitrary, just for record-keeping
        type: 'fee',
        amount: -platformFee,
        matchId,
        metadataJson: {
          settlementKey: idempotencyKey,
          feeType: 'platform_fee',
          feePercent: PLATFORM_FEE_PERCENT,
        },
      });
    }
  });

  return result!;
}

/**
 * Get stake amount for a match from challenge configuration
 * (Placeholder - would read from challenge version config)
 */
export async function getMatchStakeAmount(matchId: string): Promise<number> {
  // For now, return a default stake amount
  // In production, would read from challenge version configuration
  return 100; // 100 credits default stake
}

/**
 * Check if a user has sufficient balance to stake
 */
export async function canStake(userId: string, amount: number): Promise<boolean> {
  const account = await getOrCreateAccount(userId);
  return account.balanceAvailable >= amount;
}

/**
 * Get active holds for a user
 */
export async function getActiveHolds(userId: string): Promise<CreditHold[]> {
  const account = await getOrCreateAccount(userId);

  return db
    .select()
    .from(creditHolds)
    .where(
      and(
        eq(creditHolds.accountId, account.id),
        eq(creditHolds.status, 'active')
      )
    );
}
