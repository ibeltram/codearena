import { RankTier } from './user';

/**
 * Stake cap tier (based on rating)
 */
export type StakeCapTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

/**
 * Stake cap tier definition
 */
export interface StakeCapTierInfo {
  minRating: number;
  maxRating: number;
  cap: number;
}

/**
 * All stake cap tiers
 */
export type StakeCapTiers = Record<StakeCapTier, StakeCapTierInfo>;

/**
 * Stake cap API response
 */
export interface StakeCapResponse {
  stakeCap: number;
  stakeCapTier: StakeCapTier;
  tier: RankTier;
  rating: number;
  deviation: number;
  tiers: StakeCapTiers;
}

/**
 * Get display label for stake cap tier
 */
export const stakeCapTierLabels: Record<StakeCapTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
};

/**
 * Get color classes for stake cap tier
 */
export const stakeCapTierColors: Record<StakeCapTier, string> = {
  bronze: 'text-amber-700 bg-amber-100',
  silver: 'text-gray-600 bg-gray-200',
  gold: 'text-yellow-600 bg-yellow-100',
  platinum: 'text-cyan-600 bg-cyan-100',
  diamond: 'text-blue-600 bg-blue-100',
};

/**
 * Get icon color for stake cap tier
 */
export const stakeCapTierIconColors: Record<StakeCapTier, string> = {
  bronze: 'text-amber-600',
  silver: 'text-gray-500',
  gold: 'text-yellow-500',
  platinum: 'text-cyan-500',
  diamond: 'text-blue-500',
};
