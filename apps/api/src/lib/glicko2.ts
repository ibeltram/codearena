/**
 * Glicko-2 Rating System Implementation
 *
 * Based on Mark Glickman's Glicko-2 paper:
 * http://www.glicko.net/glicko/glicko2.pdf
 *
 * The Glicko-2 system is an improvement over Glicko/ELO that tracks:
 * - Rating (μ): Player's estimated skill level
 * - Rating Deviation (φ): Uncertainty in the rating
 * - Volatility (σ): Expected fluctuation in player's rating
 *
 * Key features:
 * - Confidence intervals: rating ± 2*deviation gives ~95% confidence
 * - Volatility tracks consistency (erratic players have higher volatility)
 * - Rating deviation increases over time with inactivity
 */

// Constants
export const GLICKO2_DEFAULTS = {
  rating: 1500,          // Default rating for new players
  deviation: 350,        // Default rating deviation (high uncertainty)
  volatility: 0.06,      // Default volatility
  tau: 0.5,              // System constant (constrains volatility change)
  convergenceEpsilon: 0.000001, // Convergence threshold for iterative algorithms
  scalingFactor: 173.7178,  // Converts between Glicko and Glicko-2 scale
} as const;

// Minimum/maximum bounds
export const GLICKO2_BOUNDS = {
  minDeviation: 30,      // Minimum RD (prevents overconfidence)
  maxDeviation: 350,     // Maximum RD (new/inactive players)
  minVolatility: 0.03,   // Minimum volatility
  maxVolatility: 0.15,   // Maximum volatility
} as const;

// Time-based RD increase (per rating period of inactivity)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _RD_INCREASE_PER_PERIOD = 25;

/**
 * Player rating data
 */
export interface Glicko2Rating {
  rating: number;
  deviation: number;
  volatility: number;
}

/**
 * Match result for rating calculation
 */
export interface MatchResult {
  opponentRating: number;
  opponentDeviation: number;
  score: number; // 1 = win, 0.5 = draw, 0 = loss
}

/**
 * Convert from Glicko scale to Glicko-2 internal scale
 */
function toGlicko2Scale(rating: number, deviation: number): { mu: number; phi: number } {
  const mu = (rating - GLICKO2_DEFAULTS.rating) / GLICKO2_DEFAULTS.scalingFactor;
  const phi = deviation / GLICKO2_DEFAULTS.scalingFactor;
  return { mu, phi };
}

/**
 * Convert from Glicko-2 internal scale to Glicko scale
 */
function fromGlicko2Scale(mu: number, phi: number): { rating: number; deviation: number } {
  const rating = mu * GLICKO2_DEFAULTS.scalingFactor + GLICKO2_DEFAULTS.rating;
  const deviation = phi * GLICKO2_DEFAULTS.scalingFactor;
  return { rating, deviation };
}

/**
 * Calculate g(φ) - reduces weight for uncertain opponents
 */
function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/**
 * Calculate E(μ, μj, φj) - expected score against opponent
 */
function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Calculate variance (v) - estimated variance of player's rating
 */
function calculateVariance(mu: number, matches: Array<{ muJ: number; phiJ: number }>): number {
  let sum = 0;

  for (const match of matches) {
    const gPhiJ = g(match.phiJ);
    const expected = E(mu, match.muJ, match.phiJ);
    sum += gPhiJ * gPhiJ * expected * (1 - expected);
  }

  return sum > 0 ? 1 / sum : GLICKO2_BOUNDS.maxDeviation;
}

/**
 * Calculate delta (Δ) - estimated improvement in rating
 */
function calculateDelta(
  mu: number,
  matches: Array<{ muJ: number; phiJ: number; score: number }>,
  v: number
): number {
  let sum = 0;

  for (const match of matches) {
    const gPhiJ = g(match.phiJ);
    const expected = E(mu, match.muJ, match.phiJ);
    sum += gPhiJ * (match.score - expected);
  }

  return v * sum;
}

/**
 * Calculate new volatility using iterative algorithm
 * (Illinois algorithm for finding root of f(x))
 */
