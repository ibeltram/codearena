import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, or, desc, count } from 'drizzle-orm';
import { randomBytes } from 'crypto';

import { db, schema } from '../db';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../lib/errors';
import {
  transitionMatch,
  forfeitMatch as stateMachineForfeit,
  cancelMatch,
  handleParticipantReady,
  scheduleTimerTransition,
  getMatchState,
  isValidTransition,
  canForfeit,
  canCancel,
  type MatchStatus,
} from '../lib/match-state-machine';
import { validateStakeAmount } from '../lib/rating-service';
import {
  determineWinnerWithExplanation,
  type ScoringResult,
  type WinnerDeterminationResult,
} from '../lib/scoring-engine';
import {
  joinQueue,
  findMatch,
  executeMatch,
  isUserInQueue,
  removeUserFromQueues,
  getQueueStats,
} from '../lib/matchmaking';

const {
  matches,
  matchParticipants,
  challengeVersions,
  challenges,
  creditAccounts,
  creditHolds,
  users,
} = schema;

// Constants
const DEFAULT_MATCH_DURATION_MINUTES = 60;
const DEFAULT_STAKE_AMOUNT = 100;

// Request body schemas
const createMatchSchema = z.object({
  challengeVersionId: z.string().uuid(),
  mode: z.enum(['invite', 'ranked']).default('invite'),
  stakeAmount: z.number().int().min(0).default(DEFAULT_STAKE_AMOUNT),
  durationMinutes: z.number().int().min(5).max(480).default(DEFAULT_MATCH_DURATION_MINUTES),
});

const joinQueueSchema = z.object({
  challengeVersionId: z.string().uuid().optional(),
  category: z.enum(['frontend', 'backend', 'fullstack', 'algorithm', 'devops']).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  stakeAmount: z.number().int().min(0).default(DEFAULT_STAKE_AMOUNT),
});

const matchIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Query parameter schema
const listMatchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['created', 'open', 'matched', 'in_progress', 'submission_locked', 'judging', 'finalized', 'archived']).optional(),
  mode: z.enum(['ranked', 'invite', 'tournament']).optional(),
});

// Helper to generate invite code
function generateInviteCode(): string {
  return randomBytes(6).toString('hex').toUpperCase();
}

// Helper to get or create credit account for user
async function getOrCreateCreditAccount(userId: string) {
  const [existingAccount] = await db
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId));

  if (existingAccount) {
    return existingAccount;
  }

  const [newAccount] = await db
    .insert(creditAccounts)
    .values({ userId })
    .returning();

  return newAccount;
}

// Helper to create a credit hold for match stake
async function createStakeHold(accountId: string, matchId: string, amount: number) {
  // Check if user has sufficient balance
  const [account] = await db
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.id, accountId));

  if (!account || account.balanceAvailable < amount) {
    throw new ValidationError('Insufficient credits for stake', {
      required: amount,
      available: account?.balanceAvailable ?? 0,
    });
  }

  // Create hold and update account balance atomically
  const [hold] = await db
    .insert(creditHolds)
    .values({
      accountId,
      matchId,
      amountReserved: amount,
      status: 'active',
    })
    .returning();

  await db
    .update(creditAccounts)
    .set({
      balanceAvailable: account.balanceAvailable - amount,
      balanceReserved: account.balanceReserved + amount,
      updatedAt: new Date(),
    })
    .where(eq(creditAccounts.id, accountId));

  return hold;
}

// Helper to check if match can be joined
function canJoinMatch(status: string): boolean {
  return status === 'created' || status === 'open';
}

