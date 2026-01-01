import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

// Types
export interface ReportUserData {
  reason: 'cheating' | 'harassment' | 'inappropriate_content' | 'spam' | 'other';
  description: string;
  evidence?: {
    matchId?: string;
    screenshots?: string[];
    links?: string[];
    additionalContext?: string;
  };
}

export interface UserReport {
  id: string;
  reason: string;
  reasonLabel: string;
  description: string;
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
  reportedUser: {
    id: string;
    displayName: string;
  };
}

export interface ReportResponse {
  id: string;
  status: string;
  reason: string;
  reasonLabel: string;
  createdAt: string;
  message: string;
}

// API functions
async function reportUser(
  userId: string,
  data: ReportUserData,
  headers: Record<string, string>
): Promise<ReportResponse> {
  const response = await fetch(`${API_URL}/api/users/${userId}/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(data),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to submit report' }));
    throw new Error(error.message || 'Failed to submit report');
  }

  return response.json();
}

async function fetchMyReports(
  headers: Record<string, string>,
  params?: {
    page?: number;
    limit?: number;
    status?: string;
  }
): Promise<{
  data: UserReport[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.status) searchParams.set('status', params.status);

  const response = await fetch(`${API_URL}/api/reports/my?${searchParams}`, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch reports' }));
    throw new Error(error.message || 'Failed to fetch reports');
  }

  return response.json();
}

// Hooks
export function useReportUser() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: ReportUserData }) => {
      const headers: Record<string, string> = {};
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }
      return reportUser(userId, data, headers);
    },
    onSuccess: () => {
      // Invalidate my reports list
      queryClient.invalidateQueries({ queryKey: ['my-reports'] });
    },
  });
}

export function useMyReports(params?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['my-reports', params],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }
      return fetchMyReports(headers, params);
    },
    enabled: !!user,
  });
}
