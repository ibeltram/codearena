'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  DisputesResponse,
  DisputeDetailResponse,
  DisputeFilters,
  ResolveDisputeInput,
  ResolveDisputeResponse,
  ReviewDisputeResponse,
  RejudgeDisputeResponse,
} from '@/types/dispute';

// Query keys for cache management
export const adminDisputeKeys = {
  all: ['admin', 'disputes'] as const,
  lists: () => [...adminDisputeKeys.all, 'list'] as const,
  list: (filters: DisputeFilters) => [...adminDisputeKeys.lists(), filters] as const,
  details: () => [...adminDisputeKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminDisputeKeys.details(), id] as const,
};

/**
 * Fetch all disputes for admin with filters
 */
export function useAdminDisputes(filters: DisputeFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.status) queryParams.set('status', filters.status);

  const queryString = queryParams.toString();
  const endpoint = `/api/admin/disputes${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: adminDisputeKeys.list(filters),
    queryFn: () => api.get<DisputesResponse>(endpoint),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single dispute with full details
 */
export function useAdminDispute(id: string | undefined) {
  return useQuery({
    queryKey: adminDisputeKeys.detail(id || ''),
    queryFn: () => api.get<DisputeDetailResponse>(`/api/admin/disputes/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Start reviewing a dispute (mark as in_review)
 */
export function useStartReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (disputeId: string) =>
      api.post<ReviewDisputeResponse>(`/api/admin/disputes/${disputeId}/review`),
    onSuccess: (_, disputeId) => {
      queryClient.invalidateQueries({ queryKey: adminDisputeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminDisputeKeys.detail(disputeId) });
    },
  });
}

/**
 * Resolve a dispute
 */
export function useResolveDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ disputeId, data }: { disputeId: string; data: ResolveDisputeInput }) =>
      api.post<ResolveDisputeResponse>(`/api/admin/disputes/${disputeId}/resolve`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminDisputeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminDisputeKeys.detail(variables.disputeId) });
    },
  });
}

/**
 * Request a re-judge for a dispute
 */
export function useRejudgeDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (disputeId: string) =>
      api.post<RejudgeDisputeResponse>(`/api/admin/disputes/${disputeId}/rejudge`),
    onSuccess: (_, disputeId) => {
      queryClient.invalidateQueries({ queryKey: adminDisputeKeys.detail(disputeId) });
    },
  });
}
