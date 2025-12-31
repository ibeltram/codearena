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
