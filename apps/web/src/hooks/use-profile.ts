'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { UserProfile, UserProfileResponse, User } from '@/types/user';
import { MatchesResponse } from '@/types/match';

// Fetch user profile by username
export function useUserProfile(username: string | undefined) {
  return useQuery({
    queryKey: ['profile', username],
    queryFn: () => api.get<UserProfileResponse>(`/api/users/${username}/profile`),
    enabled: !!username,
    staleTime: 60 * 1000, // 1 minute
    select: (data) => data.data,
  });
}

// Fetch current user's profile (authenticated)
export function useMyProfile() {
  return useQuery({
    queryKey: ['my-profile'],
    queryFn: () => api.get<UserProfileResponse>('/api/users/me/profile'),
    staleTime: 60 * 1000, // 1 minute
    select: (data) => data.data,
  });
}

// Fetch user's match history
interface MatchHistoryFilters {
  page?: number;
  limit?: number;
}

export function useUserMatchHistory(
  username: string | undefined,
  filters: MatchHistoryFilters = {}
) {
  const queryParams = new URLSearchParams();
  if (filters.page) queryParams.set('page', String(filters.page));
  if (filters.limit) queryParams.set('limit', String(filters.limit));

  const queryString = queryParams.toString();
  const endpoint = `/api/users/${username}/matches${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: ['user-matches', username, filters],
    queryFn: () => api.get<MatchesResponse>(endpoint),
    enabled: !!username,
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData,
  });
}

// Update user profile settings
interface UpdateProfileData {
  displayName?: string;
  avatarUrl?: string;
  preferences?: {
    publicArtifacts?: boolean;
    emailNotifications?: boolean;
  };
}

interface UpdateProfileResponse {
  data: User;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProfileData) =>
      api.patch<UpdateProfileResponse>('/api/users/me', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// Toggle public artifacts visibility
export function useTogglePublicArtifacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (publicArtifacts: boolean) =>
      api.patch<UpdateProfileResponse>('/api/users/me', {
        preferences: { publicArtifacts },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
