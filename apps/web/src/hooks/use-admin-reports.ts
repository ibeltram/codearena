'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  ReportsResponse,
  ReportDetailResponse,
  ReportFilters,
  UpdateReportStatusInput,
  UpdateReportStatusResponse,
  ResolveReportInput,
  ResolveReportResponse,
  ReportStats,
} from '@/types/report';

// Query keys for cache management
export const adminReportKeys = {
  all: ['admin', 'reports'] as const,
  lists: () => [...adminReportKeys.all, 'list'] as const,
  list: (filters: ReportFilters) => [...adminReportKeys.lists(), filters] as const,
  details: () => [...adminReportKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminReportKeys.details(), id] as const,
  stats: () => [...adminReportKeys.all, 'stats'] as const,
};

/**
 * Fetch all user reports for admin with filters
 */
export function useAdminReports(filters: ReportFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.reason) queryParams.set('reason', filters.reason);
  if (filters.reportedUserId) queryParams.set('reportedUserId', filters.reportedUserId);

  const queryString = queryParams.toString();
  const endpoint = `/api/admin/reports${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: adminReportKeys.list(filters),
    queryFn: () => api.get<ReportsResponse>(endpoint),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single report with full details
 */
export function useAdminReport(id: string | undefined) {
  return useQuery({
    queryKey: adminReportKeys.detail(id || ''),
    queryFn: () => api.get<ReportDetailResponse>(`/api/admin/reports/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch report statistics
 */
export function useReportStats() {
  return useQuery({
    queryKey: adminReportKeys.stats(),
    queryFn: () => api.get<ReportStats>('/api/admin/reports/stats'),
    staleTime: 60 * 1000,
  });
}

/**
 * Start reviewing a report (mark as in_review)
 */
export function useStartReportReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reportId: string) =>
      api.patch<UpdateReportStatusResponse>(`/api/admin/reports/${reportId}/status`, {
        status: 'in_review',
      }),
    onSuccess: (_, reportId) => {
      queryClient.invalidateQueries({ queryKey: adminReportKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminReportKeys.detail(reportId) });
      queryClient.invalidateQueries({ queryKey: adminReportKeys.stats() });
    },
  });
}

/**
 * Update report status
 */
export function useUpdateReportStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reportId, data }: { reportId: string; data: UpdateReportStatusInput }) =>
      api.patch<UpdateReportStatusResponse>(`/api/admin/reports/${reportId}/status`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminReportKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminReportKeys.detail(variables.reportId) });
      queryClient.invalidateQueries({ queryKey: adminReportKeys.stats() });
    },
  });
}

/**
 * Resolve a report with action
 */
export function useResolveReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reportId, data }: { reportId: string; data: ResolveReportInput }) =>
      api.post<ResolveReportResponse>(`/api/admin/reports/${reportId}/resolve`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminReportKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminReportKeys.detail(variables.reportId) });
      queryClient.invalidateQueries({ queryKey: adminReportKeys.stats() });
      // Also invalidate user cache if ban action was taken
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
