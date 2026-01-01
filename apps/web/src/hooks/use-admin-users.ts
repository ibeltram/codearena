'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types for admin users
export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  roles: string[];
  isBanned: boolean;
  isVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserDetail extends AdminUser {
  preferences: Record<string, unknown> | null;
  auditHistory: AuditHistoryItem[];
}

export interface AuditHistoryItem {
  id: string;
  eventType: string;
  payloadJson: Record<string, unknown>;
  createdAt: string;
}

export interface AdminUsersFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: 'user' | 'admin' | 'moderator';
}

export interface AdminUsersResponse {
  data: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminUserDetailResponse {
  user: AdminUserDetail;
  auditHistory: AuditHistoryItem[];
}

export interface UpdateRolesInput {
  roles: ('user' | 'admin' | 'moderator')[];
}

export interface BanUserInput {
  reason: string;
}

export interface UserActionResponse {
  id: string;
  roles?: string[];
  isBanned?: boolean;
  message: string;
}

// Query keys for cache management
export const adminUserKeys = {
  all: ['admin', 'users'] as const,
  lists: () => [...adminUserKeys.all, 'list'] as const,
  list: (filters: AdminUsersFilters) => [...adminUserKeys.lists(), filters] as const,
  details: () => [...adminUserKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminUserKeys.details(), id] as const,
};

/**
 * Fetch all users for admin with filters
 */
export function useAdminUsers(filters: AdminUsersFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.search) queryParams.set('search', filters.search);
  if (filters.role) queryParams.set('role', filters.role);

  const queryString = queryParams.toString();
  const endpoint = `/api/admin/users${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: adminUserKeys.list(filters),
    queryFn: () => api.get<AdminUsersResponse>(endpoint),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single user with full details
 */
export function useAdminUser(id: string | undefined) {
  return useQuery({
    queryKey: adminUserKeys.detail(id || ''),
    queryFn: () => api.get<AdminUserDetailResponse>(`/api/admin/users/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Update user roles
 */
export function useUpdateUserRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateRolesInput }) =>
      api.patch<UserActionResponse>(`/api/admin/users/${userId}/roles`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(variables.userId) });
    },
  });
}

/**
 * Ban a user
 */
export function useBanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: BanUserInput }) =>
      api.post<UserActionResponse>(`/api/admin/users/${userId}/ban`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(variables.userId) });
    },
  });
}

/**
 * Unban a user
 */
export function useUnbanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      api.post<UserActionResponse>(`/api/admin/users/${userId}/unban`),
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(userId) });
    },
  });
}
