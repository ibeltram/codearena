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

  // POST /api/matches/queue - Join ranked matchmaking queue
  app.post('/api/matches/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const bodyResult = joinQueueSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const { challengeVersionId, category, difficulty, stakeAmount } = bodyResult.data;

    // Check if user is already in a match queue or active match
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
      throw new ConflictError('Already in an active match or queue');
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

    // Build conditions to find an open ranked match
    const matchConditions = [
      eq(matches.status, 'open'),
      eq(matches.mode, 'ranked'),
    ];

    // If specific challenge version requested
    if (challengeVersionId) {
      matchConditions.push(eq(matches.challengeVersionId, challengeVersionId));
    }

    // Try to find an existing open ranked match
    // In production, this would use a more sophisticated matching algorithm
    // considering rating, stake amount, category preferences, etc.
    const [openMatch] = await db
      .select({
        id: matches.id,
        challengeVersionId: matches.challengeVersionId,
        status: matches.status,
      })
      .from(matches)
      .where(and(...matchConditions))
      .limit(1);

    if (openMatch) {
      // Join existing match
      const [participant] = await db
        .insert(matchParticipants)
        .values({
          matchId: openMatch.id,
          userId,
          seat: 'B',
        })
        .returning();

      // Create stake hold if needed
      let hold = null;
      if (stakeAmount > 0 && creditAccount) {
        hold = await createStakeHold(creditAccount.id, openMatch.id, stakeAmount);
      }

      // Use state machine to transition to 'matched'
      const transitionResult = await transitionMatch(openMatch.id, 'matched', {
        matchId: openMatch.id,
        userId,
        reason: 'opponent_joined_queue',
      });

      if (!transitionResult.success) {
        throw new ConflictError(transitionResult.error || 'Failed to match');
      }

      return reply.status(200).send({
        matched: true,
        matchId: openMatch.id,
        seat: 'B',
        message: 'Matched with opponent! Both players need to ready up.',
        stakeHold: hold ? { id: hold.id, amount: hold.amountReserved } : null,
      });
    }

    // No match found - need to find a challenge version to create a new match
    let versionToUse = challengeVersionId;

    if (!versionToUse) {
      // Find a random published challenge matching criteria
      const versionConditions = [eq(challenges.isPublished, true)];

      if (category) {
        versionConditions.push(eq(challenges.category, category));
      }
      if (difficulty) {
        versionConditions.push(eq(challenges.difficulty, difficulty));
      }

      const [randomVersion] = await db
        .select({ id: challengeVersions.id })
        .from(challengeVersions)
        .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
        .where(and(...versionConditions))
        .orderBy(desc(challengeVersions.publishedAt))
        .limit(1);

      if (!randomVersion) {
        throw new NotFoundError('No matching challenges found');
      }

      versionToUse = randomVersion.id;
    }

    // Create new ranked match
    const [newMatch] = await db
      .insert(matches)
      .values({
        challengeVersionId: versionToUse,
        status: 'open',
        mode: 'ranked',
        createdBy: userId,
      })
      .returning();

    // Add user as first participant
    const [participant] = await db
      .insert(matchParticipants)
      .values({
        matchId: newMatch.id,
        userId,
        seat: 'A',
      })
      .returning();

    // Create stake hold if needed
    let hold = null;
    if (stakeAmount > 0 && creditAccount) {
      hold = await createStakeHold(creditAccount.id, newMatch.id, stakeAmount);
    }

    return reply.status(201).send({
      matched: false,
      matchId: newMatch.id,
      seat: 'A',
      message: 'Waiting in queue for opponent...',
      stakeHold: hold ? { id: hold.id, amount: hold.amountReserved } : null,
    });
  });

  // POST /api/matches/:id/join - Join an existing match by invite
  app.post('/api/matches/:id/join', async (request: FastifyRequest, reply: FastifyReply) => {
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
}
