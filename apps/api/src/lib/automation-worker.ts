/**
 * Automation Job Processing Worker
 *
 * Processes automation service jobs from BullMQ queue:
 * - Batch Runs: Run N prompts/jobs in parallel with parameter sweeps
 * - Evaluation Pipelines: Prompt regression tests comparing outputs vs baselines
 * - CI Checks: PR bot that runs tests, generates patch suggestions
 * - Multi-Model Comparison: Run same input across models, score via rubric
 * - Agent Jobs: Bounded tasks (refactor, generate tests) with limits
 *
 * Phase 10: Automation Services
 */

import { Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';

import { db } from '../db';
import {
  automationJobs,
  automationJobResults,
  AutomationInputConfig,
} from '../db/schema/automation';
import { creditAccounts, creditHolds, creditLedgerEntries } from '../db/schema/credits';

import {
  createAutomationWorker,
  AutomationJobData,
  AutomationJobResult,
} from './queue';
import { logger } from './logger';

// Job type processors
type JobProcessor = (
  job: Job<AutomationJobData>,
  config: AutomationInputConfig
) => Promise<{
  results: StepResult[];
  summary: string;
  aggregateScore?: number;
}>;

interface StepResult {
  stepIndex: number;
  stepName: string;
  input: string;
  output: string;
  score?: number;
  passed?: boolean;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * Process Batch Run job
 * Runs N prompts in parallel with parameter sweeps
 */
async function processBatchRun(
  job: Job<AutomationJobData>,
  config: AutomationInputConfig
): Promise<{ results: StepResult[]; summary: string; aggregateScore?: number }> {
  if (config.type !== 'batch_run') {
    throw new Error('Invalid config type for batch run');
  }

  const { prompts, model, maxConcurrency = 3, outputFormat = 'json' } = config;
  const results: StepResult[] = [];
  const totalPrompts = prompts.length;

  logger.info({ jobId: job.data.jobId, totalPrompts, model }, 'Starting batch run');

  // Process prompts in batches based on concurrency
  for (let i = 0; i < prompts.length; i += maxConcurrency) {
    const batch = prompts.slice(i, i + maxConcurrency);

    const batchResults = await Promise.all(
      batch.map(async (prompt, batchIndex) => {
        const stepIndex = i + batchIndex;
        const startTime = Date.now();

        // Simulate LLM call (in production, this would call actual model APIs)
        const simulatedOutput = await simulateLLMCall(prompt.content, model);

        return {
          stepIndex,
          stepName: `Prompt ${stepIndex + 1}: ${prompt.id}`,
          input: prompt.content,
          output: simulatedOutput,
          durationMs: Date.now() - startTime,
          metadata: prompt.parameters,
        };
      })
    );

    results.push(...batchResults);

    // Update progress
    const progress = Math.round(((i + batch.length) / totalPrompts) * 100);
    await job.updateProgress(progress);
  }

  const summary = `Completed ${results.length} prompts using ${model}. Output format: ${outputFormat}`;

  return { results, summary };
}

/**
 * Process Evaluation Pipeline job
 * Runs prompt regression tests comparing outputs vs baselines
 */
async function processEvalPipeline(
  job: Job<AutomationJobData>,
  config: AutomationInputConfig
): Promise<{ results: StepResult[]; summary: string; aggregateScore?: number }> {
  if (config.type !== 'eval_pipeline') {
    throw new Error('Invalid config type for eval pipeline');
  }

  const { testCases, model, baseline, passThreshold = 70 } = config;
  const results: StepResult[] = [];
  let totalScore = 0;
  let passedCount = 0;

  logger.info({ jobId: job.data.jobId, testCases: testCases.length, model }, 'Starting eval pipeline');

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const startTime = Date.now();

    // Simulate LLM call
    const output = await simulateLLMCall(testCase.input, model);

    // Score the output (compare against expected or rubric)
    let score = 0;
    let passed = false;

    if (testCase.expectedOutput) {
      // Simple similarity scoring (in production, use semantic similarity)
      score = calculateSimilarity(output, testCase.expectedOutput);
      passed = score >= passThreshold;
    } else if (testCase.rubric) {
      // Rubric-based scoring
      score = scoreAgainstRubric(output, testCase.rubric);
      passed = score >= passThreshold;
    } else {
      // Default: random score for simulation
      score = Math.round(Math.random() * 40 + 60);
      passed = score >= passThreshold;
    }

    totalScore += score;
    if (passed) passedCount++;

    // Compare with baseline if provided
    let baselineComparison: string | undefined;
    if (baseline?.results[testCase.id]) {
      const baselineOutput = baseline.results[testCase.id];
      const baselineScore = calculateSimilarity(output, baselineOutput);
      baselineComparison = `Baseline match: ${baselineScore}%`;
    }

    results.push({
      stepIndex: i,
      stepName: `Test Case: ${testCase.id}`,
      input: testCase.input,
      output,
      score,
      passed,
      durationMs: Date.now() - startTime,
      metadata: baselineComparison ? { baselineComparison } : undefined,
    });

    await job.updateProgress(Math.round(((i + 1) / testCases.length) * 100));
  }

  const aggregateScore = Math.round(totalScore / testCases.length);
  const passRate = Math.round((passedCount / testCases.length) * 100);
  const summary = `Eval complete: ${passedCount}/${testCases.length} passed (${passRate}%). Average score: ${aggregateScore}/100`;

  return { results, summary, aggregateScore };
}

/**
 * Process CI Check job
 * Runs lint, typecheck, test, security, and performance checks
 */
async function processCICheck(
  job: Job<AutomationJobData>,
  config: AutomationInputConfig
): Promise<{ results: StepResult[]; summary: string; aggregateScore?: number }> {
  if (config.type !== 'ci_check') {
    throw new Error('Invalid config type for CI check');
  }

  const { repository, branch, commitSha, checks, generateFixes = false } = config;
  const results: StepResult[] = [];
  let passedCount = 0;

  logger.info({ jobId: job.data.jobId, repository, branch, checks }, 'Starting CI checks');

  const checkImplementations: Record<string, () => Promise<{ output: string; passed: boolean; fixes?: string }>> = {
    lint: async () => {
      // Simulate lint check
      const issues = Math.floor(Math.random() * 10);
      return {
        output: issues === 0 ? 'No lint issues found' : `Found ${issues} lint issues`,
        passed: issues < 3,
        fixes: generateFixes && issues > 0 ? `// Auto-fix for ${issues} issues` : undefined,
      };
    },
    typecheck: async () => {
      // Simulate typecheck
      const errors = Math.floor(Math.random() * 5);
      return {
        output: errors === 0 ? 'TypeScript compilation successful' : `${errors} type errors found`,
        passed: errors === 0,
      };
    },
    test: async () => {
      // Simulate test run
      const total = 50;
      const passed = Math.floor(Math.random() * 10) + 40;
      return {
        output: `Tests: ${passed}/${total} passed, ${total - passed} failed`,
        passed: passed === total,
      };
    },
    security: async () => {
      // Simulate security scan
      const vulns = Math.floor(Math.random() * 3);
      return {
        output: vulns === 0 ? 'No vulnerabilities found' : `${vulns} vulnerabilities detected`,
        passed: vulns === 0,
      };
    },
    performance: async () => {
      // Simulate Lighthouse-style performance check
      const score = Math.floor(Math.random() * 30) + 70;
      return {
        output: `Performance score: ${score}/100`,
        passed: score >= 70,
      };
    },
  };

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const startTime = Date.now();

    const impl = checkImplementations[check];
    if (!impl) {
      results.push({
        stepIndex: i,
        stepName: `Check: ${check}`,
        input: `${repository}@${branch}`,
        output: `Unknown check type: ${check}`,
        passed: false,
        durationMs: Date.now() - startTime,
      });
      continue;
    }

    const { output, passed, fixes } = await impl();
    if (passed) passedCount++;

    results.push({
      stepIndex: i,
      stepName: `Check: ${check}`,
      input: `${repository}@${branch}${commitSha ? ` (${commitSha.slice(0, 7)})` : ''}`,
      output,
      passed,
      durationMs: Date.now() - startTime,
      metadata: fixes ? { suggestedFixes: fixes } : undefined,
    });

    await job.updateProgress(Math.round(((i + 1) / checks.length) * 100));
  }

  const allPassed = passedCount === checks.length;
  const aggregateScore = Math.round((passedCount / checks.length) * 100);
  const summary = `CI checks: ${passedCount}/${checks.length} passed. ${allPassed ? 'All checks passed!' : 'Some checks failed.'}`;

  return { results, summary, aggregateScore };
}

