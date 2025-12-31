import { ChallengeCategory } from './challenge';
import { MatchListItem } from './match';

export type UserRole = 'user' | 'admin' | 'moderator';

export interface UserBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
}

export interface CategoryStats {
  category: ChallengeCategory;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  averageScore: number;
}

export interface UserStats {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  averageScore: number;
  byCategory: CategoryStats[];
}

export interface UserRanking {
  id: string;
  seasonId: string;
  seasonName: string;
  rating: number;
  deviation: number;
  volatility: number;
  rank: number;
  percentile: number;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  roles: UserRole[];
  isBanned: boolean;
  isVerified: boolean;
  preferences: {
    publicArtifacts: boolean;
    emailNotifications: boolean;
  };
}

export interface UserProfile {
  user: User;
  ranking: UserRanking | null;
  stats: UserStats;
  badges: UserBadge[];
  recentMatches: MatchListItem[];
}

export interface UserProfileResponse {
  data: UserProfile;
}

// Rank tiers based on rating
export type RankTier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'
  | 'grandmaster';

export function getRankTier(rating: number): RankTier {
  if (rating < 1200) return 'bronze';
  if (rating < 1400) return 'silver';
  if (rating < 1600) return 'gold';
  if (rating < 1800) return 'platinum';
  if (rating < 2000) return 'diamond';
  if (rating < 2200) return 'master';
  return 'grandmaster';
}

export const rankTierLabels: Record<RankTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  master: 'Master',
  grandmaster: 'Grandmaster',
};

export const rankTierColors: Record<RankTier, string> = {
  bronze: 'text-amber-700 bg-amber-100',
  silver: 'text-gray-600 bg-gray-200',
  gold: 'text-yellow-600 bg-yellow-100',
  platinum: 'text-cyan-600 bg-cyan-100',
  diamond: 'text-blue-600 bg-blue-100',
  master: 'text-purple-600 bg-purple-100',
  grandmaster: 'text-red-600 bg-red-100',
};
