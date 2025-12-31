/**
 * Tournament API Routes
 *
 * Endpoints for tournament management including:
 * - Listing and viewing tournaments
 * - Registration and check-in
 * - Bracket generation and progression
 * - Entry fee handling (credit holds)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count, gte, lte, or, sql } from 'drizzle-orm';

import { db, schema } from '../db';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../lib/errors';
import { createStakeHold, releaseStakeHold, getOrCreateAccount } from '../lib/staking';

const {
  tournaments,
  tournamentRegistrations,
  tournamentBracketMatches,
  users,
  challenges,
  creditAccounts,
  creditHolds,
} = schema;

// Request body schemas
const listTournamentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled']).optional(),
  format: z.enum(['single_elimination', 'double_elimination', 'swiss', 'ladder', 'round_robin']).optional(),
  upcoming: z.coerce.boolean().optional(),
});

const tournamentIdParamSchema = z.object({
  id: z.string().uuid(),
});

const createTournamentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  format: z.enum(['single_elimination', 'double_elimination', 'swiss', 'ladder', 'round_robin']),
  challengeId: z.string().uuid().optional(),
  maxParticipants: z.number().int().min(2).max(256).default(32),
  minParticipants: z.number().int().min(2).default(4),
  registrationStartAt: z.string().datetime().optional(),
  registrationEndAt: z.string().datetime().optional(),
  startAt: z.string().datetime(),
  entryFeeCredits: z.number().int().min(0).default(0),
  prizePoolJson: z.record(z.unknown()).default({}),
  rulesJson: z.record(z.unknown()).default({}),
});

const updateTournamentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  maxParticipants: z.number().int().min(2).max(256).optional(),
  minParticipants: z.number().int().min(2).optional(),
  registrationStartAt: z.string().datetime().optional(),
  registrationEndAt: z.string().datetime().optional(),
  startAt: z.string().datetime().optional(),
  entryFeeCredits: z.number().int().min(0).optional(),
  prizePoolJson: z.record(z.unknown()).optional(),
  rulesJson: z.record(z.unknown()).optional(),
});

// Types for bracket generation
interface BracketMatch {
  round: number;
  position: number;
  bracketSide?: string;
  participant1Id?: string;
  participant2Id?: string;
  status: string;
  nextMatchId?: string;
  loserNextMatchId?: string;
}

// Helper to get user ID from request
const getUserId = (request: FastifyRequest): string => {
  const userId = request.headers['x-user-id'] as string;
  if (!userId) {
    throw new ForbiddenError('User authentication required');
  }
  return userId;
};

// Helper to check if user is admin (simplified)
const isAdmin = (request: FastifyRequest): boolean => {
  // In production, check user role from JWT
  return request.headers['x-admin'] === 'true';
};

/**
 * Generate single elimination bracket
 * Returns matches organized by rounds
 */
function generateSingleEliminationBracket(participantIds: string[]): BracketMatch[] {
  const matches: BracketMatch[] = [];
  const numParticipants = participantIds.length;

  // Find the next power of 2 >= numParticipants
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(numParticipants)));
  const numByes = bracketSize - numParticipants;
  const numRounds = Math.log2(bracketSize);

  // Seed participants (higher seeds get byes)
  const seededParticipants: (string | null)[] = [];
  for (let i = 0; i < bracketSize; i++) {
    if (i < numParticipants) {
      seededParticipants.push(participantIds[i]);
    } else {
      seededParticipants.push(null); // BYE
    }
  }

  // Generate first round matches
  let matchPosition = 0;
  const firstRoundMatches: BracketMatch[] = [];

  for (let i = 0; i < bracketSize; i += 2) {
    const p1 = seededParticipants[i];
    const p2 = seededParticipants[i + 1];

    const match: BracketMatch = {
      round: 1,
      position: matchPosition,
      participant1Id: p1 || undefined,
      participant2Id: p2 || undefined,
      status: p1 && p2 ? 'pending' : 'bye',
    };

    firstRoundMatches.push(match);
    matchPosition++;
  }

  matches.push(...firstRoundMatches);

  // Generate subsequent rounds
  let currentRoundMatches = firstRoundMatches;

  for (let round = 2; round <= numRounds; round++) {
    const nextRoundMatches: BracketMatch[] = [];
    const numMatchesInRound = currentRoundMatches.length / 2;

    for (let i = 0; i < numMatchesInRound; i++) {
      const match: BracketMatch = {
        round,
        position: i,
        status: 'pending',
      };
      nextRoundMatches.push(match);
    }

    // Link previous round matches to next round
    for (let i = 0; i < currentRoundMatches.length; i++) {
      const nextMatchPosition = Math.floor(i / 2);
      // We'll set the actual nextMatchId after inserting to DB
    }

    matches.push(...nextRoundMatches);
    currentRoundMatches = nextRoundMatches;
  }

  return matches;
}

