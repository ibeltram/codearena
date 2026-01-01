'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AdminStats {
  totalChallenges: number;
  openDisputes: number;
  activeUsers: number;
  matchesToday: number;
}

// Query keys for cache management
export const adminStatsKeys = {
  all: ['admin', 'stats'] as const,
  stats: () => [...adminStatsKeys.all] as const,
};

/**
 * Fetch admin dashboard statistics
 */
export function useAdminStats() {
  return useQuery({
    queryKey: adminStatsKeys.stats(),
    queryFn: () => api.get<AdminStats>('/api/admin/stats'),
    staleTime: 30 * 1000, // 30 seconds - stats can be slightly stale
    refetchInterval: 60 * 1000, // Refetch every minute
  });
}
