/**
 * Judging Service
 *
 * Orchestrates the judging workflow:
 * 1. Receive judging job from BullMQ
 * 2. Download artifact from storage
 * 3. Create sandbox with challenge's judge image
 * 4. Execute build/test/lint commands
 * 5. Collect results and scores
 * 6. Store results in database
 * 7. Upload logs to storage
 *
 * Integrates:
 * - BullMQ for job processing
 * - Sandbox for isolated execution
 * - Storage for artifacts and logs
 * - Database for results
 */

import { Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

import { db } from '../db';
import {
  judgementRuns,
  scores,
  type JudgementRun,
} from '../db/schema/judging';
import { submissions, artifacts } from '../db/schema/submissions';
import { matches, matchParticipants } from '../db/schema/matches';
import { challengeVersions } from '../db/schema/challenges';

import {
  createJudgingWorker,
  JudgingJobData,
  JudgingJobResult,
} from './queue';

import {
  createSandbox,
  executeInSandbox,
  destroySandbox,
  DEFAULT_JUDGE_IMAGE,
  SANDBOX_DEFAULTS,
  SandboxConfig,
  ExecutionCommand,
  ExecutionResult,
  SandboxSession,
} from './sandbox';

import {
  downloadObject,
  uploadObject,
  BUCKETS,
} from './storage';

import {
  evaluateWithAIJudge,
  extractCodeContext,
  AIJudgeConfig,
  AIJudgeResult,
  AIJudgeRequirement,
  CriterionResult,
  AIJudgeRequirementResult,
  DEFAULT_AI_JUDGE_CONFIG,
} from './ai-judge';

// Rubric types
export interface RubricRequirement {
  id: string;
  name: string;
  weight: number;           // 0-100, must sum to 100
  type: 'automated' | 'ai_judge';
  checks: RubricCheck[];
  // AI Judge specific fields (for type: 'ai_judge')
  description?: string;
  criteria?: string[];
  evidenceTypes?: string[];
}

export interface RubricCheck {
  id: string;
  name: string;
  command: string;
  args?: string[];
  expectedExitCode?: number;  // Default: 0
  timeout?: number;           // Seconds, default: 60
  points: number;             // Points for this check
}

export interface Rubric {
  version: string;
  requirements: RubricRequirement[];
  buildCommand?: ExecutionCommand;
  installCommand?: ExecutionCommand;
  // AI Judge configuration
  aiJudge?: AIJudgeConfig;
}

// Check result
export interface CheckResult {
  checkId: string;
  name: string;
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  points: number;
  maxPoints: number;
}

// Requirement result
export interface RequirementResult {
  requirementId: string;
  name: string;
  checks: CheckResult[];
  score: number;
  maxScore: number;
  weight: number;
}

// Overall judging result
export interface JudgingResult {
  totalScore: number;
  maxScore: number;
  normalizedScore: number;    // 0-100 scale
  requirements: RequirementResult[];
  buildSuccess: boolean;
  logs: string[];
  durationMs: number;
  // AI Judge results
  aiJudgeResult?: AIJudgeResult;
}

/**
 * Parse rubric JSON from challenge version
 */
function parseRubric(rubricJson: unknown): Rubric {
  // In production, add proper validation with Zod
  const rubric = rubricJson as Rubric;

  // Validate weights sum to 100
  const totalWeight = rubric.requirements.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight !== 100) {
    console.warn(`Rubric weights sum to ${totalWeight}, expected 100`);
  }

  return rubric;
}

/**
 * Download artifact to temp directory
 */
async function downloadArtifactToTemp(
  storageKey: string
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-artifact-'));
  const artifactPath = path.join(tempDir, 'artifact.zip');

  // Download from storage
  const data = await downloadObject(BUCKETS.ARTIFACTS, storageKey);
  await fs.writeFile(artifactPath, data);

  // Extract artifact
  const extractDir = path.join(tempDir, 'content');
  await fs.mkdir(extractDir);

  // Use unzip command (could use a library like archiver in production)
  const { execSync } = await import('child_process');
  try {
    execSync(`unzip -q "${artifactPath}" -d "${extractDir}"`, {
      timeout: 30000,
    });
  } catch (error) {
    // If unzip fails, try using the raw content
    console.warn('Unzip failed, treating artifact as directory:', error);
    await fs.cp(artifactPath, path.join(extractDir, 'artifact'), { recursive: true });
  }

  return extractDir;
}