function calculateNewVolatility(
  sigma: number,
  phi: number,
  v: number,
  delta: number,
  tau: number = GLICKO2_DEFAULTS.tau
): number {
  const a = Math.log(sigma * sigma);
  const phiSquared = phi * phi;
  const deltaSquared = delta * delta;

  // Function f(x) as defined in Glicko-2 paper
  const f = (x: number): number => {
    const eX = Math.exp(x);
    const tmp = phiSquared + v + eX;
    const left = (eX * (deltaSquared - phiSquared - v - eX)) / (2 * tmp * tmp);
    const right = (x - a) / (tau * tau);
    return left - right;
  };

  // Iterative algorithm to find x where f(x) = 0
  let A = a;
  let B: number;

  if (deltaSquared > phiSquared + v) {
    B = Math.log(deltaSquared - phiSquared - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) {
      k++;
    }
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);

  // Illinois algorithm
  while (Math.abs(B - A) > GLICKO2_DEFAULTS.convergenceEpsilon) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);

    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }

    B = C;
    fB = fC;
  }

  const newSigma = Math.exp(A / 2);

  // Clamp to bounds
  return Math.max(
    GLICKO2_BOUNDS.minVolatility,
    Math.min(GLICKO2_BOUNDS.maxVolatility, newSigma)
  );
}

/**
 * Calculate new rating and deviation after a rating period
 */
export function updateRating(
  player: Glicko2Rating,
  matchResults: MatchResult[]
): Glicko2Rating {
  // If no matches played, only update deviation for inactivity
  if (matchResults.length === 0) {
    return updateForInactivity(player, 1);
  }

  // Convert to Glicko-2 scale
  const { mu, phi } = toGlicko2Scale(player.rating, player.deviation);

  // Convert opponent data to Glicko-2 scale
  const matches = matchResults.map((m) => {
    const { mu: muJ, phi: phiJ } = toGlicko2Scale(m.opponentRating, m.opponentDeviation);
    return { muJ, phiJ, score: m.score };
  });

  // Step 3: Calculate variance (v)
  const v = calculateVariance(
    mu,
    matches.map((m) => ({ muJ: m.muJ, phiJ: m.phiJ }))
  );

  // Step 4: Calculate delta (Δ)
  const delta = calculateDelta(mu, matches, v);

  // Step 5: Calculate new volatility (σ')
  const newSigma = calculateNewVolatility(player.volatility, phi, v, delta);

  // Step 6: Calculate pre-rating period deviation (φ*)
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);

  // Step 7: Calculate new deviation (φ')
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);

  // Step 8: Calculate new rating (μ')
  let newMu = mu;
  for (const match of matches) {
    const gPhiJ = g(match.phiJ);
    const expected = E(mu, match.muJ, match.phiJ);
    newMu += newPhi * newPhi * gPhiJ * (match.score - expected);
  }

  // Convert back to Glicko scale
  const { rating: newRating, deviation: newDeviation } = fromGlicko2Scale(newMu, newPhi);

  // Clamp deviation to bounds
  const clampedDeviation = Math.max(
    GLICKO2_BOUNDS.minDeviation,
    Math.min(GLICKO2_BOUNDS.maxDeviation, newDeviation)
  );

  return {
    rating: Math.round(newRating),
    deviation: Math.round(clampedDeviation * 10) / 10,
    volatility: Math.round(newSigma * 10000) / 10000,
  };
}

/**
 * Update rating for inactivity (increases deviation over time)
 */
export function updateForInactivity(
  player: Glicko2Rating,
  periodsInactive: number
): Glicko2Rating {
  // Increase deviation based on inactivity (RD grows with time)
  const { mu, phi } = toGlicko2Scale(player.rating, player.deviation);

  // Calculate new deviation due to inactivity
  let newPhi = phi;
  for (let i = 0; i < periodsInactive; i++) {
    newPhi = Math.sqrt(newPhi * newPhi + player.volatility * player.volatility);
  }

  // Alternative: simpler increase based on periods
  // const newDeviation = Math.min(
  //   GLICKO2_BOUNDS.maxDeviation,
  //   player.deviation + RD_INCREASE_PER_PERIOD * periodsInactive
  // );

  const { deviation: newDeviation } = fromGlicko2Scale(mu, newPhi);

  const clampedDeviation = Math.min(GLICKO2_BOUNDS.maxDeviation, newDeviation);

  return {
    rating: player.rating,
    deviation: Math.round(clampedDeviation * 10) / 10,
    volatility: player.volatility,
  };
}

