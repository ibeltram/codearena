/**
 * Prometheus metrics for RepoRivals API
 *
 * Provides SLI tracking for:
 * - Match start success/failure rate
 * - Upload success/failure rate
 * - Judging duration histogram
 * - Payment success/failure rate
 */

import client from 'prom-client';

// Create a new registry
export const metricsRegistry = new client.Registry();

// Add default metrics (process, gc, etc.)
client.collectDefaultMetrics({ register: metricsRegistry });

// ============================================================================
// Match Metrics
// ============================================================================

/**
 * Counter for match start attempts
 * Labels: status (success/failure), mode (ranked/invite/tournament)
 */
export const matchStartTotal = new client.Counter({
  name: 'reporivals_match_start_total',
  help: 'Total number of match start attempts',
  labelNames: ['status', 'mode'] as const,
  registers: [metricsRegistry],
});

/**
 * Counter for match completions
 * Labels: status (completed/cancelled/forfeit)
 */
export const matchCompleteTotal = new client.Counter({
  name: 'reporivals_match_complete_total',
  help: 'Total number of match completions',
  labelNames: ['status'] as const,
  registers: [metricsRegistry],
});

/**
 * Gauge for active matches
 */
export const activeMatchesGauge = new client.Gauge({
  name: 'reporivals_active_matches',
  help: 'Number of currently active matches',
  registers: [metricsRegistry],
});

// ============================================================================
// Upload/Submission Metrics
// ============================================================================

/**
 * Counter for upload attempts
 * Labels: status (success/failure), method (zip/github)
 */
export const uploadTotal = new client.Counter({
  name: 'reporivals_upload_total',
  help: 'Total number of submission upload attempts',
  labelNames: ['status', 'method'] as const,
  registers: [metricsRegistry],
});

/**
 * Histogram for upload sizes in bytes
 */
export const uploadSizeBytes = new client.Histogram({
  name: 'reporivals_upload_size_bytes',
  help: 'Size of uploaded submissions in bytes',
  buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600], // 1KB, 10KB, 100KB, 1MB, 10MB, 100MB
  registers: [metricsRegistry],
});

/**
 * Histogram for upload duration
 */
export const uploadDurationSeconds = new client.Histogram({
  name: 'reporivals_upload_duration_seconds',
  help: 'Duration of submission uploads in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [metricsRegistry],
});

// ============================================================================
// Judging Metrics
// ============================================================================

/**
 * Histogram for judging duration
 */
export const judgingDurationSeconds = new client.Histogram({
  name: 'reporivals_judging_duration_seconds',
  help: 'Duration of judging runs in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [metricsRegistry],
});

/**
 * Counter for judging run outcomes
 * Labels: status (success/failure/timeout)
 */
export const judgingTotal = new client.Counter({
  name: 'reporivals_judging_total',
  help: 'Total number of judging runs',
  labelNames: ['status'] as const,
  registers: [metricsRegistry],
});

/**
 * Gauge for queued judging jobs
 */
export const judgingQueueSize = new client.Gauge({
  name: 'reporivals_judging_queue_size',
  help: 'Number of judging jobs in queue',
  registers: [metricsRegistry],
});

// ============================================================================
// Payment Metrics
// ============================================================================

/**
 * Counter for payment attempts
 * Labels: status (success/failure/pending), type (credit_purchase/prize_payout)
 */
export const paymentTotal = new client.Counter({
  name: 'reporivals_payment_total',
  help: 'Total number of payment transactions',
  labelNames: ['status', 'type'] as const,
  registers: [metricsRegistry],
});

/**
 * Histogram for payment amounts in cents
 */
export const paymentAmountCents = new client.Histogram({
  name: 'reporivals_payment_amount_cents',
  help: 'Payment amounts in cents',
  buckets: [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000],
  registers: [metricsRegistry],
});

// ============================================================================
// Credit System Metrics
// ============================================================================

/**
 * Counter for credit transactions
 * Labels: type (purchase/stake/win/transfer/redeem)
 */
export const creditTransactionTotal = new client.Counter({
  name: 'reporivals_credit_transaction_total',
  help: 'Total number of credit transactions',
  labelNames: ['type'] as const,
  registers: [metricsRegistry],
});

