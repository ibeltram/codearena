'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  CreditBalanceResponse,
  CreditHoldsResponse,
  CreditHistoryResponse,
  CreditHistoryFilters,
  StripeCheckoutResponse,
} from '@/types/wallet';

// Query keys
export const walletKeys = {
  all: ['wallet'] as const,
  balance: () => [...walletKeys.all, 'balance'] as const,
  holds: () => [...walletKeys.all, 'holds'] as const,
  holdsList: (filters: Record<string, unknown>) =>
    [...walletKeys.holds(), filters] as const,
  history: () => [...walletKeys.all, 'history'] as const,
  historyList: (filters: CreditHistoryFilters) =>
    [...walletKeys.history(), filters] as const,
};

/**
 * Hook to fetch credit balance
 */
export function useCreditBalance() {
  return useQuery({
    queryKey: walletKeys.balance(),
    queryFn: () => api.get<CreditBalanceResponse>('/api/credits/balance'),
    staleTime: 10 * 1000, // 10 seconds - balance changes frequently
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });
}

/**
 * Hook to fetch active credit holds
 */
export function useCreditHolds() {
  return useQuery({
    queryKey: walletKeys.holds(),
    queryFn: () => api.get<CreditHoldsResponse>('/api/credits/holds'),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch credit transaction history
 */
export function useCreditHistory(filters: CreditHistoryFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.type) queryParams.set('type', filters.type);
  if (filters.startDate) queryParams.set('startDate', filters.startDate);
  if (filters.endDate) queryParams.set('endDate', filters.endDate);

  const queryString = queryParams.toString();
  const endpoint = `/api/credits/history${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: walletKeys.historyList(filters),
    queryFn: () => api.get<CreditHistoryResponse>(endpoint),
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook to create a Stripe checkout session for credit purchase
 */
export function usePurchaseCredits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (packageId: string) =>
      api.post<StripeCheckoutResponse>('/api/payments/stripe/checkout', {
        packageId,
      }),
    onSuccess: () => {
      // Invalidate balance query after purchase redirect
      // (actual update happens via webhook, but we invalidate anyway)
      queryClient.invalidateQueries({ queryKey: walletKeys.balance() });
      queryClient.invalidateQueries({ queryKey: walletKeys.history() });
    },
  });
}

/**
 * Hook to stake credits for a match
 */
export function useStakeCredits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matchId, amount }: { matchId: string; amount: number }) =>
      api.post('/api/credits/stake', { matchId, amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: walletKeys.balance() });
      queryClient.invalidateQueries({ queryKey: walletKeys.holds() });
      queryClient.invalidateQueries({ queryKey: walletKeys.history() });
    },
  });
}

/**
 * Hook to release a credit hold (usually happens automatically)
 */
export function useReleaseCredits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (holdId: string) =>
      api.post('/api/credits/release', { holdId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: walletKeys.balance() });
      queryClient.invalidateQueries({ queryKey: walletKeys.holds() });
      queryClient.invalidateQueries({ queryKey: walletKeys.history() });
    },
  });
}

/**
 * Export transaction history as CSV or JSON
 */
export async function exportTransactionHistory(
  filters: CreditHistoryFilters & { format?: 'csv' | 'json' } = {}
): Promise<void> {
  const queryParams = new URLSearchParams();

  if (filters.type) queryParams.set('type', filters.type);
  if (filters.startDate) queryParams.set('startDate', filters.startDate);
  if (filters.endDate) queryParams.set('endDate', filters.endDate);
  queryParams.set('format', filters.format || 'csv');

  const queryString = queryParams.toString();
  const endpoint = `/api/credits/history/export${queryString ? `?${queryString}` : ''}`;

  // Get auth token
  let authToken: string | null = null;
  if (typeof window !== 'undefined') {
    const authData = localStorage.getItem('reporivals-auth');
    if (authData) {
      try {
        const { state } = JSON.parse(authData);
        if (state?.accessToken) {
          authToken = state.accessToken;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  const headers: HeadersInit = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to export transactions');
  }

  // Get the filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `reporivals-transactions-${new Date().toISOString().split('T')[0]}`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="(.+?)"/);
    if (match) {
      filename = match[1];
    }
  } else {
    filename += filters.format === 'json' ? '.json' : '.csv';
  }

  // Download the file
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