/**
 * Cleanup temp artifact directory
 */
async function cleanupTempArtifact(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to cleanup temp artifact:', error);
  }
}

/**
 * Run a single check in the sandbox
 */
async function runCheck(
  session: SandboxSession,
  check: RubricCheck
): Promise<CheckResult> {
  const result = await executeInSandbox(session, {
    command: check.command,
    args: check.args,
    timeout: check.timeout || 60,
  });

  const expectedExitCode = check.expectedExitCode ?? 0;
  const passed = result.exitCode === expectedExitCode && !result.timedOut;

  return {
    checkId: check.id,
    name: check.name,
    passed,
    exitCode: result.exitCode,
    stdout: result.stdout.slice(0, 10000), // Limit output size
    stderr: result.stderr.slice(0, 10000),
    durationMs: result.durationMs,
    points: passed ? check.points : 0,
    maxPoints: check.points,
  };
}

/**
 * Run all checks for a requirement
 */
async function runRequirement(
  session: SandboxSession,
  requirement: RubricRequirement
): Promise<RequirementResult> {
  const checkResults: CheckResult[] = [];
  let score = 0;
  let maxScore = 0;

  for (const check of requirement.checks) {
    const result = await runCheck(session, check);
    checkResults.push(result);
    score += result.points;
    maxScore += result.maxPoints;
  }

  return {
    requirementId: requirement.id,
    name: requirement.name,
    checks: checkResults,
    score,
    maxScore,
    weight: requirement.weight,
  };
}

/**
 * Read all files from artifact directory into a Map
 */
async function readArtifactFiles(artifactPath: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();

  async function readDir(dir: string, prefix: string = ''): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Skip common non-source directories
        if (['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
          continue;
        }
        await readDir(fullPath, relativePath);
      } else if (entry.isFile()) {
        try {
          // Only read text-like files up to 1MB
          const stats = await fs.stat(fullPath);
          if (stats.size < 1024 * 1024) {
            const content = await fs.readFile(fullPath);
            files.set(relativePath, content);
          }
        } catch (error) {
          // Skip files that can't be read
          console.warn(`Failed to read file ${fullPath}:`, error);
        }
      }
    }
  }

  await readDir(artifactPath);
  return files;
}

/**
 * Judge a submission against a rubric
 */