/**
 * Process Multi-Model Comparison job
 * Runs same input across multiple models and compares outputs
 */
async function processMultiModelCompare(
  job: Job<AutomationJobData>,
  config: AutomationInputConfig
): Promise<{ results: StepResult[]; summary: string; aggregateScore?: number }> {
  if (config.type !== 'multi_model_compare') {
    throw new Error('Invalid config type for multi-model compare');
  }

  const { prompt, models, rubric, outputFormat = 'markdown' } = config;
  const results: StepResult[] = [];
  const modelScores: { model: string; score: number }[] = [];

  logger.info({ jobId: job.data.jobId, models, prompt: prompt.slice(0, 50) }, 'Starting multi-model comparison');

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const startTime = Date.now();

    // Simulate LLM call for each model
    const output = await simulateLLMCall(prompt, model);

    // Score based on rubric or default criteria
    let score = Math.round(Math.random() * 30 + 70); // Base score 70-100
    if (rubric?.criteria) {
      score = scoreWithRubricCriteria(output, rubric.criteria);
    }

    modelScores.push({ model, score });

    results.push({
      stepIndex: i,
      stepName: `Model: ${model}`,
      input: prompt,
      output,
      score,
      durationMs: Date.now() - startTime,
      metadata: { model, rubricApplied: !!rubric },
    });

    await job.updateProgress(Math.round(((i + 1) / models.length) * 100));
  }

  // Rank models by score
  modelScores.sort((a, b) => b.score - a.score);
  const winner = modelScores[0];
  const aggregateScore = winner.score;

  const ranking = modelScores.map((m, i) => `${i + 1}. ${m.model}: ${m.score}/100`).join(', ');
  const summary = `Model comparison complete. Winner: ${winner.model} (${winner.score}/100). Ranking: ${ranking}`;

  return { results, summary, aggregateScore };
}

