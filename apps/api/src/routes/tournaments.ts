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
  prizeClaims,
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
  checkInStartAt: z.string().datetime().optional(),
  checkInEndAt: z.string().datetime().optional(),
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
  checkInStartAt: z.string().datetime().optional(),
  checkInEndAt: z.string().datetime().optional(),
  startAt: z.string().datetime().optional(),
  entryFeeCredits: z.number().int().min(0).optional(),
  prizePoolJson: z.record(z.unknown()).optional(),
  rulesJson: z.record(z.unknown()).optional(),
});

// Prize claim schemas
const createPrizeClaimSchema = z.object({
  prizeType: z.enum(['cash', 'crypto', 'hardware', 'saas_bundle']),
  paymentDetails: z.object({
    paypalEmail: z.string().email().optional(),
    walletAddress: z.string().optional(),
    shippingAddress: z.object({
      name: z.string(),
      street: z.string(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string(),
      country: z.string(),
    }).optional(),
  }),
});

const listPrizeClaimsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'fulfilled', 'denied']).optional(),
  tournamentId: z.string().uuid().optional(),
});

const prizeClaimIdParamSchema = z.object({
  claimId: z.string().uuid(),
});

const adminUpdatePrizeClaimSchema = z.object({
  status: z.enum(['approved', 'denied', 'fulfilled']),
  adminNotes: z.string().optional(),
  denialReason: z.string().optional(),
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

// Swiss tournament types
interface SwissStanding {
  participantId: string;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  buchholz: number; // Sum of opponents' points (primary tie-breaker)
  sonnebornBerger: number; // Sum of points of beaten opponents + half points of drawn opponents
  opponentIds: string[]; // Track who they've played to avoid repeat pairings
}

interface SwissRules {
  numRounds?: number;
  pointsForWin?: number;
  pointsForDraw?: number;
  pointsForLoss?: number;
  pointsForBye?: number;
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
 *
 * Double elimination structure:
 * - Winners Bracket: Standard single elimination
 * - Losers Bracket: Players who lose in winners get a second chance
 *   - Alternates between "drop-down" rounds (receiving losers from winners) and "progression" rounds
 * - Grand Finals: Winners bracket champion vs Losers bracket champion
 * - Bracket Reset: If losers winner beats winners champion, they play again (both have 1 loss)
 *
 * Losers bracket round structure (for N winners rounds):
 *   - LR1: Losers from WR1 (first half) vs Losers from WR1 (second half)
 *   - LR2: Winners of LR1 vs Losers from WR2 (drop-down)
 *   - LR3: Winners of LR2 play each other (progression)
 *   - LR4: Winners of LR3 vs Losers from WR3 (drop-down)
 *   - ... and so on
 *   - Total losers rounds: 2 * (N - 1)
 */
function generateDoubleEliminationBracket(participantIds: string[]): BracketMatch[] {
  const numParticipants = participantIds.length;

  // Need at least 2 participants
  if (numParticipants < 2) {
    return [];
  }

  // Generate winners bracket (same as single elimination)
  const winnersMatches = generateSingleEliminationBracket(participantIds);

  // Mark all as winners bracket
  winnersMatches.forEach(m => {
    m.bracketSide = 'winners';
  });

  const winnersNumRounds = winnersMatches.reduce((max, m) => Math.max(max, m.round), 0);

  // For very small brackets (2-3 participants), single elimination is sufficient
  if (winnersNumRounds < 2) {
    // Just add a simple losers bracket and grand finals
    const loserMatch: BracketMatch = {
      round: 1,
      position: 0,
      bracketSide: 'losers',
      status: 'pending',
    };

    const grandFinals: BracketMatch = {
      round: 2,
      position: 0,
      bracketSide: 'grand_finals',
      status: 'pending',
    };

    const bracketReset: BracketMatch = {
      round: 3,
      position: 0,
      bracketSide: 'grand_finals_reset',
      status: 'pending',
    };

    return [...winnersMatches, loserMatch, grandFinals, bracketReset];
  }

  // Build losers bracket structure
  // Losers bracket has 2 * (winnersNumRounds - 1) rounds
  const losersNumRounds = 2 * (winnersNumRounds - 1);
  const losersMatches: BracketMatch[] = [];

  // Calculate bracket size
  const bracketSize = Math.pow(2, winnersNumRounds);

  // Track losers bracket structure by round
  // Odd rounds (1, 3, 5...): play among existing losers bracket players (progression)
  // Even rounds (2, 4, 6...): losers drop down from winners bracket (drop-down)
  // Exception: Round 1 is special - it takes losers from winners round 1

  let globalPosition = 0;

  for (let losersRound = 1; losersRound <= losersNumRounds; losersRound++) {
    // Calculate number of matches in this losers round
    // This follows a specific pattern based on drop-down vs progression rounds
    let numMatchesInRound: number;

    if (losersRound === 1) {
      // First losers round: half of first round losers play each other
      numMatchesInRound = bracketSize / 4;
    } else if (losersRound % 2 === 0) {
      // Drop-down round: players from previous losers round vs drop-downs from winners
      // Same number as previous round (losers from winners join)
      const prevLosersRoundMatches = losersMatches.filter(m => m.round === losersRound - 1).length;
      numMatchesInRound = prevLosersRoundMatches;
    } else {
      // Progression round: winners from previous round play each other
      const prevLosersRoundMatches = losersMatches.filter(m => m.round === losersRound - 1).length;
      numMatchesInRound = Math.max(1, Math.floor(prevLosersRoundMatches / 2));
    }

    // Ensure at least 1 match
    numMatchesInRound = Math.max(1, numMatchesInRound);

    for (let i = 0; i < numMatchesInRound; i++) {
      losersMatches.push({
        round: losersRound,
        position: globalPosition++,
        bracketSide: 'losers',
        status: 'pending',
      });
    }
  }

  // Grand finals: winners bracket champion vs losers bracket champion
  const grandFinals: BracketMatch = {
    round: 1,
    position: 0,
    bracketSide: 'grand_finals',
    status: 'pending',
  };

  // Bracket reset: if losers bracket winner wins grand finals
  // (they now each have 1 loss, so play again for true champion)
  const bracketReset: BracketMatch = {
    round: 2,
    position: 0,
    bracketSide: 'grand_finals_reset',
    status: 'pending',
  };

  return [...winnersMatches, ...losersMatches, grandFinals, bracketReset];
}

/**
 * Link double elimination bracket matches after DB insertion
 * Sets up nextMatchId (for winners) and loserNextMatchId (for losers going to losers bracket)
 */
async function linkDoubleEliminationBracket(
  _tournamentId: string,
  insertedMatches: Array<{ id: string; round: number; position: number; bracketSide: string | null }>
): Promise<void> {
  // Separate matches by bracket side
  const winnersMatches = insertedMatches.filter(m => m.bracketSide === 'winners');
  const losersMatches = insertedMatches.filter(m => m.bracketSide === 'losers');
  const grandFinalsMatch = insertedMatches.find(m => m.bracketSide === 'grand_finals');
  const bracketResetMatch = insertedMatches.find(m => m.bracketSide === 'grand_finals_reset');

  if (!grandFinalsMatch || !bracketResetMatch) {
    return; // Invalid bracket structure
  }

  const winnersNumRounds = Math.max(...winnersMatches.map(m => m.round));
  const losersNumRounds = losersMatches.length > 0 ? Math.max(...losersMatches.map(m => m.round)) : 0;

  // Group matches by round for easier lookup
  const winnersByRound: Map<number, typeof winnersMatches> = new Map();
  const losersByRound: Map<number, typeof losersMatches> = new Map();

  winnersMatches.forEach(m => {
    if (!winnersByRound.has(m.round)) winnersByRound.set(m.round, []);
    winnersByRound.get(m.round)!.push(m);
  });

  losersMatches.forEach(m => {
    if (!losersByRound.has(m.round)) losersByRound.set(m.round, []);
    losersByRound.get(m.round)!.push(m);
  });

  // Sort matches within each round by position
  winnersByRound.forEach(matches => matches.sort((a, b) => a.position - b.position));
  losersByRound.forEach(matches => matches.sort((a, b) => a.position - b.position));

  const updates: Array<{ id: string; nextMatchId?: string; loserNextMatchId?: string }> = [];

  // Link winners bracket matches
  for (let wr = 1; wr <= winnersNumRounds; wr++) {
    const currentRoundMatches = winnersByRound.get(wr) || [];
    const nextRoundMatches = winnersByRound.get(wr + 1) || [];

    currentRoundMatches.forEach((match, idx) => {
      let nextMatchId: string | undefined;
      let loserNextMatchId: string | undefined;

      // Winners advance to next winners round (or grand finals if finals)
      if (wr === winnersNumRounds) {
        // Winners finals -> grand finals
        nextMatchId = grandFinalsMatch.id;
      } else {
        const nextMatchIdx = Math.floor(idx / 2);
        nextMatchId = nextRoundMatches[nextMatchIdx]?.id;
      }

      // Losers drop to losers bracket
      // WR1 losers go to LR1
      // WR2 losers go to LR2 (drop-down round)
      // WR3 losers go to LR4 (drop-down round)
      // WRn losers go to LR(2*(n-1)) for n > 1, or LR1 for n = 1
      if (losersNumRounds > 0) {
        let loserLosersRound: number;
        if (wr === 1) {
          loserLosersRound = 1;
        } else {
          loserLosersRound = 2 * (wr - 1);
        }

        const losersRoundMatches = losersByRound.get(loserLosersRound) || [];

        // Calculate which losers match this loser goes to
        if (wr === 1) {
          // WR1 losers: pair up (loser of match 0 vs loser of match 1, etc)
          const loserMatchIdx = Math.floor(idx / 2);
          loserNextMatchId = losersRoundMatches[loserMatchIdx]?.id;
        } else {
          // WRn (n > 1) losers drop into existing losers bracket matches
          // They fill the "open slot" in drop-down rounds
          loserNextMatchId = losersRoundMatches[idx % losersRoundMatches.length]?.id;
        }
      }

      updates.push({
        id: match.id,
        nextMatchId,
        loserNextMatchId,
      });
    });
  }

  // Link losers bracket matches
  for (let lr = 1; lr <= losersNumRounds; lr++) {
    const currentRoundMatches = losersByRound.get(lr) || [];
    const nextRoundMatches = losersByRound.get(lr + 1) || [];

    currentRoundMatches.forEach((match, idx) => {
      let nextMatchId: string | undefined;

      if (lr === losersNumRounds) {
        // Losers finals -> grand finals
        nextMatchId = grandFinalsMatch.id;
      } else if ((lr + 1) % 2 === 0 || lr === 1) {
        // Next round is a drop-down round - same number of matches
        // Winners stay in same position (drop-down opponent fills other slot)
        nextMatchId = nextRoundMatches[idx]?.id;
      } else {
        // Next round is a progression round - half the matches
        const nextMatchIdx = Math.floor(idx / 2);
        nextMatchId = nextRoundMatches[nextMatchIdx]?.id;
      }

      if (nextMatchId) {
        updates.push({ id: match.id, nextMatchId });
      }
    });
  }

  // Link grand finals to bracket reset
  updates.push({
    id: grandFinalsMatch.id,
    nextMatchId: bracketResetMatch.id,
  });

  // Apply all updates
  for (const update of updates) {
    if (update.nextMatchId || update.loserNextMatchId) {
      await db
        .update(tournamentBracketMatches)
        .set({
          nextMatchId: update.nextMatchId || null,
          loserNextMatchId: update.loserNextMatchId || null,
        })
        .where(eq(tournamentBracketMatches.id, update.id));
    }
  }
}

/**
 * Generate Swiss format rounds (initial round 1)
 */
function generateSwissRounds(participantIds: string[], _numRounds: number = 5): BracketMatch[] {
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

/**
 * Calculate Swiss standings from completed matches
 *
 * @param tournamentId - Tournament ID
 * @param rules - Swiss rules configuration
 * @returns Array of standings sorted by rank
 */
async function calculateSwissStandings(
  tournamentId: string,
  rules: SwissRules = {}
): Promise<SwissStanding[]> {
  const {
    pointsForWin = 1,
    pointsForDraw = 0.5,
    pointsForLoss = 0,
    pointsForBye = 1,
  } = rules;

  // Get all matches for this tournament
  const matches = await db
    .select()
    .from(tournamentBracketMatches)
    .where(eq(tournamentBracketMatches.tournamentId, tournamentId));

  // Get all registered participants
  const registrations = await db
    .select({ userId: tournamentRegistrations.userId })
    .from(tournamentRegistrations)
    .where(eq(tournamentRegistrations.tournamentId, tournamentId));

  // Initialize standings for all participants
  const standingsMap = new Map<string, SwissStanding>();
  for (const reg of registrations) {
    standingsMap.set(reg.userId, {
      participantId: reg.userId,
      points: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      matchesPlayed: 0,
      buchholz: 0,
      sonnebornBerger: 0,
      opponentIds: [],
    });
  }

  // Process completed matches
  for (const match of matches) {
    if (match.status === 'completed' && match.winnerId) {
      const p1 = match.participant1Id;
      const p2 = match.participant2Id;

      if (p1 && p2) {
        const standing1 = standingsMap.get(p1);
        const standing2 = standingsMap.get(p2);

        if (standing1 && standing2) {
          // Track opponents
          standing1.opponentIds.push(p2);
          standing2.opponentIds.push(p1);

          standing1.matchesPlayed++;
          standing2.matchesPlayed++;

          if (match.winnerId === p1) {
            // p1 wins
            standing1.wins++;
            standing1.points += pointsForWin;
            standing2.losses++;
            standing2.points += pointsForLoss;
          } else if (match.winnerId === p2) {
            // p2 wins
            standing2.wins++;
            standing2.points += pointsForWin;
            standing1.losses++;
            standing1.points += pointsForLoss;
          }
        }
      }
    } else if (match.status === 'completed' && !match.winnerId && match.participant1Id && match.participant2Id) {
      // Draw (no winner set but match completed with both participants)
      const p1 = match.participant1Id;
      const p2 = match.participant2Id;
      const standing1 = standingsMap.get(p1);
      const standing2 = standingsMap.get(p2);

      if (standing1 && standing2) {
        standing1.opponentIds.push(p2);
        standing2.opponentIds.push(p1);

        standing1.matchesPlayed++;
        standing2.matchesPlayed++;

        standing1.draws++;
        standing2.draws++;
        standing1.points += pointsForDraw;
        standing2.points += pointsForDraw;
      }
    } else if (match.status === 'bye' && match.participant1Id) {
      // Bye - participant gets points without playing
      const standing = standingsMap.get(match.participant1Id);
      if (standing) {
        standing.points += pointsForBye;
        standing.matchesPlayed++;
        standing.wins++; // Count bye as a win for record purposes
      }
    }
  }

  // Calculate tie-breakers
  const standings = Array.from(standingsMap.values());

  // Buchholz: sum of all opponents' points
  for (const standing of standings) {
    standing.buchholz = standing.opponentIds.reduce((sum, oppId) => {
      const oppStanding = standingsMap.get(oppId);
      return sum + (oppStanding?.points || 0);
    }, 0);
  }

  // Sonneborn-Berger: sum of points of beaten opponents + half points of drawn opponents
  for (const match of matches) {
    if (match.status === 'completed' && match.participant1Id && match.participant2Id) {
      const p1 = match.participant1Id;
      const p2 = match.participant2Id;
      const standing1 = standingsMap.get(p1);
      const standing2 = standingsMap.get(p2);

      if (standing1 && standing2) {
        if (match.winnerId === p1) {
          // p1 beat p2 - add p2's full points to p1's SB
          standing1.sonnebornBerger += standing2.points;
        } else if (match.winnerId === p2) {
          // p2 beat p1 - add p1's full points to p2's SB
          standing2.sonnebornBerger += standing1.points;
        } else if (!match.winnerId) {
          // Draw - add half of opponent's points to each
          standing1.sonnebornBerger += standing2.points * 0.5;
          standing2.sonnebornBerger += standing1.points * 0.5;
        }
      }
    }
  }

  // Sort standings: points (desc), buchholz (desc), sonnebornBerger (desc)
  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    return b.sonnebornBerger - a.sonnebornBerger;
  });

  return standings;
}

/**
 * Generate Swiss pairings for the next round
 *
 * Uses the Monrad system: pair players with similar scores, avoiding repeat pairings
 *
 * @param standings - Current standings sorted by rank
 * @param roundNumber - The round number to generate
 * @returns Array of matches for the next round
 */
function generateSwissPairings(standings: SwissStanding[], roundNumber: number): BracketMatch[] {
  const matches: BracketMatch[] = [];
  const paired = new Set<string>();

  // Group players by points
  const pointGroups = new Map<number, SwissStanding[]>();
  for (const standing of standings) {
    const points = standing.points;
    if (!pointGroups.has(points)) {
      pointGroups.set(points, []);
    }
    pointGroups.get(points)!.push(standing);
  }

  // Sort point groups by points (descending)
  const sortedPoints = Array.from(pointGroups.keys()).sort((a, b) => b - a);

  // Create a flat list of unpaired players for fallback
  const unpaired: SwissStanding[] = [...standings];

  let matchPosition = 0;

  // Try to pair within point groups first
  for (const points of sortedPoints) {
    const group = pointGroups.get(points)!;

    for (let i = 0; i < group.length; i++) {
      const player1 = group[i];
      if (paired.has(player1.participantId)) continue;

      // Find best opponent (hasn't played player1 yet)
      let bestOpponent: SwissStanding | null = null;

      // First, try within the same point group
      for (let j = i + 1; j < group.length; j++) {
        const candidate = group[j];
        if (paired.has(candidate.participantId)) continue;
        if (player1.opponentIds.includes(candidate.participantId)) continue; // Already played
        bestOpponent = candidate;
        break;
      }

      // If no valid opponent in same group, look in lower groups
      if (!bestOpponent) {
        const currentPointIndex = sortedPoints.indexOf(points);
        for (let k = currentPointIndex + 1; k < sortedPoints.length && !bestOpponent; k++) {
          const lowerGroup = pointGroups.get(sortedPoints[k])!;
          for (const candidate of lowerGroup) {
            if (paired.has(candidate.participantId)) continue;
            if (player1.opponentIds.includes(candidate.participantId)) continue;
            bestOpponent = candidate;
            break;
          }
        }
      }

      // If still no opponent found, try anyone unpaired (even repeat pairing as last resort)
      if (!bestOpponent) {
        for (const candidate of unpaired) {
          if (candidate.participantId === player1.participantId) continue;
          if (paired.has(candidate.participantId)) continue;
          // Allow repeat pairing as last resort
          bestOpponent = candidate;
          break;
        }
      }

      if (bestOpponent) {
        matches.push({
          round: roundNumber,
          position: matchPosition++,
          participant1Id: player1.participantId,
          participant2Id: bestOpponent.participantId,
          status: 'pending',
        });

        paired.add(player1.participantId);
        paired.add(bestOpponent.participantId);
      }
    }
  }

  // Handle odd player - gets a bye
  // Find player who hasn't had a bye yet if possible
  const unpairedPlayers = standings.filter(s => !paired.has(s.participantId));
  if (unpairedPlayers.length === 1) {
    const byePlayer = unpairedPlayers[0];
    matches.push({
      round: roundNumber,
      position: matchPosition++,
      participant1Id: byePlayer.participantId,
      status: 'bye',
    });
  } else if (unpairedPlayers.length > 1) {
    // Shouldn't happen, but pair remaining players even if they've played before
    for (let i = 0; i < unpairedPlayers.length; i += 2) {
      if (i + 1 < unpairedPlayers.length) {
        matches.push({
          round: roundNumber,
          position: matchPosition++,
          participant1Id: unpairedPlayers[i].participantId,
          participant2Id: unpairedPlayers[i + 1].participantId,
          status: 'pending',
        });
      } else {
        // Last odd player gets bye
        matches.push({
          round: roundNumber,
          position: matchPosition++,
          participant1Id: unpairedPlayers[i].participantId,
          status: 'bye',
        });
      }
    }
  }

  return matches;
}

/**
 * Check if a Swiss round is complete
 */
async function isSwissRoundComplete(tournamentId: string, round: number): Promise<boolean> {
  const matches = await db
    .select()
    .from(tournamentBracketMatches)
    .where(
      and(
        eq(tournamentBracketMatches.tournamentId, tournamentId),
        eq(tournamentBracketMatches.round, round)
      )
    );

  if (matches.length === 0) return false;

  return matches.every(m => m.status === 'completed' || m.status === 'bye');
}

/**
 * Get the current round number for a Swiss tournament
 */
async function getCurrentSwissRound(tournamentId: string): Promise<number> {
  const [result] = await db
    .select({ maxRound: sql<number>`MAX(${tournamentBracketMatches.round})` })
    .from(tournamentBracketMatches)
    .where(eq(tournamentBracketMatches.tournamentId, tournamentId));

  return result?.maxRound || 0;
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

    // Get tournament to verify check-in is allowed
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    // Validate tournament status
    if (tournament.status !== 'registration_closed' && tournament.status !== 'registration_open') {
      throw new ConflictError('Check-in not available for this tournament status');
    }

    // Validate check-in window if configured
    const now = new Date();
    if (tournament.checkInStartAt && now < tournament.checkInStartAt) {
      throw new ConflictError(`Check-in opens at ${tournament.checkInStartAt.toISOString()}`);
    }
    if (tournament.checkInEndAt && now > tournament.checkInEndAt) {
      throw new ConflictError('Check-in period has ended');
    }

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

    // Update registration with check-in time
    const checkedInAt = new Date();
    await db
      .update(tournamentRegistrations)
      .set({ isCheckedIn: true, checkedInAt })
      .where(eq(tournamentRegistrations.id, registration.id));

    return {
      message: 'Successfully checked in',
      tournamentId,
      checkedInAt: checkedInAt.toISOString(),
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
        checkInStartAt: data.checkInStartAt ? new Date(data.checkInStartAt) : null,
        checkInEndAt: data.checkInEndAt ? new Date(data.checkInEndAt) : null,
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
    if (data.checkInStartAt) updateData.checkInStartAt = new Date(data.checkInStartAt);
    if (data.checkInEndAt) updateData.checkInEndAt = new Date(data.checkInEndAt);
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

    // Get all registrations
    const allRegistrations = await db
      .select()
      .from(tournamentRegistrations)
      .where(eq(tournamentRegistrations.tournamentId, tournamentId))
      .orderBy(tournamentRegistrations.seed, tournamentRegistrations.registeredAt);

    // Determine if check-in is required (if check-in window was configured)
    const checkInRequired = tournament.checkInStartAt !== null || tournament.checkInEndAt !== null;

    // Filter to only checked-in participants if check-in was required
    let eligibleRegistrations = allRegistrations;
    let noShowRegistrations: typeof allRegistrations = [];

    if (checkInRequired) {
      eligibleRegistrations = allRegistrations.filter(r => r.isCheckedIn);
      noShowRegistrations = allRegistrations.filter(r => !r.isCheckedIn);

      // Handle no-shows: forfeit their entry fee
      if (tournament.entryFeeCredits > 0 && noShowRegistrations.length > 0) {
        for (const noShow of noShowRegistrations) {
          try {
            // Release their hold but mark as forfeited (don't return to user)
            await releaseStakeHold(noShow.userId, tournamentId, 'forfeited');
          } catch (error) {
            // Log but continue - stake may already be released
            console.warn(`Failed to forfeit stake for user ${noShow.userId}:`, error);
          }
        }
      }

      // Mark no-show registrations as eliminated
      if (noShowRegistrations.length > 0) {
        await db
          .update(tournamentRegistrations)
          .set({ eliminatedAt: new Date() })
          .where(
            and(
              eq(tournamentRegistrations.tournamentId, tournamentId),
              eq(tournamentRegistrations.isCheckedIn, false)
            )
          );
      }
    }

    const participantIds = eligibleRegistrations.map(r => r.userId);

    if (participantIds.length < tournament.minParticipants) {
      throw new ValidationError('Not enough checked-in participants', {
        required: tournament.minParticipants,
        checkedIn: participantIds.length,
        noShows: noShowRegistrations.length,
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

    // Link matches for double elimination bracket (set up nextMatchId and loserNextMatchId)
    if (tournament.format === 'double_elimination') {
      await linkDoubleEliminationBracket(tournamentId, insertedMatches);
    }

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
      participants: participantIds.length,
      noShows: noShowRegistrations.length,
      noShowsForfeited: checkInRequired && tournament.entryFeeCredits > 0 ? noShowRegistrations.length : 0,
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

  // POST /api/admin/tournaments/:id/bracket-matches/:matchId/result - Report bracket match result
  app.post('/api/admin/tournaments/:id/bracket-matches/:matchId/result', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const paramsSchema = z.object({
      id: z.string().uuid(),
      matchId: z.string().uuid(),
    });

    const bodySchema = z.object({
      winnerId: z.string().uuid(),
      score1: z.number().int().min(0).optional(),
      score2: z.number().int().min(0).optional(),
    });

    const paramResult = paramsSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid parameters', { issues: paramResult.error.issues });
    }

    const bodyResult = bodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', { issues: bodyResult.error.issues });
    }

    const { id: tournamentId, matchId } = paramResult.data;
    const { winnerId, score1, score2 } = bodyResult.data;

    // Get tournament
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    if (tournament.status !== 'in_progress') {
      throw new ConflictError('Tournament is not in progress');
    }

    // Get the bracket match
    const [bracketMatch] = await db
      .select()
      .from(tournamentBracketMatches)
      .where(
        and(
          eq(tournamentBracketMatches.id, matchId),
          eq(tournamentBracketMatches.tournamentId, tournamentId)
        )
      );

    if (!bracketMatch) {
      throw new NotFoundError('Bracket match', matchId);
    }

    if (bracketMatch.status === 'completed') {
      throw new ConflictError('Match has already been completed');
    }

    if (bracketMatch.status === 'bye') {
      throw new ConflictError('Cannot report result for a bye match');
    }

    // Validate winner is one of the participants
    if (winnerId !== bracketMatch.participant1Id && winnerId !== bracketMatch.participant2Id) {
      throw new ValidationError('Winner must be one of the match participants');
    }

    const loserId = winnerId === bracketMatch.participant1Id
      ? bracketMatch.participant2Id
      : bracketMatch.participant1Id;

    // Update the bracket match with result
    await db
      .update(tournamentBracketMatches)
      .set({
        winnerId,
        loserId,
        score1,
        score2,
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(tournamentBracketMatches.id, matchId));

    // Advance winner to next match
    if (bracketMatch.nextMatchId) {
      const [nextMatch] = await db
        .select()
        .from(tournamentBracketMatches)
        .where(eq(tournamentBracketMatches.id, bracketMatch.nextMatchId));

      if (nextMatch) {
        // Determine which slot the winner fills in the next match
        const updateField = nextMatch.participant1Id === null ? 'participant1Id' : 'participant2Id';
        await db
          .update(tournamentBracketMatches)
          .set({ [updateField]: winnerId })
          .where(eq(tournamentBracketMatches.id, bracketMatch.nextMatchId));
      }
    }

    // Handle double elimination: send loser to losers bracket
    if (tournament.format === 'double_elimination' && bracketMatch.loserNextMatchId && loserId) {
      const [loserNextMatch] = await db
        .select()
        .from(tournamentBracketMatches)
        .where(eq(tournamentBracketMatches.id, bracketMatch.loserNextMatchId));

      if (loserNextMatch) {
        // Determine which slot the loser fills in the losers bracket match
        const updateField = loserNextMatch.participant1Id === null ? 'participant1Id' : 'participant2Id';
        await db
          .update(tournamentBracketMatches)
          .set({ [updateField]: loserId })
          .where(eq(tournamentBracketMatches.id, bracketMatch.loserNextMatchId));
      }
    }

    // Mark loser as eliminated (but not if they're going to losers bracket)
    if (loserId && !bracketMatch.loserNextMatchId) {
      // Check if this is grand finals - special handling
      if (bracketMatch.bracketSide === 'grand_finals') {
        // In grand finals, if the winners bracket champion loses, they get one more chance (bracket reset)
        // The loser goes to bracket reset match, not eliminated yet
        // This is already handled by nextMatchId (grand finals -> bracket reset)
      } else if (bracketMatch.bracketSide === 'grand_finals_reset') {
        // Loser of bracket reset is eliminated (2nd place)
        await db
          .update(tournamentRegistrations)
          .set({ eliminatedAt: new Date(), finalPlacement: 2 })
          .where(
            and(
              eq(tournamentRegistrations.tournamentId, tournamentId),
              eq(tournamentRegistrations.userId, loserId)
            )
          );

        // Winner is 1st place
        await db
          .update(tournamentRegistrations)
          .set({ finalPlacement: 1 })
          .where(
            and(
              eq(tournamentRegistrations.tournamentId, tournamentId),
              eq(tournamentRegistrations.userId, winnerId)
            )
          );

        // Tournament is complete
        await db
          .update(tournaments)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(tournaments.id, tournamentId));
      } else if (bracketMatch.bracketSide === 'losers') {
        // Loser in losers bracket is eliminated (they've lost twice now)
        await db
          .update(tournamentRegistrations)
          .set({ eliminatedAt: new Date() })
          .where(
            and(
              eq(tournamentRegistrations.tournamentId, tournamentId),
              eq(tournamentRegistrations.userId, loserId)
            )
          );
      }
    }

    // Check if this was grand finals and winner was from winners bracket (skip bracket reset)
    if (bracketMatch.bracketSide === 'grand_finals') {
      // Determine if winner came from winners bracket (they haven't lost yet)
      // If the winners bracket champion wins grand finals, they win the tournament (no bracket reset needed)
      // We need to check who came from which bracket - this is tracked by looking at the losers bracket final
      const [losersFinalsMatch] = await db
        .select()
        .from(tournamentBracketMatches)
        .where(
          and(
            eq(tournamentBracketMatches.tournamentId, tournamentId),
            eq(tournamentBracketMatches.bracketSide, 'losers'),
            eq(tournamentBracketMatches.status, 'completed')
          )
        )
        .orderBy(desc(tournamentBracketMatches.round))
        .limit(1);

      const losersChampion = losersFinalsMatch?.winnerId;
      const winnersChampion = losersChampion === winnerId ? loserId : winnerId;

      // If winners bracket champion won, tournament is over (no bracket reset needed)
      if (winnerId === winnersChampion) {
        // Winner is 1st place
        await db
          .update(tournamentRegistrations)
          .set({ finalPlacement: 1 })
          .where(
            and(
              eq(tournamentRegistrations.tournamentId, tournamentId),
              eq(tournamentRegistrations.userId, winnerId)
            )
          );

        // Loser is 2nd place
        await db
          .update(tournamentRegistrations)
          .set({ eliminatedAt: new Date(), finalPlacement: 2 })
          .where(
            and(
              eq(tournamentRegistrations.tournamentId, tournamentId),
              eq(tournamentRegistrations.userId, loserId!)
            )
          );

        // Mark bracket reset as not needed (skip it)
        if (bracketMatch.nextMatchId) {
          await db
            .update(tournamentBracketMatches)
            .set({ status: 'bye' }) // Using 'bye' to indicate skipped
            .where(eq(tournamentBracketMatches.id, bracketMatch.nextMatchId));
        }

        // Tournament is complete
        await db
          .update(tournaments)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(tournaments.id, tournamentId));
      } else {
        // Losers bracket champion won - need bracket reset
        // Both players now have 1 loss, advance both to bracket reset
        if (bracketMatch.nextMatchId) {
          await db
            .update(tournamentBracketMatches)
            .set({
              participant1Id: winnersChampion,
              participant2Id: losersChampion,
            })
            .where(eq(tournamentBracketMatches.id, bracketMatch.nextMatchId));
        }
      }
    }

    // For single elimination, check if tournament is complete
    if (tournament.format === 'single_elimination') {
      // Check if this was the finals match
      const winnersNumRounds = await db
        .select({ maxRound: sql<number>`MAX(${tournamentBracketMatches.round})` })
        .from(tournamentBracketMatches)
        .where(eq(tournamentBracketMatches.tournamentId, tournamentId));

      if (bracketMatch.round === winnersNumRounds[0]?.maxRound) {
        // Finals match completed - tournament is done
        await db
          .update(tournamentRegistrations)
          .set({ finalPlacement: 1 })
          .where(
            and(
              eq(tournamentRegistrations.tournamentId, tournamentId),
              eq(tournamentRegistrations.userId, winnerId)
            )
          );

        if (loserId) {
          await db
            .update(tournamentRegistrations)
            .set({ eliminatedAt: new Date(), finalPlacement: 2 })
            .where(
              and(
                eq(tournamentRegistrations.tournamentId, tournamentId),
                eq(tournamentRegistrations.userId, loserId)
              )
            );
        }

        await db
          .update(tournaments)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(tournaments.id, tournamentId));
      }
    }

    return {
      message: 'Match result recorded',
      matchId,
      winnerId,
      loserId,
      bracketSide: bracketMatch.bracketSide,
      nextMatchId: bracketMatch.nextMatchId,
      loserNextMatchId: bracketMatch.loserNextMatchId,
    };
  });

  // ============================================
  // Swiss Tournament Routes
  // ============================================

  // GET /api/tournaments/:id/swiss/standings - Get Swiss tournament standings
  app.get('/api/tournaments/:id/swiss/standings', async (request: FastifyRequest, reply: FastifyReply) => {
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

    if (tournament.format !== 'swiss') {
      throw new ValidationError('This endpoint is only for Swiss format tournaments');
    }

    // Get Swiss rules from tournament config
    const rulesJson = tournament.rulesJson as SwissRules || {};

    // Calculate standings
    const standings = await calculateSwissStandings(tournamentId, rulesJson);

    // Get current round info
    const currentRound = await getCurrentSwissRound(tournamentId);
    const roundComplete = currentRound > 0 ? await isSwissRoundComplete(tournamentId, currentRound) : true;
    const numRounds = rulesJson.numRounds || Math.ceil(Math.log2(standings.length + 1));

    // Get user info for display
    const participantIds = standings.map(s => s.participantId);
    const userInfo = participantIds.length > 0
      ? await db
          .select({
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(sql`${users.id} IN ${participantIds}`)
      : [];

    const userMap = new Map(userInfo.map(u => [u.id, u]));

    // Enrich standings with user info and rank
    const enrichedStandings = standings.map((standing, index) => ({
      rank: index + 1,
      ...standing,
      user: userMap.get(standing.participantId) || {
        id: standing.participantId,
        displayName: 'Unknown',
        avatarUrl: null,
      },
    }));

    return {
      tournamentId,
      format: 'swiss',
      status: tournament.status,
      currentRound,
      totalRounds: numRounds,
      roundComplete,
      canGenerateNextRound: roundComplete && currentRound < numRounds && tournament.status === 'in_progress',
      standings: enrichedStandings,
      rules: {
        numRounds,
        pointsForWin: rulesJson.pointsForWin ?? 1,
        pointsForDraw: rulesJson.pointsForDraw ?? 0.5,
        pointsForLoss: rulesJson.pointsForLoss ?? 0,
        pointsForBye: rulesJson.pointsForBye ?? 1,
      },
    };
  });

  // POST /api/admin/tournaments/:id/swiss/generate-round - Generate next Swiss round
  app.post('/api/admin/tournaments/:id/swiss/generate-round', async (request: FastifyRequest, reply: FastifyReply) => {
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

    // Get tournament
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    if (tournament.format !== 'swiss') {
      throw new ValidationError('This endpoint is only for Swiss format tournaments');
    }

    if (tournament.status !== 'in_progress') {
      throw new ConflictError('Tournament must be in progress to generate rounds');
    }

    // Get Swiss rules
    const rulesJson = tournament.rulesJson as SwissRules || {};

    // Check current round status
    const currentRound = await getCurrentSwissRound(tournamentId);

    // For first round, currentRound will be 0 or matches already exist
    if (currentRound > 0) {
      const roundComplete = await isSwissRoundComplete(tournamentId, currentRound);
      if (!roundComplete) {
        throw new ConflictError(`Round ${currentRound} is not yet complete. All matches must be finished before generating the next round.`);
      }
    }

    // Check if we've reached the maximum rounds
    const standings = await calculateSwissStandings(tournamentId, rulesJson);
    const numRounds = rulesJson.numRounds || Math.ceil(Math.log2(standings.length + 1));
    const nextRound = currentRound + 1;

    if (nextRound > numRounds) {
      // Tournament is complete - determine final placements
      for (let i = 0; i < standings.length; i++) {
        await db
          .update(tournamentRegistrations)
          .set({ finalPlacement: i + 1 })
          .where(
            and(
              eq(tournamentRegistrations.tournamentId, tournamentId),
              eq(tournamentRegistrations.userId, standings[i].participantId)
            )
          );
      }

      // Mark tournament as completed
      await db
        .update(tournaments)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(tournaments.id, tournamentId));

      return {
        message: 'Swiss tournament completed',
        tournamentId,
        finalStandings: standings.map((s, i) => ({
          rank: i + 1,
          participantId: s.participantId,
          points: s.points,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
        })),
        totalRounds: currentRound,
      };
    }

    // Generate pairings for next round
    const newMatches = generateSwissPairings(standings, nextRound);

    // Insert new matches
    const insertedMatches = await db
      .insert(tournamentBracketMatches)
      .values(
        newMatches.map(m => ({
          tournamentId,
          round: m.round,
          position: m.position,
          participant1Id: m.participant1Id,
          participant2Id: m.participant2Id,
          status: m.status,
        }))
      )
      .returning();

    // Update bracket JSON with round info
    const bracketJson = tournament.bracketJson as Record<string, unknown> || {};
    await db
      .update(tournaments)
      .set({
        bracketJson: {
          ...bracketJson,
          currentRound: nextRound,
          totalRounds: numRounds,
          lastRoundGeneratedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, tournamentId));

    return {
      message: `Round ${nextRound} generated successfully`,
      tournamentId,
      round: nextRound,
      totalRounds: numRounds,
      matchesCreated: insertedMatches.length,
      matches: insertedMatches.map(m => ({
        id: m.id,
        round: m.round,
        position: m.position,
        participant1Id: m.participant1Id,
        participant2Id: m.participant2Id,
        status: m.status,
      })),
    };
  });

  // POST /api/admin/tournaments/:id/swiss/complete - Complete Swiss tournament early
  app.post('/api/admin/tournaments/:id/swiss/complete', async (request: FastifyRequest, reply: FastifyReply) => {
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

    // Get tournament
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    if (tournament.format !== 'swiss') {
      throw new ValidationError('This endpoint is only for Swiss format tournaments');
    }

    if (tournament.status !== 'in_progress') {
      throw new ConflictError('Tournament must be in progress to complete');
    }

    // Check that current round is complete
    const currentRound = await getCurrentSwissRound(tournamentId);
    if (currentRound > 0) {
      const roundComplete = await isSwissRoundComplete(tournamentId, currentRound);
      if (!roundComplete) {
        throw new ConflictError('Current round must be complete before ending the tournament');
      }
    }

    // Calculate final standings
    const rulesJson = tournament.rulesJson as SwissRules || {};
    const standings = await calculateSwissStandings(tournamentId, rulesJson);

    // Set final placements
    for (let i = 0; i < standings.length; i++) {
      await db
        .update(tournamentRegistrations)
        .set({ finalPlacement: i + 1 })
        .where(
          and(
            eq(tournamentRegistrations.tournamentId, tournamentId),
            eq(tournamentRegistrations.userId, standings[i].participantId)
          )
        );
    }

    // Mark tournament as completed
    await db
      .update(tournaments)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId));

    return {
      message: 'Swiss tournament completed',
      tournamentId,
      roundsPlayed: currentRound,
      finalStandings: standings.map((s, i) => ({
        rank: i + 1,
        participantId: s.participantId,
        points: s.points,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        buchholz: s.buchholz,
        sonnebornBerger: s.sonnebornBerger,
      })),
    };
  });

  // POST /api/admin/tournaments/:id/swiss/record-draw - Record a draw for a Swiss match
  app.post('/api/admin/tournaments/:id/bracket-matches/:matchId/draw', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const paramsSchema = z.object({
      id: z.string().uuid(),
      matchId: z.string().uuid(),
    });

    const paramResult = paramsSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid parameters', { issues: paramResult.error.issues });
    }

    const { id: tournamentId, matchId } = paramResult.data;

    // Get tournament
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    if (tournament.format !== 'swiss') {
      throw new ValidationError('Draws are only supported for Swiss format tournaments');
    }

    if (tournament.status !== 'in_progress') {
      throw new ConflictError('Tournament is not in progress');
    }

    // Get the bracket match
    const [bracketMatch] = await db
      .select()
      .from(tournamentBracketMatches)
      .where(
        and(
          eq(tournamentBracketMatches.id, matchId),
          eq(tournamentBracketMatches.tournamentId, tournamentId)
        )
      );

    if (!bracketMatch) {
      throw new NotFoundError('Bracket match', matchId);
    }

    if (bracketMatch.status === 'completed') {
      throw new ConflictError('Match has already been completed');
    }

    if (bracketMatch.status === 'bye') {
      throw new ConflictError('Cannot record result for a bye match');
    }

    if (!bracketMatch.participant1Id || !bracketMatch.participant2Id) {
      throw new ValidationError('Both participants must be set to record a draw');
    }

    // Update match as a draw (completed with no winner)
    await db
      .update(tournamentBracketMatches)
      .set({
        status: 'completed',
        completedAt: new Date(),
        // winnerId remains null to indicate a draw
      })
      .where(eq(tournamentBracketMatches.id, matchId));

    return {
      message: 'Draw recorded',
      matchId,
      participant1Id: bracketMatch.participant1Id,
      participant2Id: bracketMatch.participant2Id,
    };
  });

  // ============================================
  // Prize Claim Routes
  // ============================================

  // POST /api/tournaments/:id/prize-claims - Create a prize claim (for tournament winners)
  app.post('/api/tournaments/:id/prize-claims', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const paramResult = tournamentIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid tournament ID', { issues: paramResult.error.issues });
    }

    const bodyResult = createPrizeClaimSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', { issues: bodyResult.error.issues });
    }

    const { id: tournamentId } = paramResult.data;
    const { prizeType, paymentDetails } = bodyResult.data;

    // Get tournament
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    // Tournament must be completed
    if (tournament.status !== 'completed') {
      throw new ConflictError('Prize claims can only be made for completed tournaments');
    }

    // Check user's placement in the tournament
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
      throw new ForbiddenError('You are not a participant in this tournament');
    }

    if (!registration.finalPlacement) {
      throw new ForbiddenError('Final placements have not been determined yet');
    }

    // Check prize pool for eligible placements
    const prizePool = tournament.prizePoolJson as Record<string, unknown>;
    const prizes = (prizePool.prizes || []) as Array<{ placement: number; type: string; value: string }>;

    const eligiblePrize = prizes.find(p => p.placement === registration.finalPlacement);
    if (!eligiblePrize) {
      throw new ForbiddenError(`No prize available for placement ${registration.finalPlacement}`);
    }

    // Check if already claimed
    const [existingClaim] = await db
      .select()
      .from(prizeClaims)
      .where(
        and(
          eq(prizeClaims.tournamentId, tournamentId),
          eq(prizeClaims.userId, userId)
        )
      );

    if (existingClaim) {
      throw new ConflictError('You have already submitted a prize claim for this tournament');
    }

    // Validate payment details based on prize type
    if (prizeType === 'cash' && !paymentDetails.paypalEmail) {
      throw new ValidationError('PayPal email is required for cash prizes');
    }
    if (prizeType === 'crypto' && !paymentDetails.walletAddress) {
      throw new ValidationError('Wallet address is required for crypto prizes');
    }
    if (prizeType === 'hardware' && !paymentDetails.shippingAddress) {
      throw new ValidationError('Shipping address is required for hardware prizes');
    }

    // Create prize claim
    const [claim] = await db
      .insert(prizeClaims)
      .values({
        tournamentId,
        userId,
        prizeType,
        amountOrBundleRef: eligiblePrize.value,
        placement: registration.finalPlacement,
        paymentDetailsJson: paymentDetails,
        status: 'pending',
      })
      .returning();

    return reply.status(201).send({
      id: claim.id,
      tournamentId,
      placement: registration.finalPlacement,
      prizeType,
      value: eligiblePrize.value,
      status: 'pending',
      message: 'Prize claim submitted successfully. An admin will review it shortly.',
    });
  });

  // GET /api/prize-claims/mine - Get current user's prize claims
  app.get('/api/prize-claims/mine', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const queryResult = listPrizeClaimsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', { issues: queryResult.error.issues });
    }

    const { page, limit, status, tournamentId } = queryResult.data;
    const offset = (page - 1) * limit;

    const conditions = [eq(prizeClaims.userId, userId)];
    if (status) conditions.push(eq(prizeClaims.status, status));
    if (tournamentId) conditions.push(eq(prizeClaims.tournamentId, tournamentId));

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(prizeClaims)
      .where(and(...conditions));

    const total = countResult?.total ?? 0;

    // Get claims with tournament info
    const claims = await db
      .select({
        id: prizeClaims.id,
        tournamentId: prizeClaims.tournamentId,
        prizeType: prizeClaims.prizeType,
        amountOrBundleRef: prizeClaims.amountOrBundleRef,
        placement: prizeClaims.placement,
        status: prizeClaims.status,
        denialReason: prizeClaims.denialReason,
        createdAt: prizeClaims.createdAt,
        reviewedAt: prizeClaims.reviewedAt,
        fulfilledAt: prizeClaims.fulfilledAt,
        tournament: {
          id: tournaments.id,
          name: tournaments.name,
        },
      })
      .from(prizeClaims)
      .innerJoin(tournaments, eq(prizeClaims.tournamentId, tournaments.id))
      .where(and(...conditions))
      .orderBy(desc(prizeClaims.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: claims,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  // GET /api/prize-claims/:claimId - Get a specific prize claim
  app.get('/api/prize-claims/:claimId', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);

    const paramResult = prizeClaimIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid claim ID', { issues: paramResult.error.issues });
    }

    const { claimId } = paramResult.data;

    const [claim] = await db
      .select({
        id: prizeClaims.id,
        tournamentId: prizeClaims.tournamentId,
        userId: prizeClaims.userId,
        prizeType: prizeClaims.prizeType,
        amountOrBundleRef: prizeClaims.amountOrBundleRef,
        placement: prizeClaims.placement,
        paymentDetailsJson: prizeClaims.paymentDetailsJson,
        status: prizeClaims.status,
        adminNotes: prizeClaims.adminNotes,
        denialReason: prizeClaims.denialReason,
        createdAt: prizeClaims.createdAt,
        reviewedAt: prizeClaims.reviewedAt,
        fulfilledAt: prizeClaims.fulfilledAt,
        tournament: {
          id: tournaments.id,
          name: tournaments.name,
        },
      })
      .from(prizeClaims)
      .innerJoin(tournaments, eq(prizeClaims.tournamentId, tournaments.id))
      .where(eq(prizeClaims.id, claimId));

    if (!claim) {
      throw new NotFoundError('Prize claim', claimId);
    }

    // Users can only see their own claims (admins can see all via admin endpoint)
    if (claim.userId !== userId && !isAdmin(request)) {
      throw new ForbiddenError('You can only view your own prize claims');
    }

    return claim;
  });

  // ============================================
  // Admin Prize Claim Routes
  // ============================================

  // GET /api/admin/prize-claims - List all prize claims (admin only)
  app.get('/api/admin/prize-claims', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const queryResult = listPrizeClaimsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', { issues: queryResult.error.issues });
    }

    const { page, limit, status, tournamentId } = queryResult.data;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) conditions.push(eq(prizeClaims.status, status));
    if (tournamentId) conditions.push(eq(prizeClaims.tournamentId, tournamentId));

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(prizeClaims)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult?.total ?? 0;

    // Get claims with user and tournament info
    const claims = await db
      .select({
        id: prizeClaims.id,
        tournamentId: prizeClaims.tournamentId,
        userId: prizeClaims.userId,
        prizeType: prizeClaims.prizeType,
        amountOrBundleRef: prizeClaims.amountOrBundleRef,
        placement: prizeClaims.placement,
        paymentDetailsJson: prizeClaims.paymentDetailsJson,
        status: prizeClaims.status,
        adminNotes: prizeClaims.adminNotes,
        denialReason: prizeClaims.denialReason,
        createdAt: prizeClaims.createdAt,
        reviewedAt: prizeClaims.reviewedAt,
        fulfilledAt: prizeClaims.fulfilledAt,
        user: {
          id: users.id,
          displayName: users.displayName,
          email: users.email,
        },
        tournament: {
          id: tournaments.id,
          name: tournaments.name,
        },
      })
      .from(prizeClaims)
      .innerJoin(users, eq(prizeClaims.userId, users.id))
      .innerJoin(tournaments, eq(prizeClaims.tournamentId, tournaments.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(prizeClaims.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: claims,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  // PATCH /api/admin/prize-claims/:claimId - Update prize claim status (admin only)
  app.patch('/api/admin/prize-claims/:claimId', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const adminUserId = getUserId(request);

    const paramResult = prizeClaimIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid claim ID', { issues: paramResult.error.issues });
    }

    const bodyResult = adminUpdatePrizeClaimSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new ValidationError('Invalid request body', { issues: bodyResult.error.issues });
    }

    const { claimId } = paramResult.data;
    const { status, adminNotes, denialReason } = bodyResult.data;

    // Get existing claim
    const [claim] = await db
      .select()
      .from(prizeClaims)
      .where(eq(prizeClaims.id, claimId));

    if (!claim) {
      throw new NotFoundError('Prize claim', claimId);
    }

    // Validate status transitions
    if (claim.status === 'fulfilled') {
      throw new ConflictError('Cannot update a fulfilled claim');
    }
    if (claim.status === 'denied' && status !== 'approved') {
      throw new ConflictError('Denied claims can only be changed to approved');
    }
    if (status === 'denied' && !denialReason) {
      throw new ValidationError('Denial reason is required when denying a claim');
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (adminNotes) updateData.adminNotes = adminNotes;
    if (denialReason) updateData.denialReason = denialReason;

    // Set timestamps based on new status
    if (status === 'approved' || status === 'denied') {
      updateData.reviewedBy = adminUserId;
      updateData.reviewedAt = new Date();
    }
    if (status === 'fulfilled') {
      updateData.fulfilledAt = new Date();
    }

    const [updated] = await db
      .update(prizeClaims)
      .set(updateData)
      .where(eq(prizeClaims.id, claimId))
      .returning();

    return {
      ...updated,
      message: `Prize claim ${status === 'approved' ? 'approved' : status === 'denied' ? 'denied' : 'marked as fulfilled'}`,
    };
  });

  // POST /api/admin/prize-claims/:claimId/approve - Quick approve endpoint
  app.post('/api/admin/prize-claims/:claimId/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const adminUserId = getUserId(request);

    const paramResult = prizeClaimIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid claim ID', { issues: paramResult.error.issues });
    }

    const { claimId } = paramResult.data;

    const [claim] = await db
      .select()
      .from(prizeClaims)
      .where(eq(prizeClaims.id, claimId));

    if (!claim) {
      throw new NotFoundError('Prize claim', claimId);
    }

    if (claim.status !== 'pending') {
      throw new ConflictError(`Cannot approve claim with status '${claim.status}'`);
    }

    const [updated] = await db
      .update(prizeClaims)
      .set({
        status: 'approved',
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(prizeClaims.id, claimId))
      .returning();

    return {
      ...updated,
      message: 'Prize claim approved',
    };
  });

  // POST /api/admin/prize-claims/:claimId/fulfill - Mark claim as fulfilled
  app.post('/api/admin/prize-claims/:claimId/fulfill', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(request)) {
      throw new ForbiddenError('Admin access required');
    }

    const paramResult = prizeClaimIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw new ValidationError('Invalid claim ID', { issues: paramResult.error.issues });
    }

    const { claimId } = paramResult.data;

    const [claim] = await db
      .select()
      .from(prizeClaims)
      .where(eq(prizeClaims.id, claimId));

    if (!claim) {
      throw new NotFoundError('Prize claim', claimId);
    }

    if (claim.status !== 'approved') {
      throw new ConflictError('Only approved claims can be marked as fulfilled');
    }

    const [updated] = await db
      .update(prizeClaims)
      .set({
        status: 'fulfilled',
        fulfilledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(prizeClaims.id, claimId))
      .returning();

    return {
      ...updated,
      message: 'Prize claim marked as fulfilled',
    };
  });
}
