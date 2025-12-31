'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  LeaderboardResponse,
  LeaderboardFilters,
  SeasonsResponse,
} from '@/types/leaderboard';

export const leaderboardKeys = {
  all: ['leaderboard'] as const,
  list: (filters: LeaderboardFilters) => [...leaderboardKeys.all, 'list', filters] as const,
  seasons: () => [...leaderboardKeys.all, 'seasons'] as const,
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
  const endpoint = `/api/leaderboard${queryString ? `?${queryString}` : ''}`;

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
    queryFn: () => api.get<SeasonsResponse>('/api/seasons'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => data.data,
  });
}
