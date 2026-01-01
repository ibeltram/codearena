'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  AutomationPricingResponse,
  AutomationJobsResponse,
  AutomationJob,
  AutomationJobResultsResponse,
  AutomationTemplatesResponse,
  AutomationTemplate,
  AutomationJobResponse,
  CreateAutomationJobInput,
  CreateAutomationTemplateInput,
  ListAutomationJobsFilters,
} from '@/types/automation';

// Query keys
export const automationKeys = {
  all: ['automation'] as const,
  pricing: () => [...automationKeys.all, 'pricing'] as const,
  jobs: () => [...automationKeys.all, 'jobs'] as const,
  jobsList: (filters: ListAutomationJobsFilters) =>
    [...automationKeys.jobs(), filters] as const,
  job: (id: string) => [...automationKeys.jobs(), id] as const,
  jobResults: (id: string) => [...automationKeys.jobs(), id, 'results'] as const,
  templates: () => [...automationKeys.all, 'templates'] as const,
  templatesList: (filters: { jobType?: string; public?: boolean }) =>
    [...automationKeys.templates(), filters] as const,
  template: (id: string) => [...automationKeys.templates(), id] as const,
};

/**
 * Hook to fetch automation pricing info
 */
export function useAutomationPricing() {
  return useQuery({
    queryKey: automationKeys.pricing(),
    queryFn: () => api.get<AutomationPricingResponse>('/api/automation/pricing'),
    staleTime: 5 * 60 * 1000, // 5 minutes - pricing doesn't change often
  });
}

/**
 * Hook to fetch user's automation jobs
 */
export function useAutomationJobs(filters: ListAutomationJobsFilters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.status) queryParams.set('status', filters.status);
  if (filters.jobType) queryParams.set('jobType', filters.jobType);
  if (filters.limit) queryParams.set('limit', String(filters.limit));
  if (filters.offset) queryParams.set('offset', String(filters.offset));

  const queryString = queryParams.toString();
  const endpoint = `/api/automation/jobs${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: automationKeys.jobsList(filters),
    queryFn: () => api.get<AutomationJobsResponse>(endpoint),
    staleTime: 10 * 1000, // 10 seconds - jobs status changes
    refetchInterval: 30 * 1000, // Refetch every 30 seconds for active jobs
  });
}

/**
 * Hook to fetch a single automation job
 */
export function useAutomationJob(id: string) {
  return useQuery({
    queryKey: automationKeys.job(id),
    queryFn: () => api.get<AutomationJob>(`/api/automation/jobs/${id}`),
    enabled: !!id,
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: (query) => {
      // Refetch every 5 seconds if job is running
      const job = query.state.data;
      if (job && ['pending', 'queued', 'running'].includes(job.status)) {
        return 5000;
      }
      return false;
    },
  });
}

/**
 * Hook to fetch automation job results
 */
export function useAutomationJobResults(id: string) {
  return useQuery({
    queryKey: automationKeys.jobResults(id),
    queryFn: () => api.get<AutomationJobResultsResponse>(`/api/automation/jobs/${id}/results`),
    enabled: !!id,
    staleTime: 10 * 1000, // 10 seconds
  });
}

/**
 * Hook to create a new automation job
 */
export function useCreateAutomationJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAutomationJobInput) =>
      api.post<AutomationJobResponse>('/api/automation/jobs', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.jobs() });
      // Also invalidate wallet balance since credits are held
      queryClient.invalidateQueries({ queryKey: ['wallet', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['wallet', 'holds'] });
    },
  });
}

/**
 * Hook to cancel an automation job
 */
export function useCancelAutomationJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ success: boolean; message: string }>(`/api/automation/jobs/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: automationKeys.job(id) });
      queryClient.invalidateQueries({ queryKey: automationKeys.jobs() });
      // Credits are released on cancel
      queryClient.invalidateQueries({ queryKey: ['wallet', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['wallet', 'holds'] });
    },
  });
}

/**
 * Hook to retry a failed automation job
 */
export function useRetryAutomationJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean; message: string }>(`/api/automation/jobs/${id}/retry`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: automationKeys.job(id) });
      queryClient.invalidateQueries({ queryKey: automationKeys.jobResults(id) });
      queryClient.invalidateQueries({ queryKey: automationKeys.jobs() });
      // Credits are held again for retry
      queryClient.invalidateQueries({ queryKey: ['wallet', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['wallet', 'holds'] });
    },
  });
}

/**
 * Hook to fetch automation templates
 */
export function useAutomationTemplates(filters: { jobType?: string; public?: boolean } = {}) {
  const queryParams = new URLSearchParams();

  if (filters.jobType) queryParams.set('jobType', filters.jobType);
  if (filters.public !== undefined) queryParams.set('public', String(filters.public));

  const queryString = queryParams.toString();
  const endpoint = `/api/automation/templates${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: automationKeys.templatesList(filters),
    queryFn: () => api.get<AutomationTemplatesResponse>(endpoint),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to create an automation template
 */
export function useCreateAutomationTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAutomationTemplateInput) =>
      api.post<AutomationTemplate>('/api/automation/templates', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.templates() });
    },
  });
}

/**
 * Hook to update an automation template
 */
export function useUpdateAutomationTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CreateAutomationTemplateInput> & { id: string }) =>
      api.put<AutomationTemplate>(`/api/automation/templates/${id}`, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: automationKeys.template(variables.id) });
      queryClient.invalidateQueries({ queryKey: automationKeys.templates() });
    },
  });
}

/**
 * Hook to delete an automation template
 */
export function useDeleteAutomationTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ success: boolean }>(`/api/automation/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.templates() });
    },
  });
}
