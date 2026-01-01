'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  AuditEventsResponse,
  AuditEventDetail,
  EntityAuditTrailResponse,
  UserAuditTrailResponse,
  AuditStatsResponse,
  AuditExportResponse,
  AuditFilters,
} from '@/types/audit';

// Query keys for cache management
export const adminAuditKeys = {
  all: ['admin', 'audit'] as const,
  lists: () => [...adminAuditKeys.all, 'list'] as const,
  list: (filters: AuditFilters) => [...adminAuditKeys.lists(), filters] as const,
  details: () => [...adminAuditKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminAuditKeys.details(), id] as const,
  entity: (type: string, id: string) => [...adminAuditKeys.all, 'entity', type, id] as const,
  user: (userId: string) => [...adminAuditKeys.all, 'user', userId] as const,
  stats: (days: number) => [...adminAuditKeys.all, 'stats', days] as const,
};

/**
 * Fetch audit events with filters and pagination
 */
export function useAdminAuditEvents(filters: AuditFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.actorUserId) queryParams.set('actorUserId', filters.actorUserId);
  if (filters.category) queryParams.set('category', filters.category);
  if (filters.eventType) queryParams.set('eventType', filters.eventType);
  if (filters.entityType) queryParams.set('entityType', filters.entityType);
  if (filters.entityId) queryParams.set('entityId', filters.entityId);
  if (filters.startDate) queryParams.set('startDate', filters.startDate);
  if (filters.endDate) queryParams.set('endDate', filters.endDate);

  const queryString = queryParams.toString();
  const endpoint = `/api/admin/audit${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: adminAuditKeys.list(filters),
    queryFn: () => api.get<AuditEventsResponse>(endpoint),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single audit event detail
 */
export function useAdminAuditEvent(id: string | undefined) {
  return useQuery({
    queryKey: adminAuditKeys.detail(id || ''),
    queryFn: () => api.get<AuditEventDetail>(`/api/admin/audit/${id}`),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch audit trail for a specific entity
 */
export function useEntityAuditTrail(entityType: string, entityId: string) {
  return useQuery({
    queryKey: adminAuditKeys.entity(entityType, entityId),
    queryFn: () =>
      api.get<EntityAuditTrailResponse>(
        `/api/admin/audit/entity/${entityType}/${entityId}`
      ),
    enabled: !!entityType && !!entityId,
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch audit trail for a specific user
 */
export function useUserAuditTrail(userId: string | undefined) {
  return useQuery({
    queryKey: adminAuditKeys.user(userId || ''),
    queryFn: () =>
      api.get<UserAuditTrailResponse>(`/api/admin/audit/user/${userId}`),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch audit statistics
 */
export function useAuditStats(days: number = 7) {
  return useQuery({
    queryKey: adminAuditKeys.stats(days),
    queryFn: () =>
      api.get<AuditStatsResponse>(`/api/admin/audit/stats?days=${days}`),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Export audit events to JSON
 */
export function useExportAuditEvents() {
  return useMutation({
    mutationFn: (filters: AuditFilters & { limit?: number }) =>
      api.post<AuditExportResponse>('/api/admin/audit/export', {
        filters,
        limit: filters.limit || 1000,
      }),
    onSuccess: (data) => {
      // Trigger download
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}