/**
 * Process Agent Job
 * Runs bounded tasks like refactoring, test generation, etc.
 */
async function processAgentJob(
  job: Job<AutomationJobData>,
  config: AutomationInputConfig
): Promise<{ results: StepResult[]; summary: string; aggregateScore?: number }> {
  if (config.type !== 'agent_job') {
    throw new Error('Invalid config type for agent job');
  }

  const { taskType, instructions, targetFiles = [], constraints = {} } = config;
  const results: StepResult[] = [];

  logger.info({ jobId: job.data.jobId, taskType, targetFiles: targetFiles.length }, 'Starting agent job');

  // Simulate agent workflow steps
  const steps = [
    { name: 'Analyze codebase', description: 'Understanding project structure' },
    { name: 'Plan changes', description: 'Determining required modifications' },
    { name: 'Execute task', description: `Running ${taskType} operation` },
    { name: 'Validate results', description: 'Verifying changes meet requirements' },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const startTime = Date.now();

    // Simulate step execution
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    const output = generateAgentStepOutput(step.name, taskType, instructions, targetFiles);

    results.push({
      stepIndex: i,
      stepName: step.name,
      input: step.description,
      output,
      passed: true,
      durationMs: Date.now() - startTime,
      metadata: {
        taskType,
        filesProcessed: targetFiles.length || 'all',
        constraints,
      },
    });

    await job.updateProgress(Math.round(((i + 1) / steps.length) * 100));
  }

  const filesProcessed = targetFiles.length || 'multiple';
  const summary = `Agent job (${taskType}) completed. Processed ${filesProcessed} files. Instructions: "${instructions.slice(0, 50)}..."`;

  return { results, summary, aggregateScore: 100 };
}

/**
 * Helper: Simulate LLM call
 */
