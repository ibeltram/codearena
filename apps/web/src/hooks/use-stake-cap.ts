'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StakeCapResponse } from '@/types/stake-cap';

// Query keys
export const stakeCapKeys = {
  all: ['stakeCap'] as const,
  detail: () => [...stakeCapKeys.all, 'detail'] as const,
};

/**
 * Hook to fetch the current user's stake cap information
 */
export function useStakeCap() {
  return useQuery({
    queryKey: stakeCapKeys.detail(),
    queryFn: () => api.get<StakeCapResponse>('/api/ratings/stake-cap'),
    staleTime: 60 * 1000, // 1 minute - stake cap doesn't change frequently
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}
