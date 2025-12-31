/**
 * Account Management Hooks
 *
 * React Query hooks for GDPR-compliant account operations:
 * - Data export
 * - Account deletion
 * - Profile updates
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export interface DeletionStatus {
  status: 'active' | 'pending_deletion' | 'deleted';
  deletionRequestedAt?: string | null;
  deletionScheduledAt?: string | null;
  daysRemaining?: number;
  canCancel?: boolean;
  deletedAt?: string;
}

export interface DeletionResponse {
  message: string;
  deletionScheduledAt: string;
  gracePeriodDays: number;
  canCancelUntil: string;
}

export interface CancelDeletionResponse {
  message: string;
  status: 'active';
}

export interface UpdateProfileRequest {
  displayName?: string;
  avatarUrl?: string;
  preferences?: Record<string, unknown>;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  preferences: Record<string, unknown>;
}

// Query keys
export const accountKeys = {
  all: ['account'] as const,
  deletionStatus: () => [...accountKeys.all, 'deletion-status'] as const,
};

/**
 * Hook to fetch account deletion status
 */
export function useDeletionStatus() {
  return useQuery({
    queryKey: accountKeys.deletionStatus(),
    queryFn: () => api.get<DeletionStatus>('/api/users/me/deletion-status'),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to export all user data (GDPR data portability)
 */
export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      // Use fetch directly to handle file download
      const response = await fetch('/api/users/me/export', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to export data');
      }

      // Get the data and create a download
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporivals-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return data;
    },
  });
}

/**
 * Hook to request account deletion
 */
export function useRequestDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (confirmText: string) =>
      api.delete<DeletionResponse>('/api/users/me', {
        data: { confirmText },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.deletionStatus() });
    },
  });
}

/**
 * Hook to cancel pending account deletion
 */
export function useCancelDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<CancelDeletionResponse>('/api/users/me/cancel-deletion', {
        confirm: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.deletionStatus() });
    },
  });
}

/**
 * Hook to update user profile
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProfileRequest) =>
      api.patch<UserProfile>('/api/users/me', data),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });
}
