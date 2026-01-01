'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types for user-facing dispute operations
export interface CreateDisputeInput {
  reason: string;
  evidence?: {
    description?: string;
    screenshots?: string[];
    links?: string[];
    additionalContext?: string;
  };
}

export interface DisputeResponse {
  id: string;
  matchId: string;
  status: 'open' | 'in_review' | 'resolved';
  reason: string;
  evidence: {
    description?: string;
    screenshots?: string[];
    links?: string[];
    additionalContext?: string;
  };
  createdAt: string;
  message: string;
}

export interface MatchDisputeUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface MatchDisputeItem {
  id: string;
  matchId: string;
  status: 'open' | 'in_review' | 'resolved';
  reason: string;
  evidenceJson: Record<string, unknown>;
  resolutionJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  openedBy: MatchDisputeUser;
}

export interface MatchDisputesResponse {
  matchId: string;
  matchDisputeStatus: 'none' | 'open' | 'resolved';
  disputes: MatchDisputeItem[];
  canDispute: boolean;
}

export interface MyDisputeItem {
  id: string;
  matchId: string;
  status: 'open' | 'in_review' | 'resolved';
  reason: string;
  evidenceJson: Record<string, unknown>;
  resolutionJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyDisputesResponse {
  data: MyDisputeItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Query keys for cache management
export const disputeKeys = {
  all: ['disputes'] as const,
  matchDisputes: (matchId: string) => [...disputeKeys.all, 'match', matchId] as const,
  myDisputes: (filters: { page?: number; limit?: number; status?: string }) =>
    [...disputeKeys.all, 'my', filters] as const,
};

/**
 * Fetch disputes for a specific match
 */
export function useMatchDisputes(matchId: string | undefined) {
  return useQuery({
    queryKey: disputeKeys.matchDisputes(matchId || ''),
    queryFn: () => api.get<MatchDisputesResponse>(`/api/matches/${matchId}/disputes`),
    enabled: !!matchId,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch current user's disputes
 */
export function useMyDisputes(filters: { page?: number; limit?: number; status?: string } = {}) {
  const queryParams = new URLSearchParams();
  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.status) queryParams.set('status', filters.status);

  const queryString = queryParams.toString();
  const endpoint = `/api/disputes/my${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: disputeKeys.myDisputes(filters),
    queryFn: () => api.get<MyDisputesResponse>(endpoint),
    staleTime: 30 * 1000,
  });
}

/**
 * Create a new dispute for a match
 */
export function useCreateDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matchId, data }: { matchId: string; data: CreateDisputeInput }) =>
      api.post<DisputeResponse>(`/api/matches/${matchId}/disputes`, data),
    onSuccess: (_, variables) => {
      // Invalidate match disputes cache
      queryClient.invalidateQueries({ queryKey: disputeKeys.matchDisputes(variables.matchId) });
      // Invalidate my disputes cache
      queryClient.invalidateQueries({ queryKey: disputeKeys.all });
    },
  });
}

// Display helpers
export const disputeStatusLabels: Record<string, string> = {
  open: 'Open',
  in_review: 'In Review',
  resolved: 'Resolved',
};

export const disputeStatusColors: Record<string, string> = {
  open: 'bg-yellow-500',
  in_review: 'bg-blue-500',
  resolved: 'bg-green-500',
};