// Helper to check if a user is banned or suspended
async function checkUserCanCompete(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const [user] = await db
    .select({
      isBanned: users.isBanned,
      suspendedUntil: users.suspendedUntil,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  if (user.isBanned) {
    return { allowed: false, reason: 'Your account has been permanently banned. You cannot participate in matches.' };
  }

  if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
    const suspendedUntilDate = new Date(user.suspendedUntil);
    return {
      allowed: false,
      reason: `Your account is temporarily suspended until ${suspendedUntilDate.toISOString()}. You cannot participate in matches during this time.`,
    };
  }

  return { allowed: true };
}

// Helper to check if match can transition to ready
function canReadyUp(status: string): boolean {
  return status === 'matched';
}

// Valid state transitions for reference
const MATCH_STATE_TRANSITIONS: Record<string, string[]> = {
  created: ['open', 'archived'],
  open: ['matched', 'archived'],
  matched: ['in_progress', 'open', 'finalized', 'archived'],
  in_progress: ['submission_locked', 'finalized'],
  submission_locked: ['judging', 'finalized'],
  judging: ['finalized'],
  finalized: ['archived'],
  archived: [],
};

export async function matchRoutes(app: FastifyInstance) {
  // TODO: Add auth middleware - for now we'll use a mock user ID from header
  // In production, this would come from JWT verification
  const getUserId = (request: FastifyRequest): string => {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) {
      throw new ForbiddenError('User authentication required');
    }
    return userId;
  };

  // GET /api/matches - List matches (optionally filtered)
  app.get('/api/matches', async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = listMatchesQuerySchema.safeParse(request.query);

    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { page, limit, status, mode } = queryResult.data;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions = [];

    if (status) {
      conditions.push(eq(matches.status, status));
    }

    if (mode) {
      conditions.push(eq(matches.mode, mode));
    }

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(matches)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult?.total ?? 0;

    // Get matches with challenge info
    const matchList = await db
      .select({
        id: matches.id,
        status: matches.status,
        mode: matches.mode,
        createdBy: matches.createdBy,
        createdAt: matches.createdAt,
        startAt: matches.startAt,
        endAt: matches.endAt,
        lockAt: matches.lockAt,
        disputeStatus: matches.disputeStatus,
        challengeVersion: {
          id: challengeVersions.id,
          versionNumber: challengeVersions.versionNumber,
        },
        challenge: {
          id: challenges.id,
          slug: challenges.slug,
          title: challenges.title,
          category: challenges.category,
          difficulty: challenges.difficulty,
        },
      })
      .from(matches)
      .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
      .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(matches.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: matchList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // GET /api/matches/:id - Get match details
  app.get('/api/matches/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = matchIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    // Get match with challenge info
    const [match] = await db
      .select({
        id: matches.id,
        challengeVersionId: matches.challengeVersionId,
        status: matches.status,
        mode: matches.mode,
        createdBy: matches.createdBy,
        createdAt: matches.createdAt,
        startAt: matches.startAt,
        endAt: matches.endAt,
        lockAt: matches.lockAt,
        configHash: matches.configHash,
        disputeStatus: matches.disputeStatus,
        challengeVersion: {
          id: challengeVersions.id,
          versionNumber: challengeVersions.versionNumber,
          requirementsJson: challengeVersions.requirementsJson,
          rubricJson: challengeVersions.rubricJson,
          constraintsJson: challengeVersions.constraintsJson,
          templateRef: challengeVersions.templateRef,
        },
        challenge: {
          id: challenges.id,
          slug: challenges.slug,
          title: challenges.title,
          description: challenges.description,
          category: challenges.category,
          difficulty: challenges.difficulty,
        },
      })
      .from(matches)
      .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
      .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
      .where(eq(matches.id, id));

    if (!match) {
      throw new NotFoundError('Match', id);
    }

    // Get participants
    const participants = await db
      .select({
        id: matchParticipants.id,
        seat: matchParticipants.seat,
        joinedAt: matchParticipants.joinedAt,
        readyAt: matchParticipants.readyAt,
        submissionId: matchParticipants.submissionId,
        forfeitAt: matchParticipants.forfeitAt,
        user: {
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(matchParticipants)
      .innerJoin(users, eq(matchParticipants.userId, users.id))
      .where(eq(matchParticipants.matchId, id));

    return {
      ...match,
      participants,
    };
  });

  // POST /api/matches - Create a new invite match
  app.post('/api/matches', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    // Check if user can compete (not banned/suspended)
    const competitionCheck = await checkUserCanCompete(userId);
    if (!competitionCheck.allowed) {
      throw new ForbiddenError(competitionCheck.reason || 'You cannot create matches at this time');
    }

    const bodyResult = createMatchSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { challengeVersionId, mode, stakeAmount, durationMinutes } = bodyResult.data;

    // Verify challenge version exists and is published
    const [version] = await db
      .select({
        id: challengeVersions.id,
        publishedAt: challengeVersions.publishedAt,
        challenge: {
          id: challenges.id,
          isPublished: challenges.isPublished,
        },
      })
      .from(challengeVersions)
      .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
      .where(eq(challengeVersions.id, challengeVersionId));

    if (!version) {
      throw new NotFoundError('Challenge Version', challengeVersionId);
    }

    if (!version.challenge.isPublished || !version.publishedAt) {
      throw new ValidationError('Challenge is not published');
    }

    // Validate stake cap based on rating if stake > 0
    if (stakeAmount > 0) {
      const stakeValidation = await validateStakeAmount(userId, stakeAmount);
      if (!stakeValidation.valid) {
        throw new ValidationError(stakeValidation.reason || 'Stake exceeds your rating-based cap', {
          requested: stakeAmount,
          maxAllowed: stakeValidation.maxAllowed,
        });
      }
    }

    // Get or create credit account and check balance if stake > 0
    let creditAccount = null;
    if (stakeAmount > 0) {
      creditAccount = await getOrCreateCreditAccount(userId);
      if (creditAccount.balanceAvailable < stakeAmount) {
        throw new ValidationError('Insufficient credits for stake', {
          required: stakeAmount,
          available: creditAccount.balanceAvailable,
        });
      }
    }

    // Generate invite code for shareable link
    const inviteCode = generateInviteCode();
    const configHash = `${challengeVersionId}:${stakeAmount}:${durationMinutes}:${inviteCode}`;

    // Create the match
    const [newMatch] = await db
      .insert(matches)
      .values({
        challengeVersionId,
        status: 'created',
        mode,
        createdBy: userId,
        configHash,
      })
      .returning();

    // Add creator as first participant (seat A)
    const [participant] = await db
      .insert(matchParticipants)
      .values({
        matchId: newMatch.id,
        userId,
        seat: 'A',
      })
      .returning();

    // Create stake hold if stakeAmount > 0
    let hold = null;
    if (stakeAmount > 0 && creditAccount) {
      hold = await createStakeHold(creditAccount.id, newMatch.id, stakeAmount);
    }

    // Use state machine to transition to 'open' (waiting for opponent)
    const transitionResult = await transitionMatch(newMatch.id, 'open', {
      matchId: newMatch.id,
      userId,
      reason: 'match_created',
    });

    if (!transitionResult.success) {
      throw new ConflictError(transitionResult.error || 'Failed to open match');
    }

    return reply.status(201).send({
      id: newMatch.id,
      inviteCode,
      inviteLink: `/matches/${newMatch.id}/join?code=${inviteCode}`,
      status: 'open',
      mode,
      stakeAmount,
      durationMinutes,
      participant: {
        id: participant.id,
        seat: participant.seat,
      },
      stakeHold: hold ? { id: hold.id, amount: hold.amountReserved } : null,
    });
  });

  // POST /api/matches/queue - Join ranked matchmaking queue (Redis-based)
  app.post('/api/matches/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    // Check if user can compete (not banned/suspended)
    const competitionCheck = await checkUserCanCompete(userId);
    if (!competitionCheck.allowed) {
      throw new ForbiddenError(competitionCheck.reason || 'You cannot join the queue at this time');
    }

    const bodyResult = joinQueueSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { challengeVersionId, category, difficulty, stakeAmount } = bodyResult.data;

    // Check if user is already in the Redis queue
    const existingQueueEntry = await isUserInQueue(userId);
    if (existingQueueEntry) {
      throw new ConflictError('Already in matchmaking queue');
    }

    // Check if user is already in an active match
    const existingParticipation = await db
      .select({
        matchId: matchParticipants.matchId,
        matchStatus: matches.status,
      })
      .from(matchParticipants)
      .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
      .where(
        and(
          eq(matchParticipants.userId, userId),
          or(
            eq(matches.status, 'open'),
            eq(matches.status, 'matched'),
            eq(matches.status, 'in_progress')
          )
        )
      );

    if (existingParticipation.length > 0) {
      throw new ConflictError('Already in an active match');
    }

    // Validate stake cap based on rating if stake > 0
    if (stakeAmount > 0) {
      const stakeValidation = await validateStakeAmount(userId, stakeAmount);
      if (!stakeValidation.valid) {
        throw new ValidationError(stakeValidation.reason || 'Stake exceeds your rating-based cap', {
          requested: stakeAmount,
          maxAllowed: stakeValidation.maxAllowed,
        });
      }
    }

    // Verify credit balance if stake > 0
    let creditAccount = null;
    if (stakeAmount > 0) {
      creditAccount = await getOrCreateCreditAccount(userId);
      if (creditAccount.balanceAvailable < stakeAmount) {
        throw new ValidationError('Insufficient credits for stake', {
          required: stakeAmount,
          available: creditAccount.balanceAvailable,
        });
      }
    }

    // Add player to Redis queue
    const queueEntry = await joinQueue(userId, {
      challengeVersionId,
      category,
      difficulty,
      stakeAmount,
    });

    // Try to find a match immediately
    const matchResult = await findMatch(queueEntry);

    if (matchResult.matched && matchResult.matchedWith) {
      // Found an opponent! Execute the match
      const opponent = matchResult.matchedWith;
      const effectiveStake = matchResult.effectiveStake || 0;

      // Remove both players from queue atomically
      const execResult = await executeMatch(queueEntry, opponent);
      if (!execResult.success) {
        // Failed to execute match (race condition), stay in queue
        return reply.status(202).send({
          matched: false,
          queueId: queueEntry.queueId,
          rating: queueEntry.rating,
          tier: queueEntry.tier,
          stakeCap: queueEntry.stakeCap,
          message: 'Waiting in queue for opponent... (match attempt failed, retrying)',
        });
      }

      // Find a challenge version for the match
      let versionToUse = challengeVersionId || opponent.challengeVersionId;

      if (!versionToUse) {
        // Find a random published challenge matching criteria
        const versionConditions = [eq(challenges.isPublished, true)];

        const effectiveCategory = category || opponent.category;
        const effectiveDifficulty = difficulty || opponent.difficulty;

        if (effectiveCategory) {
          versionConditions.push(eq(challenges.category, effectiveCategory));
        }
        if (effectiveDifficulty) {
          versionConditions.push(eq(challenges.difficulty, effectiveDifficulty));
        }

        const [randomVersion] = await db
          .select({ id: challengeVersions.id })
          .from(challengeVersions)
          .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
          .where(and(...versionConditions))
          .orderBy(desc(challengeVersions.publishedAt))
          .limit(1);

        if (!randomVersion) {
          // No challenge found - put players back in queue (edge case)
          await joinQueue(userId, { challengeVersionId, category, difficulty, stakeAmount });
          await joinQueue(opponent.userId, {
            challengeVersionId: opponent.challengeVersionId,
            category: opponent.category,
            difficulty: opponent.difficulty,
            stakeAmount: opponent.requestedStake,
          });
          throw new NotFoundError('No matching challenges found');
        }

        versionToUse = randomVersion.id;
      }

      // Create match in database
      const [newMatch] = await db
        .insert(matches)
        .values({
          challengeVersionId: versionToUse,
          status: 'matched', // Skip 'open' since we have both players
          mode: 'ranked',
          createdBy: userId,
        })
        .returning();

      // Add both participants
      await db.insert(matchParticipants).values([
        { matchId: newMatch.id, userId, seat: 'A' },
        { matchId: newMatch.id, userId: opponent.userId, seat: 'B' },
      ]);

      // Create stake holds for both players using the effective stake
      let hold = null;
      if (effectiveStake > 0) {
        if (creditAccount) {
          hold = await createStakeHold(creditAccount.id, newMatch.id, effectiveStake);
        }
        // Create hold for opponent too
        const opponentAccount = await getOrCreateCreditAccount(opponent.userId);
        if (opponentAccount.balanceAvailable >= effectiveStake) {
          await createStakeHold(opponentAccount.id, newMatch.id, effectiveStake);
        }
      }

      return reply.status(200).send({
        matched: true,
        matchId: newMatch.id,
        seat: 'A',
        opponentRating: opponent.rating,
        opponentTier: opponent.tier,
        effectiveStake,
        ratingDifference: Math.abs(queueEntry.rating - opponent.rating),
        message: 'Matched with opponent! Both players need to ready up.',
        stakeHold: hold ? { id: hold.id, amount: hold.amountReserved } : null,
      });
    }

    // No match found - player is now in Redis queue waiting
    return reply.status(202).send({
      matched: false,
      queueId: queueEntry.queueId,
      rating: queueEntry.rating,
      tier: queueEntry.tier,
      stakeCap: queueEntry.stakeCap,
      ratingRange: 100, // Initial range
      message: 'Waiting in queue for opponent... Rating range will expand over time.',
    });
  });

  // DELETE /api/matches/queue - Leave matchmaking queue
  app.delete('/api/matches/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const removed = await removeUserFromQueues(userId);

    if (!removed) {
      throw new NotFoundError('Not currently in queue');
    }

    return reply.status(200).send({
      success: true,
      message: 'Left matchmaking queue',
    });
  });

  // GET /api/matches/queue/status - Get queue status for current user
  app.get('/api/matches/queue/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const entry = await isUserInQueue(userId);

    if (!entry) {
      return reply.status(200).send({
        inQueue: false,
      });
    }

    // Calculate current rating range based on wait time
    const waitTimeSeconds = Math.floor((Date.now() - entry.joinedAt) / 1000);
    let currentRange = 100; // Initial
    if (waitTimeSeconds >= 180) currentRange = 500;
    else if (waitTimeSeconds >= 120) currentRange = 300;
    else if (waitTimeSeconds >= 60) currentRange = 200;
    else if (waitTimeSeconds >= 30) currentRange = 150;

    return reply.status(200).send({
      inQueue: true,
      queueId: entry.queueId,
      rating: entry.rating,
      tier: entry.tier,
      stakeCap: entry.stakeCap,
      requestedStake: entry.requestedStake,
      waitTimeSeconds,
      currentRatingRange: currentRange,
      joinedAt: new Date(entry.joinedAt).toISOString(),
    });
  });

  // GET /api/matches/queue/stats - Get queue statistics (admin/public)
  app.get('/api/matches/queue/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await getQueueStats();

    return reply.status(200).send({
      totalPlayers: stats.totalPlayers,
      ratingDistribution: stats.ratingDistribution,
      averageWaitTimeSeconds: Math.round(stats.averageWaitTimeMs / 1000),
    });
  });

  // POST /api/matches/queue/poll - Poll for match (called periodically by clients in queue)
  app.post('/api/matches/queue/poll', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const entry = await isUserInQueue(userId);

    if (!entry) {
      throw new NotFoundError('Not in queue');
    }

    // Try to find a match
    const matchResult = await findMatch(entry);

    if (matchResult.matched && matchResult.matchedWith) {
      // Found an opponent!
      const opponent = matchResult.matchedWith;
      const effectiveStake = matchResult.effectiveStake || 0;

      // Execute match (removes both from queue)
      const execResult = await executeMatch(entry, opponent);
      if (!execResult.success) {
        // Race condition - stay in queue
        return reply.status(200).send({
          matched: false,
          stillInQueue: true,
          queueId: entry.queueId,
          waitTimeSeconds: Math.floor((Date.now() - entry.joinedAt) / 1000),
          message: 'Still searching for opponent...',
        });
      }

      // Find a challenge version
      let versionToUse = entry.challengeVersionId || opponent.challengeVersionId;

      if (!versionToUse) {
        const versionConditions = [eq(challenges.isPublished, true)];
        const effectiveCategory = entry.category || opponent.category;
        const effectiveDifficulty = entry.difficulty || opponent.difficulty;

        if (effectiveCategory) {
          versionConditions.push(eq(challenges.category, effectiveCategory));
        }
        if (effectiveDifficulty) {
          versionConditions.push(eq(challenges.difficulty, effectiveDifficulty));
        }

        const [randomVersion] = await db
          .select({ id: challengeVersions.id })
          .from(challengeVersions)
          .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
          .where(and(...versionConditions))
          .orderBy(desc(challengeVersions.publishedAt))
          .limit(1);

        if (randomVersion) {
          versionToUse = randomVersion.id;
        }
      }

      if (!versionToUse) {
        // Re-queue both players
        await joinQueue(userId, {
          challengeVersionId: entry.challengeVersionId,
          category: entry.category,
          difficulty: entry.difficulty,
          stakeAmount: entry.requestedStake,
        });
        await joinQueue(opponent.userId, {
          challengeVersionId: opponent.challengeVersionId,
          category: opponent.category,
          difficulty: opponent.difficulty,
          stakeAmount: opponent.requestedStake,
        });
        throw new NotFoundError('No matching challenges found');
      }

      // Create match
      const [newMatch] = await db
        .insert(matches)
        .values({
          challengeVersionId: versionToUse,
          status: 'matched',
          mode: 'ranked',
          createdBy: userId,
        })
        .returning();

      await db.insert(matchParticipants).values([
        { matchId: newMatch.id, userId, seat: 'A' },
        { matchId: newMatch.id, userId: opponent.userId, seat: 'B' },
      ]);

      // Create stake holds
      let hold = null;
      if (effectiveStake > 0) {
        const creditAccount = await getOrCreateCreditAccount(userId);
        if (creditAccount.balanceAvailable >= effectiveStake) {
          hold = await createStakeHold(creditAccount.id, newMatch.id, effectiveStake);
        }
        const opponentAccount = await getOrCreateCreditAccount(opponent.userId);
        if (opponentAccount.balanceAvailable >= effectiveStake) {
          await createStakeHold(opponentAccount.id, newMatch.id, effectiveStake);
        }
      }

      return reply.status(200).send({
        matched: true,
        matchId: newMatch.id,
        seat: 'A',
        opponentRating: opponent.rating,
        opponentTier: opponent.tier,
        effectiveStake,
        ratingDifference: Math.abs(entry.rating - opponent.rating),
        message: 'Matched with opponent! Both players need to ready up.',
        stakeHold: hold ? { id: hold.id, amount: hold.amountReserved } : null,
      });
    }

    // No match yet
    const waitTimeSeconds = Math.floor((Date.now() - entry.joinedAt) / 1000);
    let currentRange = 100;
    if (waitTimeSeconds >= 180) currentRange = 500;
    else if (waitTimeSeconds >= 120) currentRange = 300;
    else if (waitTimeSeconds >= 60) currentRange = 200;
    else if (waitTimeSeconds >= 30) currentRange = 150;

    return reply.status(200).send({
      matched: false,
      stillInQueue: true,
      queueId: entry.queueId,
      waitTimeSeconds,
      currentRatingRange: currentRange,
      message: `Searching for opponent within ±${currentRange} rating...`,
    });
  });

  // POST /api/matches/:id/join - Join an existing match by invite
  app.post('/api/matches/:id/join', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    // Check if user can compete (not banned/suspended)
    const competitionCheck = await checkUserCanCompete(userId);
    if (!competitionCheck.allowed) {
      throw new ForbiddenError(competitionCheck.reason || 'You cannot join matches at this time');
    }

    const paramResult = matchIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;

    // Get the match
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new NotFoundError('Match', matchId);
    }

    // Check if match is joinable
    if (!canJoinMatch(match.status)) {
      throw new ConflictError(`Cannot join match with status '${match.status}'`);
    }

    // Check if user is already a participant
    const [existingParticipant] = await db
      .select()
      .from(matchParticipants)
      .where(
        and(
          eq(matchParticipants.matchId, matchId),
          eq(matchParticipants.userId, userId)
        )
      );

    if (existingParticipant) {
      throw new ConflictError('Already joined this match');
    }

    // Check if match is full (2 participants max)
    const participantCount = await db
      .select({ count: count() })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId));

    if ((participantCount[0]?.count ?? 0) >= 2) {
      throw new ConflictError('Match is already full');
    }

    // Get stake amount from config hash (simplified - in production would be stored properly)
    // For now, assume 100 credit stake
    const stakeAmount = DEFAULT_STAKE_AMOUNT;

    // Verify credit balance and stake cap if stake > 0
    let creditAccount = null;
    let hold = null;
    if (stakeAmount > 0) {
      // Check stake cap based on rating
      const stakeValidation = await validateStakeAmount(userId, stakeAmount);
      if (!stakeValidation.valid) {
        throw new ValidationError(stakeValidation.reason || 'Stake exceeds your rating-based cap', {
          requested: stakeAmount,
          maxAllowed: stakeValidation.maxAllowed,
        });
      }

      creditAccount = await getOrCreateCreditAccount(userId);
      if (creditAccount.balanceAvailable < stakeAmount) {
        throw new ValidationError('Insufficient credits for stake', {
          required: stakeAmount,
          available: creditAccount.balanceAvailable,
        });
      }
      hold = await createStakeHold(creditAccount.id, matchId, stakeAmount);
    }

    // Add user as participant (seat B since seat A is taken by creator)
    const [participant] = await db
      .insert(matchParticipants)
      .values({
        matchId,
        userId,
        seat: 'B',
      })
      .returning();

    // Use state machine to transition to 'matched'
    const transitionResult = await transitionMatch(matchId, 'matched', {
      matchId,
      userId,
      reason: 'opponent_joined_invite',
    });

    if (!transitionResult.success) {
      throw new ConflictError(transitionResult.error || 'Failed to update match status');
    }

    return reply.status(200).send({
      matchId,
      seat: participant.seat,
      status: 'matched',
      message: 'Joined match! Both players need to ready up to start.',
      stakeHold: hold ? { id: hold.id, amount: hold.amountReserved } : null,
    });
  });

  // POST /api/matches/:id/ready - Signal readiness to start
  app.post('/api/matches/:id/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const paramResult = matchIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;

    // Get the match
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new NotFoundError('Match', matchId);
    }

    // Check if match is in 'matched' status
    if (!canReadyUp(match.status)) {
      throw new ConflictError(`Cannot ready up in match with status '${match.status}'`);
    }

    // Check if user is a participant
    const [participant] = await db
      .select()
      .from(matchParticipants)
      .where(
        and(
          eq(matchParticipants.matchId, matchId),
          eq(matchParticipants.userId, userId)
        )
      );

    if (!participant) {
      throw new ForbiddenError('Not a participant in this match');
    }

    // Check if already ready
    if (participant.readyAt) {
      throw new ConflictError('Already marked as ready');
    }

    // Mark participant as ready
    const now = new Date();
    await db
      .update(matchParticipants)
      .set({ readyAt: now })
      .where(eq(matchParticipants.id, participant.id));

    // Check if all participants are ready using state machine
    const allParticipants = await db
      .select()
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId));

    const allReady = allParticipants.length === 2 && allParticipants.every(p => p.readyAt || p.id === participant.id);

    if (allReady) {
      // Use state machine to start the match
      const transitionResult = await transitionMatch(matchId, 'in_progress', {
        matchId,
        userId,
        reason: 'all_players_ready',
      });

      if (!transitionResult.success) {
        throw new ConflictError(transitionResult.error || 'Failed to start match');
      }

      // Get updated match for timestamps
      const [updatedMatch] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId));

      // Schedule timer-based transition to submission_locked at endAt
      if (updatedMatch?.endAt) {
        await scheduleTimerTransition(matchId, new Date(updatedMatch.endAt), 'submission_locked');
      }

      return reply.status(200).send({
        matchId,
        status: 'in_progress',
        message: 'Match started! Good luck!',
        startedAt: updatedMatch?.startAt?.toISOString(),
        endsAt: updatedMatch?.endAt?.toISOString(),
        allReady: true,
      });
    }

    return reply.status(200).send({
      matchId,
      status: 'matched',
      message: 'Ready! Waiting for opponent to ready up...',
      readyAt: now.toISOString(),
      allReady: false,
    });
  });

  // POST /api/matches/:id/forfeit - Forfeit the match
  app.post('/api/matches/:id/forfeit', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const paramResult = matchIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;

    // Get the match
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new NotFoundError('Match', matchId);
    }

    // Use state machine's canForfeit check
    if (!canForfeit(match.status as MatchStatus)) {
      throw new ConflictError(`Cannot forfeit match with status '${match.status}'`);
    }

    // Use state machine to handle forfeit (handles participant validation internally)
    const forfeitResult = await stateMachineForfeit(matchId, userId);

    if (!forfeitResult.success) {
      if (forfeitResult.error?.includes('not a participant')) {
        throw new ForbiddenError('Not a participant in this match');
      }
      if (forfeitResult.error?.includes('already forfeited')) {
        throw new ConflictError('Already forfeited');
      }
      throw new ConflictError(forfeitResult.error || 'Failed to forfeit');
    }

    return reply.status(200).send({
      matchId,
      status: forfeitResult.newStatus,
      message: 'Match forfeited. Opponent wins by default.',
      forfeitedAt: new Date().toISOString(),
    });
  });

  // GET /api/matches/my - Get current user's matches
  app.get('/api/matches/my', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const queryResult = listMatchesQuerySchema.safeParse(request.query);

    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { page, limit, status } = queryResult.data;
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [eq(matchParticipants.userId, userId)];

    if (status) {
      conditions.push(eq(matches.status, status));
    }

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(matchParticipants)
      .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
      .where(and(...conditions));

    const total = countResult?.total ?? 0;

    // Get user's matches
    const userMatches = await db
      .select({
        id: matches.id,
        status: matches.status,
        mode: matches.mode,
        createdAt: matches.createdAt,
        startAt: matches.startAt,
        endAt: matches.endAt,
        seat: matchParticipants.seat,
        readyAt: matchParticipants.readyAt,
        challenge: {
          id: challenges.id,
          title: challenges.title,
          category: challenges.category,
          difficulty: challenges.difficulty,
        },
      })
      .from(matchParticipants)
      .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
      .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
      .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
      .where(and(...conditions))
      .orderBy(desc(matches.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: userMatches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // GET /api/matches/:id/state - Get real-time match state (for WebSocket/polling)
  app.get('/api/matches/:id/state', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = matchIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;

    const matchState = await getMatchState(matchId);

    if (!matchState) {
      throw new NotFoundError('Match', matchId);
    }

    return matchState;
  });

  // POST /api/matches/:id/cancel - Cancel a match (creator only, before it starts)
  app.post('/api/matches/:id/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const paramResult = matchIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;

    // Get the match
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new NotFoundError('Match', matchId);
    }

    // Use state machine's canCancel check
    if (!canCancel(match.status as MatchStatus)) {
      throw new ConflictError(`Cannot cancel match with status '${match.status}'`);
    }

    // Use state machine to handle cancel
    const cancelResult = await cancelMatch(matchId, userId);

    if (!cancelResult.success) {
      if (cancelResult.error?.includes('Only the match creator')) {
        throw new ForbiddenError(cancelResult.error);
      }
      throw new ConflictError(cancelResult.error || 'Failed to cancel match');
    }

    return reply.status(200).send({
      matchId,
      status: cancelResult.newStatus,
      message: 'Match cancelled. Stakes have been released.',
    });
  });

  // POST /api/matches/:id/transition - Admin/system endpoint for explicit state transitions
  app.post('/api/matches/:id/transition', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const paramResult = matchIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;

    // Parse body for target status
    const transitionSchema = z.object({
      toStatus: z.enum([
        'created',
        'open',
        'matched',
        'in_progress',
        'submission_locked',
        'judging',
        'finalized',
        'archived',
      ]),
      reason: z.string().optional(),
    });

    const bodyResult = transitionSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { toStatus, reason } = bodyResult.data;

    // Get current match
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new NotFoundError('Match', matchId);
    }

    // Check if transition is valid
    if (!isValidTransition(match.status as MatchStatus, toStatus)) {
      throw new ConflictError(
        `Invalid transition from '${match.status}' to '${toStatus}'. Valid next states: ${
          MATCH_STATE_TRANSITIONS[match.status]?.join(', ') || 'none'
        }`
      );
    }

    // Perform transition
    const transitionResult = await transitionMatch(matchId, toStatus, {
      matchId,
      userId,
      reason: reason || 'manual_transition',
    });

    if (!transitionResult.success) {
      throw new ConflictError(transitionResult.error || 'Transition failed');
    }

    return reply.status(200).send({
      matchId,
      previousStatus: transitionResult.previousStatus,
      newStatus: transitionResult.newStatus,
      event: transitionResult.event,
    });
  });

  // GET /api/matches/:id/transitions - Get valid next transitions for a match
  app.get('/api/matches/:id/transitions', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = matchIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;

    // Get current match
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new NotFoundError('Match', matchId);
    }

    const currentStatus = match.status as MatchStatus;
    const validTransitions = MATCH_STATE_TRANSITIONS[currentStatus] || [];

    return {
      matchId,
      currentStatus,
      validTransitions,
      canForfeit: canForfeit(currentStatus),
      canCancel: canCancel(currentStatus),
    };
  });

  // GET /api/matches/:id/results - Get judging results for a finalized match
  app.get('/api/matches/:id/results', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = matchIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;

    // Get match with participants
    const [match] = await db
      .select({
        id: matches.id,
        status: matches.status,
        startAt: matches.startAt,
        endAt: matches.endAt,
      })
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new NotFoundError('Match', matchId);
    }

    // Get participants with user details
    const participantsList = await db
      .select({
        id: matchParticipants.id,
        seat: matchParticipants.seat,
        userId: matchParticipants.userId,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(matchParticipants)
      .innerJoin(users, eq(matchParticipants.userId, users.id))
      .where(eq(matchParticipants.matchId, matchId));

    // Get scores for this match
    const { scores: scoresTable, judgementRuns } = schema;
    const scoresList = await db
      .select({
        id: scoresTable.id,
        userId: scoresTable.userId,
        totalScore: scoresTable.totalScore,
        breakdownJson: scoresTable.breakdownJson,
        automatedResultsJson: scoresTable.automatedResultsJson,
        aiJudgeResultsJson: scoresTable.aiJudgeResultsJson,
        createdAt: scoresTable.createdAt,
        judgementRunId: scoresTable.judgementRunId,
      })
      .from(scoresTable)
      .where(eq(scoresTable.matchId, matchId));

    // Get the latest judgement run
    const [latestRun] = await db
      .select()
      .from(judgementRuns)
      .where(eq(judgementRuns.matchId, matchId))
      .orderBy(desc(judgementRuns.startedAt))
      .limit(1);

    // Combine participants with their scores
    const participantsWithScores = participantsList.map((p) => {
      const score = scoresList.find((s) => s.userId === p.userId);
      return {
        ...p,
        score: score ? {
          totalScore: score.totalScore,
          breakdown: score.breakdownJson,
          automatedResults: score.automatedResultsJson,
          aiJudgeResults: score.aiJudgeResultsJson,
          createdAt: score.createdAt,
        } : null,
      };
    });

    // Determine winner (if match is finalized)
    let winner: typeof participantsWithScores[0] | null = null;
    let isTie = false;
    let tieBreaker: string | null = null;

    if (match.status === 'finalized' && participantsWithScores.length === 2) {
      const [p1, p2] = participantsWithScores;
      const s1 = p1.score?.totalScore ?? 0;
      const s2 = p2.score?.totalScore ?? 0;

      // Extract tie-breaker data from breakdown
      const b1 = p1.score?.breakdown as {
        buildSuccess?: boolean;
        requirements?: Array<{ testsMatched?: number; testsPassed?: number }>;
      } | undefined;
      const b2 = p2.score?.breakdown as {
        buildSuccess?: boolean;
        requirements?: Array<{ testsMatched?: number; testsPassed?: number }>;
      } | undefined;

      // Create scoring results for winner determination
      const scoring1: ScoringResult = {
        totalScore: s1,
        maxScore: 100,
        requirements: [],
        tieBreakers: {
          testsPassed: b1?.requirements?.reduce((sum, r) => sum + (r.testsPassed || 0), 0) || 0,
          criticalErrors: b1?.buildSuccess === false ? 10 : 0,
          submitTime: p1.score?.createdAt ? new Date(p1.score.createdAt) : undefined,
        },
        metadata: { scoredAt: new Date(), engineVersion: '1.0.0', duration: 0 },
      };

      const scoring2: ScoringResult = {
        totalScore: s2,
        maxScore: 100,
        requirements: [],
        tieBreakers: {
          testsPassed: b2?.requirements?.reduce((sum, r) => sum + (r.testsPassed || 0), 0) || 0,
          criticalErrors: b2?.buildSuccess === false ? 10 : 0,
          submitTime: p2.score?.createdAt ? new Date(p2.score.createdAt) : undefined,
        },
        metadata: { scoredAt: new Date(), engineVersion: '1.0.0', duration: 0 },
      };

      // Use scoring engine to determine winner with detailed explanation
      const tieBreakersOrder = ['tests_passed', 'critical_errors', 'submit_time'];
      const result = determineWinnerWithExplanation(scoring1, scoring2, tieBreakersOrder);

      if (result.winner === 'A') {
        winner = p1;
        isTie = false;
        tieBreaker = result.tieBreaker;
      } else if (result.winner === 'B') {
        winner = p2;
        isTie = false;
        tieBreaker = result.tieBreaker;
      } else {
        // True tie - no winner could be determined
        isTie = true;
        tieBreaker = null;
      }
    }

    return {
      matchId,
      status: match.status,
      startAt: match.startAt,
      endAt: match.endAt,
      participants: participantsWithScores,
      winner: winner ? {
        id: winner.id,
        userId: winner.userId,
        displayName: winner.displayName,
        avatarUrl: winner.avatarUrl,
        seat: winner.seat,
        totalScore: winner.score?.totalScore ?? 0,
      } : null,
      isTie,
      tieBreaker,
      judgementRun: latestRun ? {
        id: latestRun.id,
        status: latestRun.status,
        startedAt: latestRun.startedAt,
        completedAt: latestRun.completedAt,
        logsKey: latestRun.logsKey,
      } : null,
    };
  });

  // GET /api/matches/:id/compare - Get match comparison with artifact details for both participants
  app.get('/api/matches/:id/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = matchIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid match ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: matchId } = paramResult.data;

    // Get match with challenge info
    const [match] = await db
      .select({
        id: matches.id,
        status: matches.status,
        startAt: matches.startAt,
        endAt: matches.endAt,
      })
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new NotFoundError('Match', matchId);
    }

    // Get participants with user details and submissions
    const participantsList = await db
      .select({
        id: matchParticipants.id,
        seat: matchParticipants.seat,
        userId: matchParticipants.userId,
        submissionId: matchParticipants.submissionId,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(matchParticipants)
      .innerJoin(users, eq(matchParticipants.userId, users.id))
      .where(eq(matchParticipants.matchId, matchId));

    if (participantsList.length < 2) {
      throw new ValidationError('Match does not have two participants yet');
    }

    // Get submissions and artifacts for each participant
    const { submissions, artifacts, scores: scoresTable } = schema;

    const submissionsList = await db
      .select({
        id: submissions.id,
        userId: submissions.userId,
        submittedAt: submissions.submittedAt,
        artifactId: submissions.artifactId,
        artifact: {
          id: artifacts.id,
          contentHash: artifacts.contentHash,
          storageKey: artifacts.storageKey,
          sizeBytes: artifacts.sizeBytes,
          createdAt: artifacts.createdAt,
          secretScanStatus: artifacts.secretScanStatus,
          isPublicBlocked: artifacts.isPublicBlocked,
          manifestJson: artifacts.manifestJson,
        },
      })
      .from(submissions)
      .innerJoin(artifacts, eq(submissions.artifactId, artifacts.id))
      .where(eq(submissions.matchId, matchId));

    // Get scores for this match
    const scoresList = await db
      .select({
        id: scoresTable.id,
        userId: scoresTable.userId,
        totalScore: scoresTable.totalScore,
        breakdownJson: scoresTable.breakdownJson,
      })
      .from(scoresTable)
      .where(eq(scoresTable.matchId, matchId));

    // Build comparison structure
    type ParticipantWithArtifact = {
      userId: string;
      displayName: string;
      avatarUrl: string | null;
      seat: string;
      artifact: typeof submissionsList[0]['artifact'] | null;
      score: {
        totalScore: number;
        breakdown: Array<{ requirementId: string; title: string; score: number; maxScore: number }>;
      } | null;
      isWinner: boolean;
    };

    const participantsWithArtifacts: ParticipantWithArtifact[] = participantsList.map((p) => {
      const submission = submissionsList.find((s) => s.userId === p.userId);
      const score = scoresList.find((s) => s.userId === p.userId);

      return {
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        seat: p.seat,
        artifact: submission?.artifact || null,
        score: score ? {
          totalScore: score.totalScore,
          breakdown: (score.breakdownJson as Array<{ requirementId: string; title: string; score: number; maxScore: number }>) || [],
        } : null,
        isWinner: false,
      };
    });

    // Determine winner if match is finalized
    if (match.status === 'finalized' && participantsWithArtifacts.length === 2) {
      const [p1, p2] = participantsWithArtifacts;
      const s1 = p1.score?.totalScore ?? 0;
      const s2 = p2.score?.totalScore ?? 0;

      if (s1 > s2) {
        p1.isWinner = true;
      } else if (s2 > s1) {
        p2.isWinner = true;
      }
      // If tied, neither is winner (tie-breaker logic handled in /results endpoint)
    }

    // Build file comparison if both have artifacts
    let comparison = null;
    if (participantsWithArtifacts[0].artifact && participantsWithArtifacts[1].artifact) {
      const leftManifest = participantsWithArtifacts[0].artifact.manifestJson as { files?: Array<{ path: string; size: number; hash: string; isText?: boolean; isBinary?: boolean }> } | null;
      const rightManifest = participantsWithArtifacts[1].artifact.manifestJson as { files?: Array<{ path: string; size: number; hash: string; isText?: boolean; isBinary?: boolean }> } | null;

      const leftFiles = leftManifest?.files || [];
      const rightFiles = rightManifest?.files || [];

      const leftPaths = new Set(leftFiles.map((f) => f.path));
      const rightPaths = new Set(rightFiles.map((f) => f.path));

      const added = rightFiles.filter((f) => !leftPaths.has(f.path)).map((f) => f.path);
      const removed = leftFiles.filter((f) => !rightPaths.has(f.path)).map((f) => f.path);
      const modified: string[] = [];
      const unchanged: string[] = [];

      for (const leftFile of leftFiles) {
        if (rightPaths.has(leftFile.path)) {
          const rightFile = rightFiles.find((f) => f.path === leftFile.path);
          if (rightFile && leftFile.hash !== rightFile.hash) {
            modified.push(leftFile.path);
          } else {
            unchanged.push(leftFile.path);
          }
        }
      }

      comparison = {
        added,
        removed,
        modified,
        unchanged,
        totalFiles: {
          left: leftFiles.length,
          right: rightFiles.length,
        },
      };
    }

    // Determine left and right participants by seat
    const leftParticipant = participantsWithArtifacts.find((p) => p.seat === 'A') || participantsWithArtifacts[0];
    const rightParticipant = participantsWithArtifacts.find((p) => p.seat === 'B') || participantsWithArtifacts[1];

    return {
      matchId,
      leftParticipant,
      rightParticipant,
      comparison,
    };
  });
}