/**
 * Histogram for credit amounts
 */
export const creditAmountHistogram = new client.Histogram({
  name: 'reporivals_credit_amount',
  help: 'Credit amounts in transactions',
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [metricsRegistry],
});

// ============================================================================
// API Request Metrics
// ============================================================================

/**
 * Histogram for HTTP request duration
 * Labels: method, route, status_code
 */
export const httpRequestDurationSeconds = new client.Histogram({
  name: 'reporivals_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/**
 * Counter for HTTP requests
 * Labels: method, route, status_code
 */
export const httpRequestTotal = new client.Counter({
  name: 'reporivals_http_request_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

// ============================================================================
// WebSocket/SSE Metrics
// ============================================================================

/**
 * Gauge for active WebSocket connections
 */
export const activeWebsocketConnections = new client.Gauge({
  name: 'reporivals_websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [metricsRegistry],
});

/**
 * Counter for WebSocket messages
 * Labels: direction (inbound/outbound), type (match_event/notification)
 */
export const websocketMessagesTotal = new client.Counter({
  name: 'reporivals_websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['direction', 'type'] as const,
  registers: [metricsRegistry],
});

// ============================================================================
// Automation Service Metrics
// ============================================================================

/**
 * Counter for automation jobs
 * Labels: status (queued/running/completed/failed), type (batch_run/eval/ci_check/multi_model/agent)
 */
export const automationJobsTotal = new client.Counter({
  name: 'reporivals_automation_jobs_total',
  help: 'Total number of automation jobs',
  labelNames: ['status', 'type'] as const,
  registers: [metricsRegistry],
});

/**
 * Histogram for automation job duration
 */
export const automationJobDurationSeconds = new client.Histogram({
  name: 'reporivals_automation_job_duration_seconds',
  help: 'Duration of automation jobs in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800],
  registers: [metricsRegistry],
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Record a match start event
 */
export function recordMatchStart(success: boolean, mode: string) {
  matchStartTotal.inc({ status: success ? 'success' : 'failure', mode });
}

/**
 * Record a match completion
 */
export function recordMatchComplete(status: 'completed' | 'cancelled' | 'forfeit') {
  matchCompleteTotal.inc({ status });
}

/**
 * Record an upload attempt
 */
export function recordUpload(
  success: boolean,
  method: 'zip' | 'github',
  sizeBytes?: number,
  durationSeconds?: number
) {
  uploadTotal.inc({ status: success ? 'success' : 'failure', method });
  if (sizeBytes !== undefined) {
    uploadSizeBytes.observe(sizeBytes);
  }
  if (durationSeconds !== undefined) {
    uploadDurationSeconds.observe(durationSeconds);
  }
}

/**
 * Record a judging run
 */
export function recordJudging(
  status: 'success' | 'failure' | 'timeout',
  durationSeconds?: number
) {
  judgingTotal.inc({ status });
  if (durationSeconds !== undefined) {
    judgingDurationSeconds.observe(durationSeconds);
  }
}

/**
 * Record a payment transaction
 */
export function recordPayment(
  success: boolean,
  type: 'credit_purchase' | 'prize_payout',
  amountCents?: number
) {
  paymentTotal.inc({
    status: success ? 'success' : 'failure',
    type,
  });
  if (amountCents !== undefined) {
    paymentAmountCents.observe(amountCents);
  }
}

/**
 * Record a credit transaction
 */
export function recordCreditTransaction(
  type: 'purchase' | 'stake' | 'win' | 'transfer' | 'redeem',
  amount?: number
) {
  creditTransactionTotal.inc({ type });
  if (amount !== undefined) {
    creditAmountHistogram.observe(amount);
  }
}

/**
 * Record an HTTP request
 */
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number
) {
  const labels = {
    method,
    route: normalizeRoute(route),
    status_code: String(statusCode),
  };
  httpRequestTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationSeconds);
}

/**
 * Normalize route for metrics (replace IDs with placeholders)
 */
function normalizeRoute(route: string): string {
  // Replace UUIDs with :id placeholder
  return route
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id');
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

/**
 * Get content type for Prometheus metrics
 */
export function getMetricsContentType(): string {
  return metricsRegistry.contentType;
}
