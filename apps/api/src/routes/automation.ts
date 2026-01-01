/**
 * Automation Services API Routes
 *
 * Phase 10: Credit redemption for automation services:
 * - POST /api/automation/jobs - Create new automation job
 * - GET /api/automation/jobs - List user's jobs
 * - GET /api/automation/jobs/:id - Get job details
 * - DELETE /api/automation/jobs/:id - Cancel job
 * - GET /api/automation/jobs/:id/results - Get job results
 * - POST /api/automation/jobs/:id/retry - Retry failed job
 *
 * Templates:
 * - GET /api/automation/templates - List templates
 * - POST /api/automation/templates - Create template
 * - PUT /api/automation/templates/:id - Update template
 * - DELETE /api/automation/templates/:id - Delete template
 *
 * Pricing:
 * - GET /api/automation/pricing - Get credit costs by job type/tier
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  automationJobs,
  automationJobResults,
  automationTemplates,
  AUTOMATION_CREDIT_COSTS,
  AUTOMATION_TIME_LIMITS,
  AUTOMATION_CONCURRENCY_LIMITS,
  AutomationInputConfig,
} from '../db/schema/automation';
import { creditAccounts, creditHolds } from '../db/schema/credits';
import { addAutomationJob, cancelAutomationJob } from '../lib/queue';
import { logger } from '../lib/logger';

// Input validation schemas
const jobTypeSchema = z.enum([
  'batch_run',
  'eval_pipeline',
  'ci_check',
  'multi_model_compare',
  'agent_job',
]);

const tierSchema = z.enum(['small', 'medium', 'large']);

const batchRunConfigSchema = z.object({
  type: z.literal('batch_run'),
  prompts: z.array(z.object({
    id: z.string(),
    content: z.string().min(1).max(10000),
    parameters: z.record(z.unknown()).optional(),
  })).min(1).max(100),
  model: z.string().min(1),
  maxConcurrency: z.number().int().min(1).max(10).optional(),
  outputFormat: z.enum(['json', 'csv', 'markdown']).optional(),
});

const evalPipelineConfigSchema = z.object({
  type: z.literal('eval_pipeline'),
  testCases: z.array(z.object({
    id: z.string(),
    input: z.string().min(1).max(10000),
    expectedOutput: z.string().max(10000).optional(),
    rubric: z.string().max(5000).optional(),
  })).min(1).max(50),
  model: z.string().min(1),
  baseline: z.object({
    version: z.string(),
    results: z.record(z.string()),
  }).optional(),
  passThreshold: z.number().int().min(0).max(100).optional(),
});

const ciCheckConfigSchema = z.object({
  type: z.literal('ci_check'),
  repository: z.string().min(1),
  branch: z.string().min(1),
  commitSha: z.string().optional(),
  pullRequestNumber: z.number().int().optional(),
  checks: z.array(z.enum(['lint', 'typecheck', 'test', 'security', 'performance'])).min(1),
  generateFixes: z.boolean().optional(),
  postComment: z.boolean().optional(),
});

const multiModelCompareConfigSchema = z.object({
  type: z.literal('multi_model_compare'),
  prompt: z.string().min(1).max(10000),
  models: z.array(z.string()).min(2).max(5),
  rubric: z.object({
    criteria: z.array(z.object({
      name: z.string(),
      weight: z.number(),
      description: z.string(),
    })),
  }).optional(),
  outputFormat: z.enum(['json', 'markdown', 'table']).optional(),
});

const agentJobConfigSchema = z.object({
  type: z.literal('agent_job'),
  taskType: z.enum(['refactor', 'generate_tests', 'documentation', 'code_review', 'custom']),
  targetFiles: z.array(z.string()).optional(),
  repository: z.string().optional(),
  instructions: z.string().min(1).max(5000),
  constraints: z.object({
    maxFiles: z.number().int().optional(),
    maxChangesPerFile: z.number().int().optional(),
    allowedFileTypes: z.array(z.string()).optional(),
  }).optional(),
  outputFormat: z.enum(['patch', 'files', 'report']).optional(),
});

const createJobSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  jobType: jobTypeSchema,
  tier: tierSchema,
  config: z.discriminatedUnion('type', [
    batchRunConfigSchema,
    evalPipelineConfigSchema,
    ciCheckConfigSchema,
    multiModelCompareConfigSchema,
    agentJobConfigSchema,
  ]),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  jobType: jobTypeSchema,
  defaultTier: tierSchema.optional(),
  defaultConfig: z.discriminatedUnion('type', [
    batchRunConfigSchema,
    evalPipelineConfigSchema,
    ciCheckConfigSchema,
    multiModelCompareConfigSchema,
    agentJobConfigSchema,
  ]),
  isPublic: z.boolean().optional(),
});

const listJobsQuerySchema = z.object({
  status: z.enum(['pending', 'queued', 'running', 'completed', 'failed', 'cancelled', 'timeout']).optional(),
  jobType: jobTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function automationRoutes(app: FastifyInstance) {
  // ============================================================
  // Pricing endpoint (public)
  // ============================================================

  app.get('/api/automation/pricing', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      creditCosts: AUTOMATION_CREDIT_COSTS,
      timeLimits: AUTOMATION_TIME_LIMITS,
      concurrencyLimits: AUTOMATION_CONCURRENCY_LIMITS,
      jobTypes: [
        {
          type: 'batch_run',
          name: 'Batch Runs',
          description: 'Run N prompts/jobs in parallel with parameter sweeps.',
        },
        {
          type: 'eval_pipeline',
          name: 'Evaluation Pipelines',
          description: 'Prompt regression tests comparing outputs vs baselines using judge rubric.',
        },
        {
          type: 'ci_check',
          name: 'CI Checks',
          description: 'PR bot that runs tests, generates patch suggestions, and writes reports.',
        },
        {
          type: 'multi_model_compare',
          name: 'Multi-Model Comparison',
          description: 'Run same input across models, score via rubric, and rank outputs.',
        },
        {
          type: 'agent_job',
          name: 'Agent Jobs',
          description: 'Bounded tasks (refactor, generate tests) run as jobs with limits and logs.',
        },
      ],
      tiers: [
        {
          tier: 'small',
          name: 'Small',
          description: 'Basic jobs with lower limits. Good for quick tasks.',
        },
        {
          tier: 'medium',
          name: 'Medium',
          description: 'Standard jobs with moderate limits. Balanced performance.',
        },
        {
          tier: 'large',
          name: 'Large',
          description: 'Extended limits and priority processing. For complex tasks.',
        },
      ],
    });
  });

  // ============================================================
  // Job management endpoints (authenticated)
  // ============================================================

  // Create new automation job
  app.post('/api/automation/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parseResult = createJobSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parseResult.error.issues,
      });
    }

    const { name, description, jobType, tier, config } = parseResult.data;

    // Calculate credit cost
    const creditsCost = AUTOMATION_CREDIT_COSTS[jobType][tier];

    // Check user's credit balance
    const [account] = await db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId));

    if (!account || account.balanceAvailable < creditsCost) {
      return reply.status(402).send({
        error: 'Insufficient credits',
        required: creditsCost,
        available: account?.balanceAvailable ?? 0,
      });
    }

    // Create credit hold
    const [hold] = await db.insert(creditHolds).values({
      accountId: account.id,
      amountReserved: creditsCost,
      status: 'active',
      reason: `Automation job: ${jobType}`,
    }).returning();

    // Update account balance
    await db
      .update(creditAccounts)
      .set({
        balanceAvailable: sql`${creditAccounts.balanceAvailable} - ${creditsCost}`,
        balanceReserved: sql`${creditAccounts.balanceReserved} + ${creditsCost}`,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, account.id));

    // Calculate expiration (retention limits)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (tier === 'large' ? 90 : tier === 'medium' ? 30 : 14));

    // Create job record
    const [job] = await db.insert(automationJobs).values({
      userId,
      jobType,
      tier,
      name,
      description,
      status: 'pending',
      inputConfig: config as AutomationInputConfig,
      creditsCost,
      creditsHoldId: hold.id,
      expiresAt,
    }).returning();

    // Queue the job
    try {
      await addAutomationJob({
        jobId: job.id,
        userId,
        jobType,
        tier,
        config: config as Record<string, unknown>,
      });

      // Update status to queued
      await db
        .update(automationJobs)
        .set({ status: 'queued', queuedAt: new Date(), updatedAt: new Date() })
        .where(eq(automationJobs.id, job.id));

      logger.info({ jobId: job.id, jobType, tier, creditsCost }, 'Automation job created and queued');

      return reply.status(201).send({
        id: job.id,
        name: job.name,
        jobType: job.jobType,
        tier: job.tier,
        status: 'queued',
        creditsCost,
        createdAt: job.createdAt,
        expiresAt: job.expiresAt,
      });
    } catch (error) {
      // If queue fails, release the hold
      await db
        .update(creditHolds)
        .set({ status: 'released', releasedAt: new Date() })
        .where(eq(creditHolds.id, hold.id));

      await db
        .update(creditAccounts)
        .set({
          balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${creditsCost}`,
          balanceReserved: sql`${creditAccounts.balanceReserved} - ${creditsCost}`,
          updatedAt: new Date(),
        })
        .where(eq(creditAccounts.id, account.id));

      await db.delete(automationJobs).where(eq(automationJobs.id, job.id));

      logger.error({ error, jobId: job.id }, 'Failed to queue automation job');
      return reply.status(500).send({ error: 'Failed to create job' });
    }
  });

  // List user's jobs
  app.get('/api/automation/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parseResult = listJobsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parseResult.error.issues,
      });
    }

    const { status, jobType, limit, offset } = parseResult.data;

    const conditions = [eq(automationJobs.userId, userId)];
    if (status) {
      conditions.push(eq(automationJobs.status, status));
    }
    if (jobType) {
      conditions.push(eq(automationJobs.jobType, jobType));
    }

    const jobs = await db
      .select({
        id: automationJobs.id,
        name: automationJobs.name,
        jobType: automationJobs.jobType,
        tier: automationJobs.tier,
        status: automationJobs.status,
        progress: automationJobs.progress,
        creditsCost: automationJobs.creditsCost,
        createdAt: automationJobs.createdAt,
        completedAt: automationJobs.completedAt,
        outputSummary: automationJobs.outputSummary,
      })
      .from(automationJobs)
      .where(and(...conditions))
      .orderBy(desc(automationJobs.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(automationJobs)
      .where(and(...conditions));

    return reply.send({
      jobs,
      total: countResult?.count ?? 0,
      limit,
      offset,
    });
  });

  // Get job details
  app.get('/api/automation/jobs/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };

    const [job] = await db
      .select()
      .from(automationJobs)
      .where(and(eq(automationJobs.id, id), eq(automationJobs.userId, userId)));

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return reply.send(job);
  });

  // Cancel job
  app.delete('/api/automation/jobs/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };

    const [job] = await db
      .select()
      .from(automationJobs)
      .where(and(eq(automationJobs.id, id), eq(automationJobs.userId, userId)));

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if (!['pending', 'queued'].includes(job.status)) {
      return reply.status(400).send({
        error: 'Cannot cancel job',
        message: `Job is already ${job.status}`,
      });
    }

    // Cancel in queue
    await cancelAutomationJob(id);

    // Update status
    await db
      .update(automationJobs)
      .set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(automationJobs.id, id));

    // Release credit hold
    if (job.creditsHoldId) {
      const [hold] = await db
        .select()
        .from(creditHolds)
        .where(eq(creditHolds.id, job.creditsHoldId));

      if (hold && hold.status === 'active') {
        await db
          .update(creditHolds)
          .set({ status: 'released', releasedAt: new Date() })
          .where(eq(creditHolds.id, hold.id));

        await db
          .update(creditAccounts)
          .set({
            balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${hold.amountReserved}`,
            balanceReserved: sql`${creditAccounts.balanceReserved} - ${hold.amountReserved}`,
            updatedAt: new Date(),
          })
          .where(eq(creditAccounts.id, hold.accountId));
      }
    }

    logger.info({ jobId: id }, 'Automation job cancelled');

    return reply.send({ success: true, message: 'Job cancelled' });
  });

  // Get job results
  app.get('/api/automation/jobs/:id/results', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };

    const [job] = await db
      .select()
      .from(automationJobs)
      .where(and(eq(automationJobs.id, id), eq(automationJobs.userId, userId)));

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    const results = await db
      .select()
      .from(automationJobResults)
      .where(eq(automationJobResults.jobId, id))
      .orderBy(automationJobResults.stepIndex);

    return reply.send({
      job: {
        id: job.id,
        name: job.name,
        jobType: job.jobType,
        status: job.status,
        outputSummary: job.outputSummary,
        executionTimeMs: job.executionTimeMs,
        errorMessage: job.errorMessage,
      },
      results,
    });
  });

  // Retry failed job
  app.post('/api/automation/jobs/:id/retry', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };

    const [job] = await db
      .select()
      .from(automationJobs)
      .where(and(eq(automationJobs.id, id), eq(automationJobs.userId, userId)));

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if (!['failed', 'timeout'].includes(job.status)) {
      return reply.status(400).send({
        error: 'Cannot retry job',
        message: `Job status is ${job.status}, only failed or timeout jobs can be retried`,
      });
    }

    // Check credit balance for retry
    const [account] = await db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId));

    if (!account || account.balanceAvailable < job.creditsCost) {
      return reply.status(402).send({
        error: 'Insufficient credits for retry',
        required: job.creditsCost,
        available: account?.balanceAvailable ?? 0,
      });
    }

    // Create new credit hold for retry
    const [hold] = await db.insert(creditHolds).values({
      accountId: account.id,
      amountReserved: job.creditsCost,
      status: 'active',
      reason: `Automation job retry: ${job.jobType}`,
    }).returning();

    await db
      .update(creditAccounts)
      .set({
        balanceAvailable: sql`${creditAccounts.balanceAvailable} - ${job.creditsCost}`,
        balanceReserved: sql`${creditAccounts.balanceReserved} + ${job.creditsCost}`,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, account.id));

    // Clear old results
    await db.delete(automationJobResults).where(eq(automationJobResults.jobId, id));

    // Reset job status
    await db
      .update(automationJobs)
      .set({
        status: 'pending',
        progress: 0,
        creditsHoldId: hold.id,
        queuedAt: null,
        startedAt: null,
        completedAt: null,
        outputSummary: null,
        errorMessage: null,
        executionTimeMs: null,
        updatedAt: new Date(),
      })
      .where(eq(automationJobs.id, id));

    // Re-queue the job
    await addAutomationJob({
      jobId: job.id,
      userId,
      jobType: job.jobType,
      tier: job.tier,
      config: job.inputConfig as Record<string, unknown>,
    });

    await db
      .update(automationJobs)
      .set({ status: 'queued', queuedAt: new Date(), updatedAt: new Date() })
      .where(eq(automationJobs.id, id));

    logger.info({ jobId: id }, 'Automation job retried');

    return reply.send({ success: true, message: 'Job queued for retry' });
  });

  // ============================================================
  // Template management endpoints
  // ============================================================

  // List templates
  app.get('/api/automation/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;

    const query = request.query as { public?: string; jobType?: string };

    const conditions = [];
    if (userId) {
      // Show user's templates and public templates
      conditions.push(
        sql`(${automationTemplates.userId} = ${userId} OR ${automationTemplates.isPublic} = true)`
      );
    } else {
      // Only show public templates
      conditions.push(eq(automationTemplates.isPublic, true));
    }

    if (query.jobType) {
      conditions.push(eq(automationTemplates.jobType, query.jobType as any));
    }

    const templates = await db
      .select()
      .from(automationTemplates)
      .where(and(...conditions))
      .orderBy(desc(automationTemplates.usageCount));

    return reply.send({ templates });
  });

  // Create template
  app.post('/api/automation/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parseResult = createTemplateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parseResult.error.issues,
      });
    }

    const { name, description, jobType, defaultTier, defaultConfig, isPublic } = parseResult.data;

    const [template] = await db.insert(automationTemplates).values({
      userId,
      name,
      description,
      jobType,
      defaultTier: defaultTier ?? 'small',
      defaultConfig: defaultConfig as AutomationInputConfig,
      isPublic: isPublic ?? false,
    }).returning();

    logger.info({ templateId: template.id, userId }, 'Automation template created');

    return reply.status(201).send(template);
  });

  // Update template
  app.put('/api/automation/templates/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(automationTemplates)
      .where(and(eq(automationTemplates.id, id), eq(automationTemplates.userId, userId)));

    if (!existing) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    const parseResult = createTemplateSchema.partial().safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parseResult.error.issues,
      });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parseResult.data.name) updates.name = parseResult.data.name;
    if (parseResult.data.description !== undefined) updates.description = parseResult.data.description;
    if (parseResult.data.defaultTier) updates.defaultTier = parseResult.data.defaultTier;
    if (parseResult.data.defaultConfig) updates.defaultConfig = parseResult.data.defaultConfig;
    if (parseResult.data.isPublic !== undefined) updates.isPublic = parseResult.data.isPublic;

    const [template] = await db
      .update(automationTemplates)
      .set(updates)
      .where(eq(automationTemplates.id, id))
      .returning();

    return reply.send(template);
  });

  // Delete template
  app.delete('/api/automation/templates/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(automationTemplates)
      .where(and(eq(automationTemplates.id, id), eq(automationTemplates.userId, userId)));

    if (!existing) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    await db.delete(automationTemplates).where(eq(automationTemplates.id, id));

    return reply.send({ success: true });
  });
}
