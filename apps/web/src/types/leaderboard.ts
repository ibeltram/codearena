import { ChallengeCategory } from './challenge';
import { RankTier } from './user';

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
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
