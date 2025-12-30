'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ChallengesResponse, ChallengeFilters } from '@/types/challenge';

export function useChallenges(filters: ChallengeFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.category) queryParams.set('category', filters.category);
  if (filters.difficulty) queryParams.set('difficulty', filters.difficulty);
  if (filters.search) queryParams.set('search', filters.search);
  if (filters.sort) queryParams.set('sort', filters.sort);

  const queryString = queryParams.toString();
  const endpoint = `/api/challenges${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: ['challenges', filters],
    queryFn: () => api.get<ChallengesResponse>(endpoint),
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  });
}