async function simulateLLMCall(prompt: string, model: string): Promise<string> {
  // In production, this would call actual model APIs (OpenAI, Anthropic, etc.)
  await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150));

  const responses = [
    `[${model}] Response to: "${prompt.slice(0, 30)}..."`,
    `Here's my analysis based on the input. Key points include proper handling of edge cases and optimal performance considerations.`,
    `The solution implements best practices for ${prompt.includes('test') ? 'testing' : 'implementation'} while maintaining clean code principles.`,
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Helper: Calculate text similarity (simplified)
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return Math.round((intersection.size / union.size) * 100);
}

/**
 * Helper: Score against rubric text
 */
function scoreAgainstRubric(output: string, rubric: string): number {
  // Simplified rubric scoring
  const keywords = rubric.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const outputLower = output.toLowerCase();
  const matches = keywords.filter((k) => outputLower.includes(k)).length;
  return Math.min(100, Math.round((matches / Math.max(keywords.length, 1)) * 100) + 50);
}

/**
 * Helper: Score with rubric criteria
 */
function scoreWithRubricCriteria(
  output: string,
  criteria: Array<{ name: string; weight: number; description: string }>
): number {
  let totalWeight = 0;
  let weightedScore = 0;

  for (const criterion of criteria) {
    totalWeight += criterion.weight;
    // Simplified: check if output mentions criterion keywords
    const keywords = criterion.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const outputLower = output.toLowerCase();
    const matches = keywords.filter((k) => outputLower.includes(k)).length;
    const criterionScore = Math.min(100, (matches / Math.max(keywords.length, 1)) * 100 + 60);
    weightedScore += criterionScore * criterion.weight;
  }

  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 75;
}

/**
 * Helper: Generate agent step output
 */
function generateAgentStepOutput(
  stepName: string,
  taskType: string,
  instructions: string,
  targetFiles: string[]
): string {
  const outputs: Record<string, string> = {
    'Analyze codebase': `Analyzed ${targetFiles.length || 'all'} files. Found ${Math.floor(Math.random() * 10) + 5} relevant code sections for ${taskType}.`,
    'Plan changes': `Planned ${Math.floor(Math.random() * 5) + 2} modifications based on: "${instructions.slice(0, 50)}..."`,
    'Execute task': `Executed ${taskType} task. Modified ${Math.floor(Math.random() * 3) + 1} files with ${Math.floor(Math.random() * 20) + 10} line changes.`,
    'Validate results': `Validation complete. All changes pass quality checks. Ready for review.`,
  };
  return outputs[stepName] || `Completed ${stepName}`;
}

/**
 * Job type to processor mapping
 */
const JOB_PROCESSORS: Record<string, JobProcessor> = {
  batch_run: processBatchRun,
  eval_pipeline: processEvalPipeline,
  ci_check: processCICheck,
  multi_model_compare: processMultiModelCompare,
  agent_job: processAgentJob,
};

/**
 * Main automation job processor
 */
export async function processAutomationJob(
  job: Job<AutomationJobData>
): Promise<AutomationJobResult> {
  const { jobId, userId, jobType, tier, config } = job.data;
  const startTime = Date.now();

  logger.info({ jobId, userId, jobType, tier }, 'Processing automation job');

  // Update job status to running
  await db
    .update(automationJobs)
    .set({
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(automationJobs.id, jobId));

  try {
    // Get the processor for this job type
    const processor = JOB_PROCESSORS[jobType];
    if (!processor) {
      throw new Error(`Unknown job type: ${jobType}`);
    }

    // Process the job
    const { results, summary, aggregateScore } = await processor(
      job,
      config as AutomationInputConfig
    );

    const executionTimeMs = Date.now() - startTime;

    // Store results
    for (const result of results) {
      await db.insert(automationJobResults).values({
        jobId,
        stepIndex: result.stepIndex,
        stepName: result.stepName,
        inputData: { content: result.input },
        outputData: { content: result.output, metadata: result.metadata },
        score: result.score,
        passed: result.passed,
        executionTimeMs: result.durationMs,
      });
    }

    // Calculate summary stats
    const passedSteps = results.filter((r) => r.passed === true).length;
    const failedSteps = results.filter((r) => r.passed === false).length;

    // Update job as completed
    await db
      .update(automationJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        progress: 100,
        outputSummary: summary,
        executionTimeMs,
        updatedAt: new Date(),
      })
      .where(eq(automationJobs.id, jobId));

    // Consume the credit hold
    await consumeCreditHold(jobId);

    logger.info(
      { jobId, executionTimeMs, passedSteps, failedSteps, aggregateScore },
      'Automation job completed successfully'
    );

    return {
      jobId,
      status: 'completed',
      totalSteps: results.length,
      completedSteps: results.length,
      passedSteps,
      failedSteps,
      aggregateScore,
      executionTimeMs,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error({ jobId, error: errorMessage }, 'Automation job failed');

    // Update job as failed
    await db
      .update(automationJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage,
        executionTimeMs,
        updatedAt: new Date(),
      })
      .where(eq(automationJobs.id, jobId));

    // Release credit hold on failure (partial refund)
    await releaseCreditHold(jobId);

    return {
      jobId,
      status: 'failed',
      totalSteps: 0,
      completedSteps: 0,
      executionTimeMs,
      errorMessage,
    };
  }
}

