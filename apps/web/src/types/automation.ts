/**
 * Automation Services Types
 *
 * Phase 10: Credit redemption for automation services
 */

// Job types
export type AutomationJobType =
  | 'batch_run'
  | 'eval_pipeline'
  | 'ci_check'
  | 'multi_model_compare'
  | 'agent_job';

// Job tiers
export type AutomationTier = 'small' | 'medium' | 'large';

// Job status
export type AutomationJobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

// Job type metadata
export interface JobTypeInfo {
  type: AutomationJobType;
  name: string;
  description: string;
}

// Tier metadata
export interface TierInfo {
  tier: AutomationTier;
  name: string;
  description: string;
}

// Credit costs by job type and tier
export type CreditCosts = {
  [K in AutomationJobType]: {
    [T in AutomationTier]: number;
  };
};

// Time limits by tier (in seconds)
export type TimeLimits = {
  [T in AutomationTier]: number;
};

// Concurrency limits by tier
export type ConcurrencyLimits = {
  [T in AutomationTier]: number;
};

// Pricing response
export interface AutomationPricingResponse {
  creditCosts: CreditCosts;
  timeLimits: TimeLimits;
  concurrencyLimits: ConcurrencyLimits;
  jobTypes: JobTypeInfo[];
  tiers: TierInfo[];
}

// Batch run config
export interface BatchRunConfig {
  type: 'batch_run';
  prompts: Array<{
    id: string;
    content: string;
    parameters?: Record<string, unknown>;
  }>;
  model: string;
  maxConcurrency?: number;
  outputFormat?: 'json' | 'csv' | 'markdown';
}

// Eval pipeline config
export interface EvalPipelineConfig {
  type: 'eval_pipeline';
  testCases: Array<{
    id: string;
    input: string;
    expectedOutput?: string;
    rubric?: string;
  }>;
  model: string;
  baseline?: {
    version: string;
    results: Record<string, string>;
  };
  passThreshold?: number;
}

// CI check config
export interface CICheckConfig {
  type: 'ci_check';
  repository: string;
  branch: string;
  commitSha?: string;
  pullRequestNumber?: number;
  checks: Array<'lint' | 'typecheck' | 'test' | 'security' | 'performance'>;
  generateFixes?: boolean;
  postComment?: boolean;
}

// Multi-model compare config
export interface MultiModelCompareConfig {
  type: 'multi_model_compare';
  prompt: string;
  models: string[];
  rubric?: {
    criteria: Array<{
      name: string;
      weight: number;
      description: string;
    }>;
  };
  outputFormat?: 'json' | 'markdown' | 'table';
}

// Agent job config
export interface AgentJobConfig {
  type: 'agent_job';
  taskType: 'refactor' | 'generate_tests' | 'documentation' | 'code_review' | 'custom';
  targetFiles?: string[];
  repository?: string;
  instructions: string;
  constraints?: {
    maxFiles?: number;
    maxChangesPerFile?: number;
    allowedFileTypes?: string[];
  };
  outputFormat?: 'patch' | 'files' | 'report';
}

// Union type for all config types
export type AutomationInputConfig =
  | BatchRunConfig
  | EvalPipelineConfig
  | CICheckConfig
  | MultiModelCompareConfig
  | AgentJobConfig;

// Job record
export interface AutomationJob {
  id: string;
  userId: string;
  jobType: AutomationJobType;
  tier: AutomationTier;
  name: string;
  description?: string | null;
  status: AutomationJobStatus;
  progress: number;
  inputConfig: AutomationInputConfig;
  outputSummary?: string | null;
  errorMessage?: string | null;
  executionTimeMs?: number | null;
  creditsCost: number;
  creditsHoldId?: string | null;
  createdAt: string;
  queuedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  updatedAt: string;
}

// Job list item (summary)
export interface AutomationJobSummary {
  id: string;
  name: string;
  jobType: AutomationJobType;
  tier: AutomationTier;
  status: AutomationJobStatus;
  progress: number;
  creditsCost: number;
  createdAt: string;
  completedAt?: string | null;
  outputSummary?: string | null;
}

// Job result record
export interface AutomationJobResult {
  id: string;
  jobId: string;
  stepIndex: number;
  stepName?: string | null;
  status: 'pending' | 'running' | 'success' | 'failed';
  inputRef?: string | null;
  outputData?: Record<string, unknown> | null;
  score?: number | null;
  evidence?: Record<string, unknown> | null;
  errorMessage?: string | null;
  executionTimeMs?: number | null;
  createdAt: string;
  updatedAt: string;
}

// Template record
export interface AutomationTemplate {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  jobType: AutomationJobType;
  defaultTier: AutomationTier;
  defaultConfig: AutomationInputConfig;
  isPublic: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// Create job input
export interface CreateAutomationJobInput {
  name: string;
  description?: string;
  jobType: AutomationJobType;
  tier: AutomationTier;
  config: AutomationInputConfig;
}

// Create template input
export interface CreateAutomationTemplateInput {
  name: string;
  description?: string;
  jobType: AutomationJobType;
  defaultTier?: AutomationTier;
  defaultConfig: AutomationInputConfig;
  isPublic?: boolean;
}

// List jobs filters
export interface ListAutomationJobsFilters {
  status?: AutomationJobStatus;
  jobType?: AutomationJobType;
  limit?: number;
  offset?: number;
}

// API Responses
export interface AutomationJobsResponse {
  jobs: AutomationJobSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AutomationJobResponse {
  id: string;
  name: string;
  jobType: AutomationJobType;
  tier: AutomationTier;
  status: AutomationJobStatus;
  creditsCost: number;
  createdAt: string;
  expiresAt?: string | null;
}

export interface AutomationJobResultsResponse {
  job: {
    id: string;
    name: string;
    jobType: AutomationJobType;
    status: AutomationJobStatus;
    outputSummary?: string | null;
    executionTimeMs?: number | null;
    errorMessage?: string | null;
  };
  results: AutomationJobResult[];
}

export interface AutomationTemplatesResponse {
  templates: AutomationTemplate[];
}

// Helpers
export const jobTypeLabels: Record<AutomationJobType, string> = {
  batch_run: 'Batch Runs',
  eval_pipeline: 'Evaluation Pipelines',
  ci_check: 'CI Checks',
  multi_model_compare: 'Multi-Model Comparison',
  agent_job: 'Agent Jobs',
};

export const jobTypeDescriptions: Record<AutomationJobType, string> = {
  batch_run: 'Run N prompts/jobs in parallel with parameter sweeps.',
  eval_pipeline: 'Prompt regression tests comparing outputs vs baselines using judge rubric.',
  ci_check: 'PR bot that runs tests, generates patch suggestions, and writes reports.',
  multi_model_compare: 'Run same input across models, score via rubric, and rank outputs.',
  agent_job: 'Bounded tasks (refactor, generate tests) run as jobs with limits and logs.',
};

export const jobTypeIcons: Record<AutomationJobType, string> = {
  batch_run: 'Layers',
  eval_pipeline: 'FlaskConical',
  ci_check: 'GitPullRequest',
  multi_model_compare: 'Scale',
  agent_job: 'Bot',
};

export const tierLabels: Record<AutomationTier, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

export const statusLabels: Record<AutomationJobStatus, string> = {
  pending: 'Pending',
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  timeout: 'Timeout',
};

export const statusColors: Record<AutomationJobStatus, string> = {
  pending: 'bg-gray-500',
  queued: 'bg-blue-500',
  running: 'bg-yellow-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-400',
  timeout: 'bg-orange-500',
};

export function formatCreditsRequired(credits: number): string {
  return credits.toLocaleString();
}