/**
 * Calculate expected score between two players
 */
export function expectedScore(
  player: Glicko2Rating,
  opponent: Glicko2Rating
): number {
  const { mu } = toGlicko2Scale(player.rating, player.deviation);
  const { mu: muJ, phi: phiJ } = toGlicko2Scale(opponent.rating, opponent.deviation);

  return E(mu, muJ, phiJ);
}

/**
 * Get confidence interval for a rating
 * Returns [lower, upper] bounds for approximately 95% confidence
 */
export function getConfidenceInterval(
  player: Glicko2Rating,
  confidence: number = 0.95
): [number, number] {
  // For 95% confidence, use ~2 standard deviations
  const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 1.645;
  const lower = Math.round(player.rating - z * player.deviation);
  const upper = Math.round(player.rating + z * player.deviation);
  return [lower, upper];
}

/**
 * Get rating tier/rank based on rating
 */
export type RatingTier =
  | 'Unranked'
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Master'
  | 'Grandmaster';

export function getRatingTier(rating: number, gamesPlayed: number): RatingTier {
  // Need minimum games to be ranked
  if (gamesPlayed < 5) {
    return 'Unranked';
  }

  if (rating < 1200) return 'Bronze';
  if (rating < 1400) return 'Silver';
  if (rating < 1600) return 'Gold';
  if (rating < 1800) return 'Platinum';
  if (rating < 2000) return 'Diamond';
  if (rating < 2200) return 'Master';
  return 'Grandmaster';
}

/**
 * Calculate stake cap based on rating
 * Lower-rated players have lower stake caps to protect them
 */
export function calculateStakeCap(rating: number, deviation: number): number {
  // Base cap depends on rating tier
  let baseCap: number;
  const tier = getRatingTier(rating, 10); // Assume ranked for cap calculation

  switch (tier) {
    case 'Unranked':
    case 'Bronze':
      baseCap = 100;
      break;
    case 'Silver':
      baseCap = 250;
      break;
    case 'Gold':
      baseCap = 500;
      break;
    case 'Platinum':
      baseCap = 1000;
      break;
    case 'Diamond':
      baseCap = 2500;
      break;
    case 'Master':
      baseCap = 5000;
      break;
    case 'Grandmaster':
      baseCap = 10000;
      break;
    default:
      baseCap = 100;
  }

  // Reduce cap if deviation is high (uncertain rating)
  if (deviation > 200) {
    baseCap = Math.floor(baseCap * 0.5);
  } else if (deviation > 100) {
    baseCap = Math.floor(baseCap * 0.75);
  }

  return baseCap;
}

/**
 * Determine if two players can be matched based on rating
 */
export function canMatch(
  player1: Glicko2Rating,
  player2: Glicko2Rating,
  maxRatingDiff: number = 400
): boolean {
  // Allow wider range if players have high deviation (uncertain ratings)
  const adjustedMaxDiff =
    maxRatingDiff +
    Math.max(player1.deviation, player2.deviation) * 0.5;

  return Math.abs(player1.rating - player2.rating) <= adjustedMaxDiff;
}

/**
 * Calculate rating change preview (what would happen if player won/lost/drew)
 */
export function previewRatingChange(
  player: Glicko2Rating,
  opponent: Glicko2Rating
): { win: number; loss: number; draw: number } {
  const winResult = updateRating(player, [
    { opponentRating: opponent.rating, opponentDeviation: opponent.deviation, score: 1 },
  ]);

  const lossResult = updateRating(player, [
    { opponentRating: opponent.rating, opponentDeviation: opponent.deviation, score: 0 },
  ]);

  const drawResult = updateRating(player, [
    { opponentRating: opponent.rating, opponentDeviation: opponent.deviation, score: 0.5 },
  ]);

  return {
    win: winResult.rating - player.rating,
    loss: lossResult.rating - player.rating,
    draw: drawResult.rating - player.rating,
  };
}

/**
 * Create a new player rating
 */
export function createNewRating(): Glicko2Rating {
  return {
    rating: GLICKO2_DEFAULTS.rating,
    deviation: GLICKO2_DEFAULTS.deviation,
    volatility: GLICKO2_DEFAULTS.volatility,
  };
}
