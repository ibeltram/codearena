import { ChallengeCategory } from './challenge';
import { RankTier } from './user';

export type SeasonStatus = 'upcoming' | 'active' | 'ended' | 'archived';

export interface SeasonRewardTier {
  rankMin: number;
  rankMax: number;
  credits: number;
  badge?: string;
  title?: string;
}

export interface SeasonRules {
  minGamesForRanking: number;
  inactivityPenaltyDays: number;
  placementGames: number;
  ratingDecayFactor?: number;
}

export interface SeasonRewardsConfig {
  tiers: SeasonRewardTier[];
  totalPrizePool?: number;
  distributedAt?: string;
}

export interface Season {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string | null;
  status?: SeasonStatus;
  isCurrent: boolean;
  rules?: SeasonRules;
  rewards?: SeasonRewardsConfig;
  createdAt?: string;
  updatedAt?: string;
}

export interface SeasonStanding {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  deviation: number;
}

export interface SeasonStandingsResponse {
  season: {
    id: string;
    name: string;
    status: SeasonStatus;
    startDate: string;
    endDate: string;
    rewardsDistributed: boolean;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  data: SeasonStanding[];
}

export interface SeasonRewardPayout {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rank: number;
  rating: number;
  credits: number;
  badge?: string;
  title?: string;
  claimed: boolean;
  claimedAt?: string;
  createdAt?: string;
}

export interface SeasonRewardsResponse {
  season: {
    id: string;
    name: string;
    status: SeasonStatus;
  };
  config: SeasonRewardsConfig;
  payouts: SeasonRewardPayout[];
}

export interface MySeasonReward {
  id: string;
  seasonId: string;
  seasonName: string;
  rank: number;
  rating: number;
  credits: number;
  badge?: string;
  title?: string;
  createdAt?: string;
}

export interface MySeasonRewardsResponse {
  data: MySeasonReward[];
}

export interface LeaderboardEntry {
  rank: number;
  previousRank: number | null;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  ratingChange: number;
  tier: RankTier;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  data: LeaderboardEntry[];
  season: Season;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SeasonsResponse {
  data: Season[];
}

export interface LeaderboardFilters {
  page?: number;
  limit?: number;
  seasonId?: string;
  category?: ChallengeCategory | 'all';
  search?: string;
}

// Helper to get rank change indicator
export function getRankChange(current: number, previous: number | null): 'up' | 'down' | 'same' | 'new' {
  if (previous === null) return 'new';
  if (current < previous) return 'up';
  if (current > previous) return 'down';
  return 'same';
}

// Helper to format rating with sign
export function formatRatingChange(change: number): string {
  if (change > 0) return `+${change}`;
  if (change < 0) return `${change}`;
  return '0';
}
