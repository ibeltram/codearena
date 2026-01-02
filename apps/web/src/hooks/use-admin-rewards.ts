'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PartnerReward, RewardTier, RewardType } from '@/types/rewards';

// Query keys
export const adminRewardsKeys = {
  all: ['admin', 'rewards'] as const,
  partners: () => [...adminRewardsKeys.all, 'partners'] as const,
  partnersList: () => [...adminRewardsKeys.partners(), 'list'] as const,
  partnerDetail: (id: string) => [...adminRewardsKeys.partners(), 'detail', id] as const,
  inventory: () => [...adminRewardsKeys.all, 'inventory'] as const,
  inventoryList: (filters: AdminInventoryFilters) => [...adminRewardsKeys.inventory(), filters] as const,
  redemptions: () => [...adminRewardsKeys.all, 'redemptions'] as const,
  redemptionsList: (filters: AdminRedemptionsFilters) => [...adminRewardsKeys.redemptions(), filters] as const,
};

// Types
export interface AdminPartnerReward extends PartnerReward {
  // Admin-specific fields (if any)
}

export interface AdminPartnersResponse {
  data: AdminPartnerReward[];
}

export interface CreatePartnerInput {
  partnerSlug: string;
  name: string;
  logoUrl?: string;
  description?: string;
  rewardType: RewardType;
  tiers: RewardTier[];
}

export interface UpdatePartnerInput {
  name?: string;
  logoUrl?: string | null;
  description?: string | null;
  rewardType?: RewardType;
  tiers?: RewardTier[];
  isActive?: boolean;
}

export interface AdminInventoryFilters {
  partnerId?: string;
  status?: 'available' | 'reserved' | 'redeemed' | 'expired';
}

export interface AdminRedemptionsFilters {
  page?: number;
  limit?: number;
  partnerId?: string;
  userId?: string;
  status?: 'pending' | 'issued' | 'activated' | 'expired' | 'refunded';
}

export interface InventoryTierStats {
  tierSlug: string;
  available: number;
  reserved: number;
  redeemed: number;
  expired: number;
  total: number;
}

export interface InventoryPartnerStats {
  partnerId: string;
  partnerSlug: string;
  partnerName: string;
  tiers: InventoryTierStats[];
}

export interface InventoryResponse {
  data: InventoryPartnerStats[];
  totals: {
    available: number;
    reserved: number;
    redeemed: number;
    expired: number;
    total: number;
  };
}

export interface AdminRedemption {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  partnerSlug: string;
  partnerName: string;
  tierSlug: string;
  creditsSpent: number;
  codeIssued: string | null;
  status: string;
  issuedAt: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface AdminRedemptionsResponse {
  data: AdminRedemption[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BulkUploadCode {
  tierSlug: string;
  code: string;
  codeType?: 'single_use' | 'multi_use' | 'api_generated';
  expiresAt?: string;
}

export interface BulkUploadInput {
  partnerId: string;
  codes: BulkUploadCode[];
}

export interface RefundInput {
  reason: string;
}

/**
 * Hook to fetch all partners (including inactive) for admin
 */
export function useAdminRewardsPartners() {
  return useQuery({
    queryKey: adminRewardsKeys.partnersList(),
    queryFn: () => api.get<AdminPartnersResponse>('/api/admin/rewards/partners'),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to create a new partner
 */
export function useCreatePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePartnerInput) =>
      api.post<{ data: AdminPartnerReward }>('/api/admin/rewards/partners', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRewardsKeys.partners() });
    },
  });
}

/**
 * Hook to update a partner
 */
export function useUpdatePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePartnerInput }) =>
      api.put<{ data: AdminPartnerReward }>(`/api/admin/rewards/partners/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRewardsKeys.partners() });
    },
  });
}

/**
 * Hook to deactivate (soft delete) a partner
 */
export function useDeactivatePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ success: boolean }>(`/api/admin/rewards/partners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRewardsKeys.partners() });
    },
  });
}

/**
 * Hook to fetch inventory status
 */
export function useAdminInventory(filters: AdminInventoryFilters = {}) {
  const queryParams = new URLSearchParams();
  if (filters.partnerId) queryParams.set('partnerId', filters.partnerId);
  if (filters.status) queryParams.set('status', filters.status);

  const queryString = queryParams.toString();
  const endpoint = `/api/admin/rewards/inventory${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: adminRewardsKeys.inventoryList(filters),
    queryFn: () => api.get<InventoryResponse>(endpoint),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to bulk upload codes
 */
export function useBulkUploadCodes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkUploadInput) =>
      api.post<{ success: boolean; uploaded: number }>('/api/admin/rewards/inventory/upload', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRewardsKeys.inventory() });
    },
  });
}

/**
 * Hook to fetch all redemptions for admin
 */
export function useAdminRedemptions(filters: AdminRedemptionsFilters = {}) {
  const queryParams = new URLSearchParams();
  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.partnerId) queryParams.set('partnerId', filters.partnerId);
  if (filters.userId) queryParams.set('userId', filters.userId);
  if (filters.status) queryParams.set('status', filters.status);

  const queryString = queryParams.toString();
  const endpoint = `/api/admin/rewards/redemptions${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: adminRewardsKeys.redemptionsList(filters),
    queryFn: () => api.get<AdminRedemptionsResponse>(endpoint),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to process a refund
 */
export function useRefundRedemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RefundInput }) =>
      api.post<{ success: boolean; refunded: { redemptionId: string; creditsRefunded: number; userId: string } }>(
        `/api/admin/rewards/refund/${id}`,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRewardsKeys.redemptions() });
    },
  });
}
