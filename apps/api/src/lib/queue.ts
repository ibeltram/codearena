/**
 * BullMQ Job Queue Configuration
 *
 * Provides job queue infrastructure for async processing:
 * - Judging jobs: Run automated tests and scoring
 * - Notification jobs: Send emails, push notifications
 * - Cleanup jobs: Archive old data, clear caches
 * - Settlement jobs: Process match settlements after judging
 *
 * Queue Architecture:
 * - Each queue has dedicated workers with concurrency limits
 * - Jobs support retries with exponential backoff
 * - Failed jobs are moved to dead letter queue for inspection
 * - Job progress and results are tracked in Redis
 */

import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from 'bullmq';
import { env } from './env';

// Parse Redis URL for BullMQ connection
function parseRedisUrl(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) : 0,
    };
  } catch {
    // Fallback for simple host:port format
    return {
      host: 'localhost',
      port: 6379,
    };
  }
}

// BullMQ connection configuration
const connection: ConnectionOptions = parseRedisUrl(env.REDIS_URL);

// Queue names
export const QUEUE_NAMES = {
  JUDGING: 'judging',
  NOTIFICATIONS: 'notifications',
  SETTLEMENT: 'settlement',
  CLEANUP: 'cleanup',
} as const;

// Job types and their data interfaces
export interface JudgingJobData {
  matchId: string;
  submissionId: string;
  artifactId: string;
  challengeId: string;
  rubricVersion: string;
  priority?: number;
}

export interface NotificationJobData {
  type: 'email' | 'push' | 'in_app';
  userId: string;
  template: string;
  data: Record<string, unknown>;
  priority?: 'high' | 'normal' | 'low';
}

export interface SettlementJobData {
  matchId: string;
  outcome: 'winner_a' | 'winner_b' | 'tie' | 'cancelled';
  scoreA?: number;
  scoreB?: number;
  reason?: string;
}

export interface CleanupJobData {
  type: 'archive_matches' | 'clear_cache' | 'expire_sessions' | 'prune_artifacts';
  olderThanDays?: number;
  dryRun?: boolean;
}

// Job result types
export interface JudgingJobResult {
  submissionId: string;
  score: number;
  breakdown: Record<string, number>;
  logs: string[];
  executionTimeMs: number;
}

export interface SettlementJobResult {
  matchId: string;
  settled: boolean;
  winnerUserId?: string;
  platformFee?: number;
}

// Default job options
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000, // Keep last 1000 completed jobs
    age: 24 * 60 * 60, // Keep for 24 hours
  },
  removeOnFail: {
    count: 5000, // Keep last 5000 failed jobs
    age: 7 * 24 * 60 * 60, // Keep for 7 days
  },
};

// Queue instances (lazy initialized)
const queues: Map<string, Queue> = new Map();
const workers: Map<string, Worker> = new Map();
const queueEvents: Map<string, QueueEvents> = new Map();

/**
 * Get or create a queue by name
 */
