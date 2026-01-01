'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  LeaderboardResponse,
  LeaderboardFilters,
  SeasonsResponse,
  Season,
  SeasonStandingsResponse,
  SeasonRewardsResponse,
  MySeasonRewardsResponse,
} from '@/types/leaderboard';
import { walletKeys } from './use-wallet';

export const leaderboardKeys = {
  all: ['leaderboard'] as const,
  list: (filters: LeaderboardFilters) => [...leaderboardKeys.all, 'list', filters] as const,
  seasons: () => [...leaderboardKeys.all, 'seasons'] as const,
  season: (id: string) => [...leaderboardKeys.all, 'season', id] as const,
  seasonStandings: (id: string) => [...leaderboardKeys.all, 'season', id, 'standings'] as const,
  seasonRewards: (id: string) => [...leaderboardKeys.all, 'season', id, 'rewards'] as const,
  mySeasonRewards: () => [...leaderboardKeys.all, 'my-season-rewards'] as const,
};

// Fetch leaderboard entries with filters
export function useLeaderboard(filters: LeaderboardFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.seasonId) queryParams.set('seasonId', filters.seasonId);
  if (filters.category && filters.category !== 'all') {
    queryParams.set('category', filters.category);
  }
  if (filters.search) queryParams.set('search', filters.search);

  const queryString = queryParams.toString();
  const endpoint = `/api/ratings/leaderboard${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: leaderboardKeys.list(filters),
    queryFn: () => api.get<LeaderboardResponse>(endpoint),
    staleTime: 60 * 1000, // 1 minute
    placeholderData: (previousData) => previousData,
  });
}

// Fetch available seasons
export function useSeasons() {
  return useQuery({
    queryKey: leaderboardKeys.seasons(),
    queryFn: () => api.get<SeasonsResponse>('/api/ratings/seasons'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => data.data,
  });
}

// Fetch a specific season by ID
export function useSeason(id: string) {
  return useQuery({
    queryKey: leaderboardKeys.season(id),
    queryFn: () => api.get<Season>(`/api/ratings/seasons/${id}`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// Fetch season standings
export function useSeasonStandings(id: string, options: { limit?: number; offset?: number } = {}) {
  const queryParams = new URLSearchParams();
  if (options.limit) queryParams.set('limit', String(options.limit));
  if (options.offset) queryParams.set('offset', String(options.offset));

  const queryString = queryParams.toString();
  const endpoint = `/api/ratings/seasons/${id}/standings${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: leaderboardKeys.seasonStandings(id),
    queryFn: () => api.get<SeasonStandingsResponse>(endpoint),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

// Fetch season reward payouts
export function useSeasonRewards(id: string) {
  return useQuery({
    queryKey: leaderboardKeys.seasonRewards(id),
    queryFn: () => api.get<SeasonRewardsResponse>(`/api/ratings/seasons/${id}/rewards`),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

// Fetch current user's unclaimed season rewards
export function useMySeasonRewards() {
  return useQuery({
    queryKey: leaderboardKeys.mySeasonRewards(),
    queryFn: () => api.get<MySeasonRewardsResponse>('/api/ratings/my-season-rewards'),
    staleTime: 60 * 1000,
  });
}

// Claim a season reward
export function useClaimSeasonReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payoutId: string) =>
      api.post<{ success: boolean; creditsAwarded: number; badge?: string; title?: string }>(
        `/api/ratings/seasons/rewards/${payoutId}/claim`,
        {}
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaderboardKeys.mySeasonRewards() });
      queryClient.invalidateQueries({ queryKey: walletKeys.balance() });
    },
  });
}

// Status helpers
export const seasonStatusLabels: Record<string, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  ended: 'Ended',
  archived: 'Archived',
};

export const seasonStatusColors: Record<string, string> = {
  upcoming: 'bg-blue-500',
  active: 'bg-green-500',
  ended: 'bg-gray-500',
  archived: 'bg-gray-400',
};
