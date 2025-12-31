'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Tournament,
  TournamentsResponse,
  TournamentFilters,
  TournamentParticipantsResponse,
  TournamentBracketResponse,
  TournamentRegistrationResponse,
} from '@/types/tournament';

export const tournamentKeys = {
  all: ['tournaments'] as const,
  lists: () => [...tournamentKeys.all, 'list'] as const,
  list: (filters: TournamentFilters) => [...tournamentKeys.lists(), filters] as const,
  details: () => [...tournamentKeys.all, 'detail'] as const,
  detail: (id: string) => [...tournamentKeys.details(), id] as const,
  participants: (id: string) => [...tournamentKeys.all, 'participants', id] as const,
  bracket: (id: string) => [...tournamentKeys.all, 'bracket', id] as const,
  myRegistrations: () => [...tournamentKeys.all, 'my-registrations'] as const,
};

// Fetch tournaments list with filters
export function useTournaments(filters: TournamentFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.format) queryParams.set('format', filters.format);
  if (filters.upcoming !== undefined) queryParams.set('upcoming', String(filters.upcoming));

  const queryString = queryParams.toString();
  const endpoint = `/api/tournaments${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: tournamentKeys.list(filters),
    queryFn: () => api.get<TournamentsResponse>(endpoint),
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData,
  });
}

// Fetch single tournament details
export function useTournament(id: string) {
  return useQuery({
    queryKey: tournamentKeys.detail(id),
    queryFn: () => api.get<Tournament>(`/api/tournaments/${id}`),
    staleTime: 30 * 1000,
    enabled: !!id,
  });
}

// Fetch tournament participants
export function useTournamentParticipants(id: string) {
  return useQuery({
    queryKey: tournamentKeys.participants(id),
    queryFn: () => api.get<TournamentParticipantsResponse>(`/api/tournaments/${id}/participants`),
    staleTime: 30 * 1000,
    enabled: !!id,
  });
}

// Fetch tournament bracket
export function useTournamentBracket(id: string) {
  return useQuery({
    queryKey: tournamentKeys.bracket(id),
    queryFn: () => api.get<TournamentBracketResponse>(`/api/tournaments/${id}/bracket`),
    staleTime: 30 * 1000,
    enabled: !!id,
  });
}

// Register for tournament
export function useRegisterForTournament() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tournamentId: string) =>
      api.post<TournamentRegistrationResponse>(`/api/tournaments/${tournamentId}/join`),
    onSuccess: (_, tournamentId) => {
      // Invalidate tournament details and participants
      queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
      queryClient.invalidateQueries({ queryKey: tournamentKeys.participants(tournamentId) });
      queryClient.invalidateQueries({ queryKey: tournamentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tournamentKeys.myRegistrations() });
    },
  });
}

// Withdraw from tournament
export function useWithdrawFromTournament() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tournamentId: string) =>
      api.delete<{ message: string; refunded: boolean }>(`/api/tournaments/${tournamentId}/leave`),
    onSuccess: (_, tournamentId) => {
      queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
      queryClient.invalidateQueries({ queryKey: tournamentKeys.participants(tournamentId) });
      queryClient.invalidateQueries({ queryKey: tournamentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tournamentKeys.myRegistrations() });
    },
  });
}

// Check in to tournament
export function useCheckInToTournament() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tournamentId: string) =>
      api.post<{ message: string; tournamentId: string }>(`/api/tournaments/${tournamentId}/checkin`),
    onSuccess: (_, tournamentId) => {
      queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
      queryClient.invalidateQueries({ queryKey: tournamentKeys.participants(tournamentId) });
    },
  });
}