export function getQueue<T = unknown>(name: string): Queue<T> {
  let queue = queues.get(name);

  if (!queue) {
    queue = new Queue<T>(name, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    queue.on('error', (err) => {
      console.error(`Queue ${name} error:`, err.message);
    });

    queues.set(name, queue);
  }

  return queue as Queue<T>;
}

/**
 * Get queue events for monitoring
 */
export function getQueueEvents(name: string): QueueEvents {
  let events = queueEvents.get(name);

  if (!events) {
    events = new QueueEvents(name, { connection });
    queueEvents.set(name, events);
  }

  return events;
}

// ============================================================
// Judging Queue
// ============================================================

/**
 * Add a judging job to the queue
 */
export async function addJudgingJob(
  data: JudgingJobData,
  options?: { priority?: number; delay?: number }
): Promise<Job<JudgingJobData>> {
  const queue = getQueue<JudgingJobData>(QUEUE_NAMES.JUDGING);

  return queue.add('judge-submission', data, {
    priority: options?.priority ?? data.priority ?? 5,
    delay: options?.delay,
    jobId: `judging-${data.submissionId}`, // Prevent duplicate judging
  });
}

/**
 * Create judging worker
 */
export function createJudgingWorker(
  processor: (job: Job<JudgingJobData>) => Promise<JudgingJobResult>
): Worker<JudgingJobData, JudgingJobResult> {
  const worker = new Worker<JudgingJobData, JudgingJobResult>(
    QUEUE_NAMES.JUDGING,
    processor,
    {
      connection,
      concurrency: 2, // Run 2 judging jobs in parallel
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute
      },
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`Judging job ${job.id} completed:`, result.score);
  });

  worker.on('failed', (job, err) => {
    console.error(`Judging job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Judging worker error:', err.message);
  });

  workers.set(QUEUE_NAMES.JUDGING, worker);
  return worker;
}

// ============================================================
// Notification Queue
// ============================================================

/**
 * Add a notification job to the queue
 */
export async function addNotificationJob(
  data: NotificationJobData,
  options?: { delay?: number }
): Promise<Job<NotificationJobData>> {
  const queue = getQueue<NotificationJobData>(QUEUE_NAMES.NOTIFICATIONS);

  const priority =
    data.priority === 'high' ? 1 : data.priority === 'low' ? 10 : 5;

  return queue.add(`notify-${data.type}`, data, {
    priority,
    delay: options?.delay,
  });
}

/**
 * Create notification worker
 */
export function createNotificationWorker(
  processor: (job: Job<NotificationJobData>) => Promise<void>
): Worker<NotificationJobData, void> {
  const worker = new Worker<NotificationJobData, void>(
    QUEUE_NAMES.NOTIFICATIONS,
    processor,
    {
      connection,
      concurrency: 5, // Run 5 notification jobs in parallel
    }
  );

  worker.on('completed', (job) => {
    console.log(`Notification job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Notification job ${job?.id} failed:`, err.message);
  });

  workers.set(QUEUE_NAMES.NOTIFICATIONS, worker);
  return worker;
}

// ============================================================
// Settlement Queue
// ============================================================

/**
 * Add a settlement job to the queue
 */
export async function addSettlementJob(
  data: SettlementJobData,
  options?: { delay?: number }
): Promise<Job<SettlementJobData>> {
  const queue = getQueue<SettlementJobData>(QUEUE_NAMES.SETTLEMENT);

  return queue.add('settle-match', data, {
    delay: options?.delay,
    jobId: `settlement-${data.matchId}`, // Prevent duplicate settlements
  });
}

/**
 * Create settlement worker
 */
export function createSettlementWorker(
  processor: (job: Job<SettlementJobData>) => Promise<SettlementJobResult>
): Worker<SettlementJobData, SettlementJobResult> {
  const worker = new Worker<SettlementJobData, SettlementJobResult>(
    QUEUE_NAMES.SETTLEMENT,
    processor,
    {
      connection,
      concurrency: 1, // Process settlements one at a time for safety
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`Settlement job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`Settlement job ${job?.id} failed:`, err.message);
  });

  workers.set(QUEUE_NAMES.SETTLEMENT, worker);
  return worker;
}

// ============================================================
// Cleanup Queue
// ============================================================

/**
 * Add a cleanup job to the queue
 */
export async function addCleanupJob(
  data: CleanupJobData,
  options?: { delay?: number; repeat?: { pattern: string } }
): Promise<Job<CleanupJobData>> {
  const queue = getQueue<CleanupJobData>(QUEUE_NAMES.CLEANUP);

  return queue.add(`cleanup-${data.type}`, data, {
    delay: options?.delay,
    repeat: options?.repeat,
    priority: 10, // Low priority
  });
}

/**
 * Create cleanup worker
 */