/**
 * Consume credit hold after successful job completion
 */
async function consumeCreditHold(jobId: string): Promise<void> {
  const [job] = await db
    .select({
      creditsHoldId: automationJobs.creditsHoldId,
      creditsCost: automationJobs.creditsCost,
      userId: automationJobs.userId,
    })
    .from(automationJobs)
    .where(eq(automationJobs.id, jobId));

  if (!job?.creditsHoldId) return;

  const [hold] = await db
    .select()
    .from(creditHolds)
    .where(eq(creditHolds.id, job.creditsHoldId));

  if (!hold || hold.status !== 'active') return;

  // Mark hold as consumed
  await db
    .update(creditHolds)
    .set({ status: 'consumed', releasedAt: new Date() })
    .where(eq(creditHolds.id, hold.id));

  // Move credits from reserved to spent (reduce reserved balance)
  await db
    .update(creditAccounts)
    .set({
      balanceReserved: sql`${creditAccounts.balanceReserved} - ${hold.amountReserved}`,
      updatedAt: new Date(),
    })
    .where(eq(creditAccounts.id, hold.accountId));

  // Record ledger entry
  await db.insert(creditLedgerEntries).values({
    accountId: hold.accountId,
    type: 'redemption',
    amount: -hold.amountReserved,
    metadataJson: { automationJobId: jobId, reason: 'Job completed successfully' },
  });

  logger.info({ jobId, credits: hold.amountReserved }, 'Credit hold consumed');
}

/**
 * Release credit hold on job failure (refund)
 */
async function releaseCreditHold(jobId: string): Promise<void> {
  const [job] = await db
    .select({
      creditsHoldId: automationJobs.creditsHoldId,
      userId: automationJobs.userId,
    })
    .from(automationJobs)
    .where(eq(automationJobs.id, jobId));

  if (!job?.creditsHoldId) return;

  const [hold] = await db
    .select()
    .from(creditHolds)
    .where(eq(creditHolds.id, job.creditsHoldId));

  if (!hold || hold.status !== 'active') return;

  // Release hold
  await db
    .update(creditHolds)
    .set({ status: 'released', releasedAt: new Date() })
    .where(eq(creditHolds.id, hold.id));

  // Return credits to available balance
  await db
    .update(creditAccounts)
    .set({
      balanceAvailable: sql`${creditAccounts.balanceAvailable} + ${hold.amountReserved}`,
      balanceReserved: sql`${creditAccounts.balanceReserved} - ${hold.amountReserved}`,
      updatedAt: new Date(),
    })
    .where(eq(creditAccounts.id, hold.accountId));

  // Record ledger entry
  await db.insert(creditLedgerEntries).values({
    accountId: hold.accountId,
    type: 'refund',
    amount: hold.amountReserved,
    metadataJson: { automationJobId: jobId, reason: 'Job failed - credits refunded' },
  });

  logger.info({ jobId, credits: hold.amountReserved }, 'Credit hold released (refund)');
}

/**
 * Start the automation worker
 */
export function startAutomationWorker(): void {
  logger.info('Starting automation job worker...');
  createAutomationWorker(processAutomationJob);
  logger.info('Automation job worker started');
}
