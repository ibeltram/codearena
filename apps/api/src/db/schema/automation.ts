/**
 * Automation Services Schema
 *
 * Phase 10: Credits translate to value through automation services:
 * - Batch Runs: Run N prompts/jobs in parallel with parameter sweeps
 * - Evaluation Pipelines: Prompt regression tests comparing outputs vs baselines
 * - CI Checks: PR bot that runs tests, generates patch suggestions
 * - Multi-Model Comparison: Run same input across models, score via rubric
 * - Agent Jobs: Bounded tasks (refactor, generate tests) run as jobs
 *
 * Each service consumes credits per job/run tier (small/medium/large).
 * Job outputs stored as artifacts with retention limits.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Automation job types
export const automationJobTypeEnum = pgEnum('automation_job_type', [
  'batch_run',
  'eval_pipeline',
  'ci_check',
  'multi_model_compare',
  'agent_job',
]);

// Job status
export const automationJobStatusEnum = pgEnum('automation_job_status', [
  'pending',      // Created but not yet queued
  'queued',       // In the job queue
  'running',      // Currently executing
  'completed',    // Finished successfully
  'failed',       // Failed with error
  'cancelled',    // Cancelled by user
  'timeout',      // Exceeded time limit
]);

// Job size tiers (affects credit cost)
export const automationJobTierEnum = pgEnum('automation_job_tier', [
  'small',   // Basic, lower limits
  'medium',  // Standard
  'large',   // Extended limits, priority
]);

/**
 * Automation Jobs
 * Each job represents a single execution of an automation service
 */
export const automationJobs = pgTable(
  'automation_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Job configuration
    jobType: automationJobTypeEnum('job_type').notNull(),
    tier: automationJobTierEnum('tier').notNull().default('small'),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    // Status tracking
    status: automationJobStatusEnum('status').notNull().default('pending'),
    progress: integer('progress').default(0), // 0-100

    // Input configuration (varies by job type)
    inputConfig: jsonb('input_config').notNull().$type<AutomationInputConfig>(),

    // Credit tracking
    creditsCost: integer('credits_cost').notNull(), // Estimated/actual cost
    creditsHoldId: uuid('credits_hold_id'), // Reference to credit hold

    // Execution details
    queuedAt: timestamp('queued_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // Results and outputs
    outputSummary: jsonb('output_summary').$type<AutomationOutputSummary>(),
    outputArtifactId: uuid('output_artifact_id'), // Link to stored results
    errorMessage: text('error_message'),

    // Execution metadata
    executionTimeMs: integer('execution_time_ms'),
    workerNodeId: varchar('worker_node_id', { length: 100 }),

    // Standard timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }), // When results expire
  },
  (table) => ({
    userIdIdx: index('automation_jobs_user_id_idx').on(table.userId),
    statusIdx: index('automation_jobs_status_idx').on(table.status),
    jobTypeIdx: index('automation_jobs_job_type_idx').on(table.jobType),
    createdAtIdx: index('automation_jobs_created_at_idx').on(table.createdAt),
  })
);

/**
 * Automation Job Results
 * Detailed results for each job execution step
 */
export const automationJobResults = pgTable(
  'automation_job_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => automationJobs.id, { onDelete: 'cascade' }),

    // Step identification
    stepIndex: integer('step_index').notNull(), // Order within job
    stepName: varchar('step_name', { length: 255 }).notNull(),

    // Step results
    status: varchar('status', { length: 50 }).notNull(), // pass/fail/skip/error
    input: jsonb('input').$type<Record<string, unknown>>(),
    output: jsonb('output').$type<Record<string, unknown>>(),

    // For comparison jobs: model-specific results
    modelId: varchar('model_id', { length: 100 }),
    score: integer('score'), // 0-100 for scored results

    // Execution time and metadata
    executionTimeMs: integer('execution_time_ms'),
    errorMessage: text('error_message'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    jobIdIdx: index('automation_job_results_job_id_idx').on(table.jobId),
    stepIndexIdx: index('automation_job_results_step_idx').on(table.jobId, table.stepIndex),
  })
);

/**
 * Automation Templates
 * Saved configurations for common automation tasks
 */
export const automationTemplates = pgTable(
  'automation_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Template details
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    jobType: automationJobTypeEnum('job_type').notNull(),

    // Default configuration
    defaultConfig: jsonb('default_config').notNull().$type<AutomationInputConfig>(),
    defaultTier: automationJobTierEnum('default_tier').notNull().default('small'),

    // Visibility
    isPublic: boolean('is_public').notNull().default(false),

    // Usage stats
    usageCount: integer('usage_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('automation_templates_user_id_idx').on(table.userId),
    jobTypeIdx: index('automation_templates_job_type_idx').on(table.jobType),
    publicIdx: index('automation_templates_public_idx').on(table.isPublic),
  })
);

// Relations
export const automationJobsRelations = relations(automationJobs, ({ one, many }) => ({
  user: one(users, {
    fields: [automationJobs.userId],
    references: [users.id],
  }),
  results: many(automationJobResults),
}));

export const automationJobResultsRelations = relations(automationJobResults, ({ one }) => ({
  job: one(automationJobs, {
    fields: [automationJobResults.jobId],
    references: [automationJobs.id],
  }),
}));

export const automationTemplatesRelations = relations(automationTemplates, ({ one }) => ({
  user: one(users, {
    fields: [automationTemplates.userId],
    references: [users.id],
  }),
}));

// Type definitions for job configurations

/**
 * Batch Run Config
 * Run N prompts/jobs in parallel with parameter sweeps
 */
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

/**
 * Evaluation Pipeline Config
 * Prompt regression tests comparing outputs vs baselines
 */
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
  passThreshold?: number; // 0-100
}

/**
 * CI Check Config
 * PR bot that runs tests, generates patch suggestions
 */
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

/**
 * Multi-Model Compare Config
 * Run same input across models, score via rubric
 */
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

/**
 * Agent Job Config
 * Bounded tasks (refactor, generate tests) run as jobs
 */
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

// Union type for all input configs
export type AutomationInputConfig =
  | BatchRunConfig
  | EvalPipelineConfig
  | CICheckConfig
  | MultiModelCompareConfig
  | AgentJobConfig;

/**
 * Output summary structure
 */
export interface AutomationOutputSummary {
  totalSteps: number;
  completedSteps: number;
  passedSteps?: number;
  failedSteps?: number;
  aggregateScore?: number;
  highlights?: string[];
  downloadUrl?: string;
}

// Credit costs by job type and tier
export const AUTOMATION_CREDIT_COSTS: Record<
  string,
  Record<'small' | 'medium' | 'large', number>
> = {
  batch_run: { small: 10, medium: 25, large: 50 },
  eval_pipeline: { small: 15, medium: 35, large: 75 },
  ci_check: { small: 20, medium: 45, large: 100 },
  multi_model_compare: { small: 25, medium: 50, large: 100 },
  agent_job: { small: 30, medium: 75, large: 150 },
};

// Time limits by tier (in minutes)
export const AUTOMATION_TIME_LIMITS: Record<'small' | 'medium' | 'large', number> = {
  small: 5,
  medium: 15,
  large: 30,
};

// Concurrency limits by tier
export const AUTOMATION_CONCURRENCY_LIMITS: Record<'small' | 'medium' | 'large', number> = {
  small: 2,
  medium: 5,
  large: 10,
};