export function createCleanupWorker(
  processor: (job: Job<CleanupJobData>) => Promise<{ cleaned: number }>
): Worker<CleanupJobData, { cleaned: number }> {
  const worker = new Worker<CleanupJobData, { cleaned: number }>(
    QUEUE_NAMES.CLEANUP,
    processor,
    {
      connection,
      concurrency: 1, // Run cleanup jobs one at a time
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`Cleanup job ${job.id} completed: ${result.cleaned} items`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Cleanup job ${job?.id} failed:`, err.message);
  });

  workers.set(QUEUE_NAMES.CLEANUP, worker);
  return worker;
}

// ============================================================
// Queue Management
// ============================================================

/**
 * Get queue statistics
 */
export async function getQueueStats(name: string): Promise<{
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}> {
  const queue = getQueue(name);

  const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused(),
  ]);

  return {
    name,
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused: isPaused,
  };
}

/**
 * Get all queue statistics
 */
export async function getAllQueueStats(): Promise<
  Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }>
> {
  const stats = await Promise.all(
    Object.values(QUEUE_NAMES).map((name) => getQueueStats(name))
  );
  return stats;
}

/**
 * Pause a queue
 */
export async function pauseQueue(name: string): Promise<void> {
  const queue = getQueue(name);
  await queue.pause();
}

/**
 * Resume a queue
 */
export async function resumeQueue(name: string): Promise<void> {
  const queue = getQueue(name);
  await queue.resume();
}

/**
 * Drain a queue (remove all waiting jobs)
 */
export async function drainQueue(name: string): Promise<void> {
  const queue = getQueue(name);
  await queue.drain();
}

/**
 * Clean old jobs from a queue
 */
export async function cleanQueue(
  name: string,
  grace: number = 0,
  status: 'completed' | 'failed' | 'delayed' | 'wait' = 'completed'
): Promise<string[]> {
  const queue = getQueue(name);
  return queue.clean(grace, 1000, status);
}

/**
 * Get a specific job by ID
 */
export async function getJob<T>(
  queueName: string,
  jobId: string
): Promise<Job<T> | undefined> {
  const queue = getQueue<T>(queueName);
  return queue.getJob(jobId);
}

/**
 * Get job progress
 */
export async function getJobProgress(
  queueName: string,
  jobId: string
): Promise<number | object | null> {
  const job = await getJob(queueName, jobId);
  return job?.progress ?? null;
}

/**
 * Cancel/remove a job
 */
export async function removeJob(
  queueName: string,
  jobId: string
): Promise<boolean> {
  const job = await getJob(queueName, jobId);
  if (job) {
    await job.remove();
    return true;
  }
  return false;
}

/**
 * Retry a failed job
 */
export async function retryJob(
  queueName: string,
  jobId: string
): Promise<boolean> {
  const job = await getJob(queueName, jobId);
  if (job) {
    await job.retry();
    return true;
  }
  return false;
}

// ============================================================
// Graceful Shutdown
// ============================================================

/**
 * Close all queues and workers gracefully
 */
export async function closeQueues(): Promise<void> {
  console.log('Closing BullMQ queues and workers...');

  // Close workers first
  const workerClosePromises = Array.from(workers.values()).map((worker) =>
    worker.close()
  );
  await Promise.all(workerClosePromises);
  workers.clear();

  // Close queue events
  const eventsClosePromises = Array.from(queueEvents.values()).map((events) =>
    events.close()
  );
  await Promise.all(eventsClosePromises);
  queueEvents.clear();

  // Close queues
  const queueClosePromises = Array.from(queues.values()).map((queue) =>
    queue.close()
  );
  await Promise.all(queueClosePromises);
  queues.clear();

  console.log('BullMQ shutdown complete');
}

// ============================================================
// Scheduled Jobs Setup
// ============================================================

/**
 * Setup recurring cleanup jobs
 */
export async function setupScheduledJobs(): Promise<void> {
  // Archive matches older than 90 days - daily at 3am
  await addCleanupJob(
    { type: 'archive_matches', olderThanDays: 90 },
    { repeat: { pattern: '0 3 * * *' } }
  );

  // Clear expired cache entries - every 6 hours
  await addCleanupJob(
    { type: 'clear_cache' },
    { repeat: { pattern: '0 */6 * * *' } }
  );

  // Expire old sessions - daily at 2am
  await addCleanupJob(
    { type: 'expire_sessions', olderThanDays: 30 },
    { repeat: { pattern: '0 2 * * *' } }
  );

  // Prune unused artifacts - weekly on Sunday at 4am
  await addCleanupJob(
    { type: 'prune_artifacts', olderThanDays: 180 },
    { repeat: { pattern: '0 4 * * 0' } }
  );

  console.log('Scheduled cleanup jobs configured');
}