/**
 * Generate double elimination bracket
 */
function generateDoubleEliminationBracket(participantIds: string[]): BracketMatch[] {
  // Generate winners bracket (same as single elimination)
  const winnersMatches = generateSingleEliminationBracket(participantIds);

  // Mark all as winners bracket
  winnersMatches.forEach(m => {
    m.bracketSide = 'winners';
  });

  // Generate losers bracket (more complex - roughly 2x-1 the rounds)
  const numRounds = winnersMatches.reduce((max, m) => Math.max(max, m.round), 0);
  const losersMatches: BracketMatch[] = [];

  // Losers bracket has approximately 2 * numRounds - 1 rounds
  // For simplicity, we'll create placeholder structure
  let losersPosition = 0;
  for (let round = 1; round <= numRounds * 2 - 1; round++) {
    const numMatchesInRound = Math.max(1, Math.floor(Math.pow(2, numRounds - Math.ceil(round / 2) - 1)));

    for (let i = 0; i < numMatchesInRound; i++) {
      losersMatches.push({
        round,
        position: losersPosition++,
        bracketSide: 'losers',
        status: 'pending',
      });
    }
  }

  // Grand finals (winners bracket winner vs losers bracket winner)
  const grandFinals: BracketMatch = {
    round: numRounds + 1,
    position: 0,
    bracketSide: 'grand_finals',
    status: 'pending',
  };

  return [...winnersMatches, ...losersMatches, grandFinals];
}

/**
 * Generate Swiss format rounds
 */
function generateSwissRounds(participantIds: string[], numRounds: number = 5): BracketMatch[] {
  const matches: BracketMatch[] = [];

  // In Swiss, pairings are determined after each round based on standings
  // For initial setup, just create round 1 pairings randomly
  const shuffled = [...participantIds].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      matches.push({
        round: 1,
        position: Math.floor(i / 2),
        participant1Id: shuffled[i],
        participant2Id: shuffled[i + 1],
        status: 'pending',
      });
    } else {
      // Odd player gets a bye
      matches.push({
        round: 1,
        position: Math.floor(i / 2),
        participant1Id: shuffled[i],
        status: 'bye',
      });
    }
  }

  return matches;
}

