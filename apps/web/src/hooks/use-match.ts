'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Match, MatchesResponse, MatchFilters } from '@/types/match';

// Fetch single match by ID
export function useMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api.get<Match>(`/api/matches/${matchId}`),
    enabled: !!matchId,
    staleTime: 10 * 1000, // 10 seconds - matches update frequently
    refetchInterval: (query) => {
      // Auto-refetch every 5 seconds if match is in progress
      const match = query.state.data;
      if (match && ['matched', 'in_progress'].includes(match.status)) {
        return 5000;
      }
      return false;
    },
  });
}

// Fetch list of matches
export function useMatches(filters: MatchFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.mode) queryParams.set('mode', filters.mode);

  const queryString = queryParams.toString();
  const endpoint = `/api/matches${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: ['matches', filters],
    queryFn: () => api.get<MatchesResponse>(endpoint),
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData,
  });
}

// Fetch current user's matches
export function useMyMatches(filters: MatchFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.status) queryParams.set('status', filters.status);

  const queryString = queryParams.toString();
  const endpoint = `/api/matches/my${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: ['my-matches', filters],
    queryFn: () => api.get<MatchesResponse>(endpoint),
    staleTime: 15 * 1000, // 15 seconds
  });
}

// Create a new match
interface CreateMatchData {
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
}

export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMatchData) =>
      api.post<CreateMatchResponse>('/api/matches', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['my-matches'] });
    },
  });
}

// Join matchmaking queue
interface JoinQueueData {
  challengeVersionId?: string;
  category?: string;
  difficulty?: string;
  stakeAmount?: number;
}

interface JoinQueueResponse {
  matched: boolean;
  matchId: string;
  seat: string;
  message: string;
}

export function useJoinQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: JoinQueueData) =>
      api.post<JoinQueueResponse>('/api/matches/queue', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['my-matches'] });
    },
  });
}

// Join existing match
interface JoinMatchResponse {
  matchId: string;
  seat: string;
  status: string;
  message: string;
}

export function useJoinMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) =>
      api.post<JoinMatchResponse>(`/api/matches/${matchId}/join`),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['my-matches'] });
    },
  });
}

// Ready up for match
interface ReadyResponse {
  matchId: string;
  status: string;
  message: string;
  allReady: boolean;
  startedAt?: string;
  endsAt?: string;
}

export function useReadyUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) =>
      api.post<ReadyResponse>(`/api/matches/${matchId}/ready`),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    },
  });
}

// Forfeit match
interface ForfeitResponse {
  matchId: string;
  status: string;
  message: string;
  forfeitedAt: string;
}

export function useForfeit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) =>
      api.post<ForfeitResponse>(`/api/matches/${matchId}/forfeit`),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['my-matches'] });
    },
  });
}
