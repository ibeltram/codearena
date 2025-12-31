'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  PrizeClaim,
  PrizeClaimsResponse,
  PrizeClaimFilters,
  CreatePrizeClaimRequest,
  CreatePrizeClaimResponse,
  AdminUpdatePrizeClaimRequest,
} from '@/types/tournament';

export const prizeClaimKeys = {
  all: ['prize-claims'] as const,
  mine: () => [...prizeClaimKeys.all, 'mine'] as const,
  mineList: (filters: PrizeClaimFilters) => [...prizeClaimKeys.mine(), filters] as const,
  details: () => [...prizeClaimKeys.all, 'detail'] as const,
  detail: (id: string) => [...prizeClaimKeys.details(), id] as const,
  admin: () => [...prizeClaimKeys.all, 'admin'] as const,
  adminList: (filters: PrizeClaimFilters) => [...prizeClaimKeys.admin(), filters] as const,
};

// Fetch current user's prize claims
export function useMyPrizeClaims(filters: PrizeClaimFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.tournamentId) queryParams.set('tournamentId', filters.tournamentId);

  const queryString = queryParams.toString();
  const endpoint = `/api/prize-claims/mine${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: prizeClaimKeys.mineList(filters),
    queryFn: () => api.get<PrizeClaimsResponse>(endpoint),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

// Fetch a specific prize claim
export function usePrizeClaim(claimId: string) {
  return useQuery({
    queryKey: prizeClaimKeys.detail(claimId),
    queryFn: () => api.get<PrizeClaim>(`/api/prize-claims/${claimId}`),
    staleTime: 30 * 1000,
    enabled: !!claimId,
  });
}

// Create a prize claim for a tournament
export function useCreatePrizeClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tournamentId,
      data,
    }: {
      tournamentId: string;
      data: CreatePrizeClaimRequest;
    }) => api.post<CreatePrizeClaimResponse>(`/api/tournaments/${tournamentId}/prize-claims`, data),
    onSuccess: (response) => {
      // Invalidate my claims list
      queryClient.invalidateQueries({ queryKey: prizeClaimKeys.mine() });
      // Invalidate the tournament details (may affect UI state)
      queryClient.invalidateQueries({ queryKey: ['tournaments', 'detail', response.tournamentId] });
    },
  });
}

// ============================================
// Admin Hooks
// ============================================

// Fetch all prize claims (admin only)
export function useAdminPrizeClaims(filters: PrizeClaimFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.tournamentId) queryParams.set('tournamentId', filters.tournamentId);

  const queryString = queryParams.toString();
  const endpoint = `/api/admin/prize-claims${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: prizeClaimKeys.adminList(filters),
    queryFn: () => api.get<PrizeClaimsResponse>(endpoint),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

// Update prize claim status (admin only)
export function useUpdatePrizeClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      claimId,
      data,
    }: {
      claimId: string;
      data: AdminUpdatePrizeClaimRequest;
    }) => api.patch<PrizeClaim & { message: string }>(`/api/admin/prize-claims/${claimId}`, data),
    onSuccess: (_, variables) => {
      // Invalidate all prize claim queries
      queryClient.invalidateQueries({ queryKey: prizeClaimKeys.all });
      queryClient.invalidateQueries({ queryKey: prizeClaimKeys.detail(variables.claimId) });
    },
  });
}

// Quick approve a prize claim (admin only)
export function useApprovePrizeClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (claimId: string) =>
      api.post<PrizeClaim & { message: string }>(`/api/admin/prize-claims/${claimId}/approve`),
    onSuccess: (_, claimId) => {
      queryClient.invalidateQueries({ queryKey: prizeClaimKeys.all });
      queryClient.invalidateQueries({ queryKey: prizeClaimKeys.detail(claimId) });
    },
  });
}

// Mark claim as fulfilled (admin only)
export function useFulfillPrizeClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (claimId: string) =>
      api.post<PrizeClaim & { message: string }>(`/api/admin/prize-claims/${claimId}/fulfill`),
    onSuccess: (_, claimId) => {
      queryClient.invalidateQueries({ queryKey: prizeClaimKeys.all });
      queryClient.invalidateQueries({ queryKey: prizeClaimKeys.detail(claimId) });
    },
  });
}