async function judgeSubmission(
  artifactPath: string,
  rubric: Rubric,
  judgeImage: string
): Promise<JudgingResult> {
  const startTime = Date.now();
  const logs: string[] = [];
  const requirementResults: RequirementResult[] = [];
  let buildSuccess = true;

  // Create sandbox with spec-compliant defaults (QUI-105)
  const config: SandboxConfig = {
    image: judgeImage || DEFAULT_JUDGE_IMAGE,
    cpuLimit: SANDBOX_DEFAULTS.cpuLimit,      // 2 CPU cores
    memoryLimit: SANDBOX_DEFAULTS.memoryLimit, // 4 GB RAM
    timeoutSeconds: SANDBOX_DEFAULTS.timeoutSeconds, // 10 minutes
    networkEnabled: SANDBOX_DEFAULTS.networkEnabled, // No network
  };

  const session = await createSandbox(artifactPath, config);

  try {
    // Copy artifact to workspace
    logs.push('[INFO] Copying artifact to workspace...');
    const copyResult = await executeInSandbox(session, {
      command: 'cp',
      args: ['-r', `${SANDBOX_DEFAULTS.artifactPath}/.`, SANDBOX_DEFAULTS.workdirPath],
    });

    if (copyResult.exitCode !== 0) {
      logs.push(`[ERROR] Failed to copy artifact: ${copyResult.stderr}`);
      throw new Error('Failed to copy artifact to workspace');
    }

    // Run install command if specified
    if (rubric.installCommand) {
      logs.push(`[INFO] Running install: ${rubric.installCommand.command}`);
      const installResult = await executeInSandbox(session, rubric.installCommand);

      if (installResult.exitCode !== 0) {
        logs.push(`[WARN] Install failed (exit ${installResult.exitCode})`);
        logs.push(installResult.stderr.slice(0, 1000));
      } else {
        logs.push('[INFO] Install completed successfully');
      }
    }

    // Run build command if specified
    if (rubric.buildCommand) {
      logs.push(`[INFO] Running build: ${rubric.buildCommand.command}`);
      const buildResult = await executeInSandbox(session, rubric.buildCommand);

      if (buildResult.exitCode !== 0) {
        buildSuccess = false;
        logs.push(`[ERROR] Build failed (exit ${buildResult.exitCode})`);
        logs.push(buildResult.stderr.slice(0, 2000));
      } else {
        logs.push('[INFO] Build completed successfully');
      }
    }

    // Run automated requirements (even if build failed - partial credit)
    for (const requirement of rubric.requirements) {
      if (requirement.type === 'automated') {
        logs.push(`[INFO] Running requirement: ${requirement.name}`);
        const result = await runRequirement(session, requirement);
        requirementResults.push(result);
        logs.push(`[INFO] Requirement ${requirement.name}: ${result.score}/${result.maxScore} points`);
      }
    }

    // Run AI judge for requirements with type: 'ai_judge'
    let aiJudgeResult: AIJudgeResult | undefined;
    const aiJudgeRequirements = rubric.requirements.filter(r => r.type === 'ai_judge');

    if (aiJudgeRequirements.length > 0 && rubric.aiJudge?.enabled) {
      logs.push('[INFO] Starting AI judge evaluation...');

      try {
        // Read artifact files for AI evaluation
        const artifactFiles = await readArtifactFiles(artifactPath);
        const codeContext = extractCodeContext(artifactFiles);

        // Convert requirements to AI judge format
        const aiRequirements: AIJudgeRequirement[] = aiJudgeRequirements.map(r => ({
          id: r.id,
          title: r.name,
          description: r.description || r.name,
          weight: r.weight,
          criteria: r.criteria || [],
          evidenceTypes: r.evidenceTypes || [],
        }));

        aiJudgeResult = await evaluateWithAIJudge(
          rubric.aiJudge || DEFAULT_AI_JUDGE_CONFIG,
          aiRequirements,
          codeContext
        );

        logs.push(`[INFO] AI judge evaluation complete: ${aiJudgeResult.totalScore}/${aiJudgeResult.maxScore}`);
        logs.push(`[INFO] AI judge summary: ${aiJudgeResult.summary}`);

        // Add AI judge results to requirement results
        for (const aiReq of aiJudgeResult.requirements) {
          requirementResults.push({
            requirementId: aiReq.requirementId,
            name: aiReq.title,
            checks: aiReq.criteria.map((c: CriterionResult) => ({
              checkId: c.criterion,
              name: c.criterion,
              passed: c.met,
              exitCode: c.met ? 0 : 1,
              stdout: c.reasoning,
              stderr: '',
              durationMs: 0,
              points: c.met ? c.score : 0,
              maxPoints: 100,
            })),
            score: aiReq.score,
            maxScore: 100,
            weight: aiReq.weight,
          });
        }
      } catch (error) {
        logs.push(`[ERROR] AI judge evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error('[Judging] AI judge error:', error);

        // Give 0 score for failed AI judge requirements
        for (const req of aiJudgeRequirements) {
          requirementResults.push({
            requirementId: req.id,
            name: req.name,
            checks: [],
            score: 0,
            maxScore: 100,
            weight: req.weight,
          });
        }
      }
    } else if (aiJudgeRequirements.length > 0) {
      logs.push('[INFO] AI judge requirements found but AI judge not enabled - skipping');

      // Give 0 score for requirements that need AI judge but it's not enabled
      for (const req of aiJudgeRequirements) {
        requirementResults.push({
          requirementId: req.id,
          name: req.name,
          checks: [],
          score: 0,
          maxScore: 100,
          weight: req.weight,
        });
      }
    }

    // Calculate scores
    let totalScore = 0;
    let maxScore = 0;

    for (const req of requirementResults) {
      // Weighted score contribution
      const normalizedReqScore = req.maxScore > 0 ? (req.score / req.maxScore) * req.weight : 0;
      totalScore += normalizedReqScore;
      maxScore += req.weight;
    }

    // Normalize to 0-100 scale
    const normalizedScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    logs.push(`[INFO] Final score: ${normalizedScore}/100`);

    return {
      totalScore: Math.round(totalScore),
      maxScore,
      normalizedScore,
      requirements: requirementResults,
      buildSuccess,
      logs,
      durationMs: Date.now() - startTime,
      aiJudgeResult,
    };
  } finally {
    await destroySandbox(session);
  }
}

/**
 * Upload judging logs to storage
 */
async function uploadJudgingLogs(
  matchId: string,
  judgementRunId: string,
  logs: string[]
): Promise<string> {
  const logContent = logs.join('\n');
  const logsKey = `logs/${matchId}/${judgementRunId}.txt`;

  await uploadObject(
    BUCKETS.LOGS,
    logsKey,
    Buffer.from(logContent),
    { contentType: 'text/plain' }
  );

  return logsKey;
}

/**
 * Process a judging job
 */
export async function processJudgingJob(
  job: Job<JudgingJobData>
): Promise<JudgingJobResult> {
  const { matchId, submissionId, artifactId, challengeId, rubricVersion } = job.data;

  console.log(`[Judging] Starting job ${job.id} for match ${matchId}`);

  // Create judgement run record
  const [judgementRun] = await db.insert(judgementRuns).values({
    matchId,
    status: 'running',
    judgeVersion: rubricVersion,
  }).returning();

  let tempArtifactPath: string | null = null;

  try {
    // Update job progress
    await job.updateProgress(10);

    // Get submission and artifact info
    const [submission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!submission) {
      throw new Error(`Submission not found: ${submissionId}`);
    }

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);

    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    await job.updateProgress(20);

    // Get challenge version for rubric and judge image
    const [match] = await db
      .select({
        challengeVersionId: matches.challengeVersionId,
      })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);

    if (!match) {
      throw new Error(`Match not found: ${matchId}`);
    }

    const [challengeVersion] = await db
      .select()
      .from(challengeVersions)
      .where(eq(challengeVersions.id, match.challengeVersionId))
      .limit(1);

    if (!challengeVersion) {
      throw new Error(`Challenge version not found: ${match.challengeVersionId}`);
    }

    await job.updateProgress(30);

    // Parse rubric
    const rubric = parseRubric(challengeVersion.rubricJson);

    // Download artifact
    tempArtifactPath = await downloadArtifactToTemp(artifact.storageKey);
    await job.updateProgress(50);

    // Run judging
    const judgeImage = challengeVersion.judgeImageRef || DEFAULT_JUDGE_IMAGE;
    const result = await judgeSubmission(tempArtifactPath, rubric, judgeImage);

    await job.updateProgress(80);

    // Upload logs
    const logsKey = await uploadJudgingLogs(matchId, judgementRun.id, result.logs);

    // Store score in database
    await db.insert(scores).values({
      judgementRunId: judgementRun.id,
      matchId,
      userId: submission.userId,
      totalScore: result.normalizedScore,
      breakdownJson: {
        requirements: result.requirements,
        buildSuccess: result.buildSuccess,
      },
      automatedResultsJson: {
        requirements: result.requirements
          .filter((r: RequirementResult) => !result.aiJudgeResult?.requirements.some((ai: AIJudgeRequirementResult) => ai.requirementId === r.requirementId))
          .map((r: RequirementResult) => ({
            id: r.requirementId,
            name: r.name,
            score: r.score,
            maxScore: r.maxScore,
            checks: r.checks.map((c) => ({
              id: c.checkId,
              name: c.name,
              passed: c.passed,
              points: c.points,
              maxPoints: c.maxPoints,
            })),
          })),
      },
      // Store AI judge results if available
      aiJudgeResultsJson: result.aiJudgeResult ? {
        requirements: result.aiJudgeResult.requirements.map((r: AIJudgeRequirementResult) => ({
          id: r.requirementId,
          title: r.title,
          score: r.score,
          weightedScore: r.weightedScore,
          weight: r.weight,
          overallReasoning: r.overallReasoning,
          confidence: r.confidence,
          criteria: r.criteria.map((c: CriterionResult) => ({
            criterion: c.criterion,
            met: c.met,
            score: c.score,
            reasoning: c.reasoning,
            evidence: c.evidence,
          })),
        })),
        totalScore: result.aiJudgeResult.totalScore,
        maxScore: result.aiJudgeResult.maxScore,
        summary: result.aiJudgeResult.summary,
        metadata: result.aiJudgeResult.metadata,
      } : null,
    });

    // Update judgement run as successful
    await db
      .update(judgementRuns)
      .set({
        status: 'success',
        completedAt: new Date(),
        logsKey,
      })
      .where(eq(judgementRuns.id, judgementRun.id));

    await job.updateProgress(100);

    console.log(`[Judging] Job ${job.id} completed successfully: ${result.normalizedScore}/100`);

    return {
      submissionId,
      score: result.normalizedScore,
      breakdown: result.requirements.reduce((acc, r) => {
        acc[r.requirementId] = r.score;
        return acc;
      }, {} as Record<string, number>),
      logs: result.logs,
      executionTimeMs: result.durationMs,
    };
  } catch (error) {
    console.error(`[Judging] Job ${job.id} failed:`, error);

    // Update judgement run as failed
    await db
      .update(judgementRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
      })
      .where(eq(judgementRuns.id, judgementRun.id));

    throw error;
  } finally {
    // Cleanup temp artifact
    if (tempArtifactPath) {
      await cleanupTempArtifact(path.dirname(tempArtifactPath));
    }
  }
}

/**
 * Start the judging worker
 */
export function startJudgingWorker(): void {
  console.log('[Judging] Starting judging worker...');
  createJudgingWorker(processJudgingJob);
  console.log('[Judging] Judging worker started');
}

/**
 * Queue a submission for judging
 */
export async function queueJudging(
  matchId: string,
  submissionId: string,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<void> {
  // Get submission info
  const [submission] = await db
    .select({
      id: submissions.id,
      artifactId: submissions.artifactId,
      userId: submissions.userId,
    })
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!submission) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  // Get match and challenge info
  const [match] = await db
    .select({
      id: matches.id,
      challengeVersionId: matches.challengeVersionId,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    throw new Error(`Match not found: ${matchId}`);
  }

  const [challengeVersion] = await db
    .select()
    .from(challengeVersions)
    .where(eq(challengeVersions.id, match.challengeVersionId))
    .limit(1);

  if (!challengeVersion) {
    throw new Error(`Challenge version not found: ${match.challengeVersionId}`);
  }

  // Import and use addJudgingJob
  const { addJudgingJob } = await import('./queue');

  await addJudgingJob(
    {
      matchId,
      submissionId,
      artifactId: submission.artifactId,
      challengeId: challengeVersion.challengeId,
      rubricVersion: `v${challengeVersion.versionNumber}`,
    },
    options
  );

  console.log(`[Judging] Queued submission ${submissionId} for judging`);
}

/**
 * Get judging status for a match
 */
export async function getJudgingStatus(
  matchId: string
): Promise<{
  status: 'pending' | 'running' | 'completed' | 'failed';
  runs: JudgementRun[];
}> {
  const runs = await db
    .select()
    .from(judgementRuns)
    .where(eq(judgementRuns.matchId, matchId))
    .orderBy(judgementRuns.startedAt);

  if (runs.length === 0) {
    return { status: 'pending', runs: [] };
  }

  const latestRun = runs[runs.length - 1];

  if (latestRun.status === 'running' || latestRun.status === 'queued') {
    return { status: 'running', runs };
  }

  if (latestRun.status === 'failed') {
    return { status: 'failed', runs };
  }

  return { status: 'completed', runs };
}
