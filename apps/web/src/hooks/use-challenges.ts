'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ChallengesResponse, ChallengeFilters, ChallengeDetail } from '@/types/challenge';

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

// Fetch a single challenge by slug
export function useChallenge(slug: string) {
  return useQuery({
    queryKey: ['challenge', slug],
    queryFn: () => api.get<ChallengeDetail>(`/api/challenges/slug/${slug}`),
    staleTime: 60 * 1000, // 1 minute
    enabled: !!slug,
  });
}

// Join queue mutation types
interface JoinQueueRequest {
  challengeVersionId?: string;
  category?: string;
  difficulty?: string;
  stakeAmount?: number;
}

interface JoinQueueResponse {
  matched: boolean;
  matchId: string;
  seat: 'A' | 'B';
  message: string;
  stakeHold?: {
    id: string;
    amount: number;
  } | null;
}

// Join matchmaking queue
export function useJoinQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: JoinQueueRequest) =>
      api.post<JoinQueueResponse>('/api/matches/queue', data),
    onSuccess: () => {
      // Invalidate matches queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

// Create invite match types
interface CreateMatchRequest {
  challengeVersionId: string;
  mode?: 'invite' | 'ranked';
  stakeAmount?: number;
  durationMinutes?: number;
}

interface CreateMatchResponse {
  id: string;
  inviteCode: string;
  inviteLink: string;
  status: string;
  mode: string;
  stakeAmount: number;
  durationMinutes: number;
  participant: {
    id: string;
    seat: string;
  };
  stakeHold?: {
    id: string;
    amount: number;
  } | null;
}

// Create an invite match
export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMatchRequest) =>
      api.post<CreateMatchResponse>('/api/matches', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}
