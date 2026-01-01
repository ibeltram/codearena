'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  RewardPartnersResponse,
  RewardPartnerDetailResponse,
  RewardRedemptionsResponse,
  RewardRedemptionDetailResponse,
  RedeemRewardResponse,
  RewardFilters,
  RedemptionFilters,
  LeaderboardPayoutsResponse,
  LeaderboardPayoutHistoryResponse,
  LeaderboardPayoutFilters,
  ClaimLeaderboardRewardResponse,
} from '@/types/rewards';
import { walletKeys } from './use-wallet';

// Query keys
export const rewardsKeys = {
  all: ['rewards'] as const,
  partners: () => [...rewardsKeys.all, 'partners'] as const,
  partnersList: (filters: RewardFilters) =>
    [...rewardsKeys.partners(), filters] as const,
  partnerDetail: (slug: string) =>
    [...rewardsKeys.partners(), 'detail', slug] as const,
  redemptions: () => [...rewardsKeys.all, 'redemptions'] as const,
  redemptionsList: (filters: RedemptionFilters) =>
    [...rewardsKeys.redemptions(), filters] as const,
  redemptionDetail: (id: string) =>
    [...rewardsKeys.redemptions(), 'detail', id] as const,
  leaderboard: () => [...rewardsKeys.all, 'leaderboard'] as const,
  leaderboardCurrent: () => [...rewardsKeys.leaderboard(), 'current'] as const,
  leaderboardHistory: (filters: LeaderboardPayoutFilters) =>
    [...rewardsKeys.leaderboard(), 'history', filters] as const,
};

/**
 * Hook to fetch all active reward partners
 */
export function useRewardPartners(filters: RewardFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.rewardType) {
    queryParams.set('rewardType', filters.rewardType);
  }

  const queryString = queryParams.toString();
  const endpoint = `/api/rewards/partners${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: rewardsKeys.partnersList(filters),
    queryFn: () => api.get<RewardPartnersResponse>(endpoint),
    staleTime: 5 * 60 * 1000, // 5 minutes - partner data doesn't change often
  });
}

/**
 * Hook to fetch a specific partner's details
 */
export function useRewardPartner(slug: string) {
  return useQuery({
    queryKey: rewardsKeys.partnerDetail(slug),
    queryFn: () =>
      api.get<RewardPartnerDetailResponse>(`/api/rewards/partners/${slug}`),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch user's reward redemptions
 */
export function useRewardRedemptions(filters: RedemptionFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.status) queryParams.set('status', filters.status);
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.offset) queryParams.set('offset', String(filters.offset));

  const queryString = queryParams.toString();
  const endpoint = `/api/rewards/redemptions${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: rewardsKeys.redemptionsList(filters),
    queryFn: () => api.get<RewardRedemptionsResponse>(endpoint),
    staleTime: 30 * 1000, // 30 seconds - redemptions may update
  });
}

/**
 * Hook to fetch a specific redemption detail
 */
export function useRewardRedemption(id: string) {
  return useQuery({
    queryKey: rewardsKeys.redemptionDetail(id),
    queryFn: () =>
      api.get<RewardRedemptionDetailResponse>(`/api/rewards/redemptions/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to redeem credits for a reward
 */
export function useRedeemReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      partnerSlug,
      tierSlug,
    }: {
      partnerSlug: string;
      tierSlug: string;
    }) =>
      api.post<RedeemRewardResponse>('/api/rewards/redeem', {
        partnerSlug,
        tierSlug,
      }),
    onSuccess: () => {
      // Invalidate related queries after successful redemption
      queryClient.invalidateQueries({ queryKey: rewardsKeys.partners() });
      queryClient.invalidateQueries({ queryKey: rewardsKeys.redemptions() });
      queryClient.invalidateQueries({ queryKey: walletKeys.balance() });
      queryClient.invalidateQueries({ queryKey: walletKeys.history() });
    },
  });
}

/**
 * Hook to fetch current period leaderboard rewards (pending to claim)
 */
export function useLeaderboardRewards() {
  return useQuery({
    queryKey: rewardsKeys.leaderboardCurrent(),
    queryFn: () => api.get<LeaderboardPayoutsResponse>('/api/rewards/leaderboard'),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch leaderboard rewards history
 */
export function useLeaderboardRewardsHistory(filters: LeaderboardPayoutFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.status) queryParams.set('status', filters.status);
  if (filters.type) queryParams.set('type', filters.type);
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.offset) queryParams.set('offset', String(filters.offset));

  const queryString = queryParams.toString();
  const endpoint = `/api/rewards/leaderboard/history${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: rewardsKeys.leaderboardHistory(filters),
    queryFn: () => api.get<LeaderboardPayoutHistoryResponse>(endpoint),
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to claim a leaderboard reward
 */
export function useClaimLeaderboardReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payoutId: string) =>
      api.post<ClaimLeaderboardRewardResponse>(`/api/rewards/leaderboard/${payoutId}/claim`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rewardsKeys.leaderboard() });
      queryClient.invalidateQueries({ queryKey: walletKeys.balance() });
    },
  });
}

/**
 * Hook to resend a redemption code to email
 */
export function useResendRedemptionCode() {
  return useMutation({
    mutationFn: (redemptionId: string) =>
      api.post<{ success: boolean }>(`/api/rewards/redemptions/${redemptionId}/resend`, {}),
  });
}