export async function tournamentRoutes(app: FastifyInstance) {
  // GET /api/tournaments - List tournaments
  app.get('/api/tournaments', async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = listTournamentsQuerySchema.safeParse(request.query);

    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { page, limit, status, format, upcoming } = queryResult.data;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions = [];

    if (status) {
      conditions.push(eq(tournaments.status, status));
    }

    if (format) {
      conditions.push(eq(tournaments.format, format));
    }

    if (upcoming) {
      conditions.push(gte(tournaments.startAt, new Date()));
      // Only show registration_open or registration_closed for upcoming
      conditions.push(
        or(
          eq(tournaments.status, 'registration_open'),
          eq(tournaments.status, 'registration_closed')
        )
      );
    }

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(tournaments)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult?.total ?? 0;

    // Get tournaments with participant count
    const tournamentList = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        description: tournaments.description,
        format: tournaments.format,
        status: tournaments.status,
        maxParticipants: tournaments.maxParticipants,
        minParticipants: tournaments.minParticipants,
        registrationStartAt: tournaments.registrationStartAt,
        registrationEndAt: tournaments.registrationEndAt,
        startAt: tournaments.startAt,
        endAt: tournaments.endAt,
        entryFeeCredits: tournaments.entryFeeCredits,
        prizePoolJson: tournaments.prizePoolJson,
        createdAt: tournaments.createdAt,
      })
      .from(tournaments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tournaments.startAt))
      .limit(limit)
      .offset(offset);

    // Get participant counts for each tournament
    const tournamentIds = tournamentList.map(t => t.id);
    const participantCounts = tournamentIds.length > 0
      ? await db
          .select({
            tournamentId: tournamentRegistrations.tournamentId,
            count: count(),
          })
          .from(tournamentRegistrations)
          .where(sql`${tournamentRegistrations.tournamentId} IN ${tournamentIds}`)
          .groupBy(tournamentRegistrations.tournamentId)
      : [];

    const countMap = new Map(participantCounts.map(p => [p.tournamentId, p.count]));

    const enrichedTournaments = tournamentList.map(t => ({
      ...t,
      participantCount: countMap.get(t.id) || 0,
    }));

    return {
      data: enrichedTournaments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // GET /api/tournaments/:id - Get tournament details
  app.get('/api/tournaments/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, id));

    if (!tournament) {
      throw new NotFoundError('Tournament', id);
    }

    // Get participant count
    const [countResult] = await db
      .select({ count: count() })
      .from(tournamentRegistrations)
      .where(eq(tournamentRegistrations.tournamentId, id));

    // Get challenge info if linked
    let challenge = null;
    if (tournament.challengeId) {
      const [challengeData] = await db
        .select({
          id: challenges.id,
          title: challenges.title,
          category: challenges.category,
          difficulty: challenges.difficulty,
        })
        .from(challenges)
        .where(eq(challenges.id, tournament.challengeId));

      challenge = challengeData;
    }

    return {
      ...tournament,
      participantCount: countResult?.count ?? 0,
      challenge,
    };
  });

  // POST /api/tournaments/:id/join - Register for tournament
  app.post('/api/tournaments/:id/join', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: tournamentId } = paramResult.data;

    // Get tournament
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    // Check registration is open
    if (tournament.status !== 'registration_open') {
      throw new ConflictError(`Registration is not open. Current status: ${tournament.status}`);
    }

    // Check registration deadline
    if (tournament.registrationEndAt && new Date() > tournament.registrationEndAt) {
      throw new ConflictError('Registration deadline has passed');
    }

    // Check if already registered
    const [existingReg] = await db
      .select()
      .from(tournamentRegistrations)
      .where(
        and(
          eq(tournamentRegistrations.tournamentId, tournamentId),
          eq(tournamentRegistrations.userId, userId)
        )
      );

    if (existingReg) {
      throw new ConflictError('Already registered for this tournament');
    }

    // Check participant cap
    const [countResult] = await db
      .select({ count: count() })
      .from(tournamentRegistrations)
      .where(eq(tournamentRegistrations.tournamentId, tournamentId));

    if ((countResult?.count ?? 0) >= tournament.maxParticipants) {
      throw new ConflictError('Tournament is full');
    }

    // Handle entry fee if applicable
    let holdId: string | null = null;
    if (tournament.entryFeeCredits > 0) {
      try {
        const stakeResult = await createStakeHold(userId, tournamentId, tournament.entryFeeCredits);
        holdId = stakeResult.holdId;
      } catch (error) {
        if (error instanceof Error && error.message.includes('Insufficient')) {
          throw new ValidationError('Insufficient credits for entry fee', {
            required: tournament.entryFeeCredits,
          });
        }
        throw error;
      }
    }

    // Create registration
    const [registration] = await db
      .insert(tournamentRegistrations)
      .values({
        tournamentId,
        userId,
      })
      .returning();

    return reply.status(201).send({
      id: registration.id,
      tournamentId,
      userId,
      registeredAt: registration.registeredAt,
      entryFeeHoldId: holdId,
      message: 'Successfully registered for tournament',
    });
  });

  // DELETE /api/tournaments/:id/leave - Withdraw from tournament
  app.delete('/api/tournaments/:id/leave', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: tournamentId } = paramResult.data;

    // Get tournament
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    // Check if can withdraw (only during registration)
    if (tournament.status !== 'registration_open' && tournament.status !== 'registration_closed') {
      throw new ConflictError('Cannot withdraw after tournament has started');
    }

    // Check if registered
    const [registration] = await db
      .select()
      .from(tournamentRegistrations)
      .where(
        and(
          eq(tournamentRegistrations.tournamentId, tournamentId),
          eq(tournamentRegistrations.userId, userId)
        )
      );

    if (!registration) {
      throw new NotFoundError('Registration not found');
    }

    // Release entry fee hold if applicable
    if (tournament.entryFeeCredits > 0) {
      await releaseStakeHold(userId, tournamentId, 'cancelled');
    }

    // Delete registration
    await db
      .delete(tournamentRegistrations)
      .where(eq(tournamentRegistrations.id, registration.id));

    return {
      message: 'Successfully withdrew from tournament',
      refunded: tournament.entryFeeCredits > 0,
    };
  });

  // GET /api/tournaments/:id/participants - List tournament participants
  app.get('/api/tournaments/:id/participants', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: tournamentId } = paramResult.data;

    // Verify tournament exists
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    // Get participants with user info
    const participants = await db
      .select({
        id: tournamentRegistrations.id,
        seed: tournamentRegistrations.seed,
        isCheckedIn: tournamentRegistrations.isCheckedIn,
        eliminatedAt: tournamentRegistrations.eliminatedAt,
        finalPlacement: tournamentRegistrations.finalPlacement,
        registeredAt: tournamentRegistrations.registeredAt,
        user: {
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(tournamentRegistrations)
      .innerJoin(users, eq(tournamentRegistrations.userId, users.id))
      .where(eq(tournamentRegistrations.tournamentId, tournamentId))
      .orderBy(tournamentRegistrations.seed, tournamentRegistrations.registeredAt);

    return {
      tournamentId,
      participants,
      total: participants.length,
    };
  });

  // GET /api/tournaments/:id/bracket - Get tournament bracket
  app.get('/api/tournaments/:id/bracket', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: tournamentId } = paramResult.data;

    // Get tournament
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    // Get bracket matches
    const bracketMatches = await db
      .select()
      .from(tournamentBracketMatches)
      .where(eq(tournamentBracketMatches.tournamentId, tournamentId))
      .orderBy(tournamentBracketMatches.round, tournamentBracketMatches.position);

    // Organize by rounds
    const rounds: Record<number, typeof bracketMatches> = {};
    for (const match of bracketMatches) {
      if (!rounds[match.round]) {
        rounds[match.round] = [];
      }
      rounds[match.round].push(match);
    }

    // Get participant info for display
    const participantIds = new Set<string>();
    bracketMatches.forEach(m => {
      if (m.participant1Id) participantIds.add(m.participant1Id);
      if (m.participant2Id) participantIds.add(m.participant2Id);
      if (m.winnerId) participantIds.add(m.winnerId);
    });

    const participantInfo = participantIds.size > 0
      ? await db
          .select({
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(sql`${users.id} IN ${Array.from(participantIds)}`)
      : [];

    const participantMap = new Map(participantInfo.map(p => [p.id, p]));

    return {
      tournamentId,
      format: tournament.format,
      status: tournament.status,
      rounds,
      matches: bracketMatches,
      participants: Object.fromEntries(participantMap),
      totalRounds: Object.keys(rounds).length,
    };
  });

  // POST /api/tournaments/:id/checkin - Check in for tournament
  app.post('/api/tournaments/:id/checkin', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: tournamentId } = paramResult.data;

    // Get registration
    const [registration] = await db
      .select()
      .from(tournamentRegistrations)
      .where(
        and(
          eq(tournamentRegistrations.tournamentId, tournamentId),
          eq(tournamentRegistrations.userId, userId)
        )
      );

    if (!registration) {
      throw new NotFoundError('Registration not found');
    }

    if (registration.isCheckedIn) {
      throw new ConflictError('Already checked in');
    }

    // Get tournament to verify check-in is allowed
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    // Check-in typically allowed shortly before tournament starts
    if (tournament.status !== 'registration_closed' && tournament.status !== 'registration_open') {
      throw new ConflictError('Check-in not available for this tournament status');
    }

    // Update registration
    await db
      .update(tournamentRegistrations)
      .set({ isCheckedIn: true })
      .where(eq(tournamentRegistrations.id, registration.id));

    return {
      message: 'Successfully checked in',
      tournamentId,
    };
  });

  // Admin routes

  // POST /api/admin/tournaments - Create tournament
  app.post('/api/admin/tournaments', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const bodyResult = createTournamentSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    const data = bodyResult.data;

    // Validate challenge exists if provided
    if (data.challengeId) {
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, data.challengeId));

      if (!challenge) {
        throw new NotFoundError('Challenge', data.challengeId);
      }
    }

    // Create tournament
    const [tournament] = await db
      .insert(tournaments)
      .values({
        name: data.name,
        description: data.description,
        format: data.format,
        status: 'draft',
        challengeId: data.challengeId,
        maxParticipants: data.maxParticipants,
        minParticipants: data.minParticipants,
        registrationStartAt: data.registrationStartAt ? new Date(data.registrationStartAt) : null,
        registrationEndAt: data.registrationEndAt ? new Date(data.registrationEndAt) : null,
        startAt: new Date(data.startAt),
        entryFeeCredits: data.entryFeeCredits,
        prizePoolJson: data.prizePoolJson,
        rulesJson: data.rulesJson,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(tournament);
  });

  // PATCH /api/admin/tournaments/:id - Update tournament
  app.patch('/api/admin/tournaments/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    const bodyResult = updateTournamentSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', {
        issues: bodyResult.error.issues,
      });
    }

    // Get tournament
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, id));

    if (!tournament) {
      throw new NotFoundError('Tournament', id);
    }

    // Can only update draft or registration_open tournaments
    if (tournament.status !== 'draft' && tournament.status !== 'registration_open') {
      throw new ConflictError('Cannot update tournament after registration closes');
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    const data = bodyResult.data;

    if (data.name) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.maxParticipants) updateData.maxParticipants = data.maxParticipants;
    if (data.minParticipants) updateData.minParticipants = data.minParticipants;
    if (data.registrationStartAt) updateData.registrationStartAt = new Date(data.registrationStartAt);
    if (data.registrationEndAt) updateData.registrationEndAt = new Date(data.registrationEndAt);
    if (data.startAt) updateData.startAt = new Date(data.startAt);
    if (data.entryFeeCredits !== undefined) updateData.entryFeeCredits = data.entryFeeCredits;
    if (data.prizePoolJson) updateData.prizePoolJson = data.prizePoolJson;
    if (data.rulesJson) updateData.rulesJson = data.rulesJson;

    const [updated] = await db
      .update(tournaments)
      .set(updateData)
      .where(eq(tournaments.id, id))
      .returning();

    return updated;
  });

  // POST /api/admin/tournaments/:id/publish - Open registration
  app.post('/api/admin/tournaments/:id/publish', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, id));

    if (!tournament) {
      throw new NotFoundError('Tournament', id);
    }

    if (tournament.status !== 'draft') {
      throw new ConflictError(`Cannot publish tournament with status '${tournament.status}'`);
    }

    const [updated] = await db
      .update(tournaments)
      .set({
        status: 'registration_open',
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, id))
      .returning();

    return {
      ...updated,
      message: 'Registration is now open',
    };
  });

  // POST /api/admin/tournaments/:id/close-registration - Close registration
  app.post('/api/admin/tournaments/:id/close-registration', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, id));

    if (!tournament) {
      throw new NotFoundError('Tournament', id);
    }

    if (tournament.status !== 'registration_open') {
      throw new ConflictError(`Cannot close registration for tournament with status '${tournament.status}'`);
    }

    // Check minimum participants
    const [countResult] = await db
      .select({ count: count() })
      .from(tournamentRegistrations)
      .where(eq(tournamentRegistrations.tournamentId, id));

    if ((countResult?.count ?? 0) < tournament.minParticipants) {
      throw new ValidationError('Not enough participants to close registration', {
        required: tournament.minParticipants,
        current: countResult?.count ?? 0,
      });
    }

    const [updated] = await db
      .update(tournaments)
      .set({
        status: 'registration_closed',
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, id))
      .returning();

    return {
      ...updated,
      message: 'Registration is now closed',
    };
  });

  // POST /api/admin/tournaments/:id/generate-bracket - Generate bracket
  app.post('/api/admin/tournaments/:id/generate-bracket', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: tournamentId } = paramResult.data;

    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    if (tournament.status !== 'registration_closed') {
      throw new ConflictError('Bracket can only be generated after registration closes');
    }

    // Get registered participants (checked-in only, or all if no check-in requirement)
    const registrations = await db
      .select()
      .from(tournamentRegistrations)
      .where(eq(tournamentRegistrations.tournamentId, tournamentId))
      .orderBy(tournamentRegistrations.seed, tournamentRegistrations.registeredAt);

    const participantIds = registrations.map(r => r.userId);

    if (participantIds.length < tournament.minParticipants) {
      throw new ValidationError('Not enough participants', {
        required: tournament.minParticipants,
        current: participantIds.length,
      });
    }

    // Generate bracket based on format
    let bracketMatches: BracketMatch[];

    switch (tournament.format) {
      case 'single_elimination':
        bracketMatches = generateSingleEliminationBracket(participantIds);
        break;
      case 'double_elimination':
        bracketMatches = generateDoubleEliminationBracket(participantIds);
        break;
      case 'swiss':
        bracketMatches = generateSwissRounds(participantIds);
        break;
      default:
        throw new ValidationError(`Bracket generation not implemented for format: ${tournament.format}`);
    }

    // Insert bracket matches
    const insertedMatches = await db
      .insert(tournamentBracketMatches)
      .values(
        bracketMatches.map(m => ({
          tournamentId,
          round: m.round,
          position: m.position,
          bracketSide: m.bracketSide,
          participant1Id: m.participant1Id,
          participant2Id: m.participant2Id,
          status: m.status,
        }))
      )
      .returning();

    // Update tournament status
    await db
      .update(tournaments)
      .set({
        status: 'in_progress',
        bracketJson: { generated: true, matchCount: insertedMatches.length },
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, tournamentId));

    return {
      message: 'Bracket generated successfully',
      tournamentId,
      matchCount: insertedMatches.length,
      format: tournament.format,
    };
  });

  // POST /api/admin/tournaments/:id/cancel - Cancel tournament
  app.post('/api/admin/tournaments/:id/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const paramResult = tournamentIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id: tournamentId } = paramResult.data;

    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    if (tournament.status === 'completed' || tournament.status === 'cancelled') {
      throw new ConflictError(`Cannot cancel tournament with status '${tournament.status}'`);
    }

    // Release all entry fee holds
    if (tournament.entryFeeCredits > 0) {
      const registrations = await db
        .select()
        .from(tournamentRegistrations)
        .where(eq(tournamentRegistrations.tournamentId, tournamentId));

      for (const reg of registrations) {
        await releaseStakeHold(reg.userId, tournamentId, 'cancelled');
      }
    }

    // Update tournament status
    const [updated] = await db
      .update(tournaments)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, tournamentId))
      .returning();

    return {
      ...updated,
      message: 'Tournament cancelled. Entry fees have been refunded.',
    };
  });
}
