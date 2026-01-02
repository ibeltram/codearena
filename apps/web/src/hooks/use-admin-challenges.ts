'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Challenge,
  ChallengesResponse,
  ChallengeFilters,
  AdminChallenge,
  AdminChallengeResponse,
  AdminVersionResponse,
  CreateChallengeInput,
  UpdateChallengeInput,
  CreateVersionInput,
  ChallengeVersionFull,
} from '@/types/challenge';

// Query keys for cache management
export const adminChallengeKeys = {
  all: ['admin', 'challenges'] as const,
  lists: () => [...adminChallengeKeys.all, 'list'] as const,
  list: (filters: ChallengeFilters) => [...adminChallengeKeys.lists(), filters] as const,
  details: () => [...adminChallengeKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminChallengeKeys.details(), id] as const,
  versions: (challengeId: string) => [...adminChallengeKeys.detail(challengeId), 'versions'] as const,
  version: (challengeId: string, versionId: string) =>
    [...adminChallengeKeys.versions(challengeId), versionId] as const,
};

/**
 * Fetch all challenges for admin (includes unpublished)
 */
export function useAdminChallenges(filters: ChallengeFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.category) queryParams.set('category', filters.category);
  if (filters.difficulty) queryParams.set('difficulty', filters.difficulty);
  if (filters.search) queryParams.set('search', filters.search);
  if (filters.sort) queryParams.set('sort', filters.sort);
  // Include unpublished for admin
  queryParams.set('includeUnpublished', 'true');

  const queryString = queryParams.toString();
  const endpoint = `/api/challenges${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: adminChallengeKeys.list(filters),
    queryFn: () => api.get<ChallengesResponse>(endpoint),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single challenge with full details for admin editing
 */
export function useAdminChallenge(id: string | undefined) {
  return useQuery({
    queryKey: adminChallengeKeys.detail(id || ''),
    queryFn: () => api.get<AdminChallenge>(`/api/admin/challenges/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch versions for a challenge
 */
export function useAdminChallengeVersions(challengeId: string | undefined) {
  return useQuery({
    queryKey: adminChallengeKeys.versions(challengeId || ''),
    queryFn: () => api.get<ChallengeVersionFull[]>(`/api/admin/challenges/${challengeId}/versions`),
    enabled: !!challengeId,
    staleTime: 30 * 1000,
  });
}

/**
 * Create a new challenge
 */
export function useCreateChallenge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateChallengeInput) =>
      api.post<AdminChallengeResponse>('/api/admin/challenges', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminChallengeKeys.lists() });
    },
  });
}

/**
 * Update an existing challenge
 */
export function useUpdateChallenge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateChallengeInput }) =>
      api.patch<AdminChallengeResponse>(`/api/admin/challenges/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminChallengeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminChallengeKeys.detail(variables.id) });
    },
  });
}

/**
 * Delete a challenge
 */
export function useDeleteChallenge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string; challengeId: string }>(`/api/admin/challenges/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminChallengeKeys.lists() });
    },
  });
}

/**
 * Publish a challenge
 */
export function usePublishChallenge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<AdminChallengeResponse>(`/api/admin/challenges/${id}/publish`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: adminChallengeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminChallengeKeys.detail(id) });
    },
  });
}

/**
 * Unpublish a challenge
 */
export function useUnpublishChallenge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<AdminChallengeResponse>(`/api/admin/challenges/${id}/unpublish`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: adminChallengeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminChallengeKeys.detail(id) });
    },
  });
}

/**
 * Create a new version for a challenge
 */
export function useCreateChallengeVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ challengeId, data }: { challengeId: string; data: CreateVersionInput }) =>
      api.post<AdminVersionResponse>(`/api/admin/challenges/${challengeId}/versions`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminChallengeKeys.versions(variables.challengeId),
      });
      queryClient.invalidateQueries({
        queryKey: adminChallengeKeys.detail(variables.challengeId),
      });
    },
  });
}

/**
 * Publish a challenge version
 */
export function usePublishChallengeVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ challengeId, versionId }: { challengeId: string; versionId: string }) =>
      api.post<AdminVersionResponse>(`/api/admin/challenge-versions/${versionId}/publish`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminChallengeKeys.versions(variables.challengeId),
      });
      queryClient.invalidateQueries({
        queryKey: adminChallengeKeys.detail(variables.challengeId),
      });
    },
  });
}

/**
 * Set the default version for a challenge
 */
export function useSetDefaultVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ challengeId, versionId }: { challengeId: string; versionId: string }) =>
      api.post<AdminChallengeResponse>(`/api/admin/challenges/${challengeId}/set-default-version`, { versionId }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminChallengeKeys.detail(variables.challengeId),
      });
      queryClient.invalidateQueries({
        queryKey: adminChallengeKeys.lists(),
      });
    },
  });
}
