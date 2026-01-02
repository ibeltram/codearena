/**
 * OpenTelemetry Tracing Module
 *
 * Provides distributed tracing capabilities using OpenTelemetry SDK:
 * - Trace context propagation across services (W3C Trace Context)
 * - Span creation for custom operations
 * - Integration with auto-instrumentation (HTTP, PostgreSQL, Redis)
 * - Export to various backends (console, Jaeger, OTLP)
 *
 * Usage:
 * 1. Import instrumentation at the very start of your app (before other imports)
 * 2. Use trace/context APIs from @opentelemetry/api for custom spans
 * 3. Use helper functions from this module for common patterns
 */

import {
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  propagation,
  Span as OTelSpan,
  Context,
  Tracer,
} from '@opentelemetry/api';
import { env } from './env';
import { logger } from './logger';

// Re-export OpenTelemetry API for convenience
export { trace, context, SpanKind, SpanStatusCode, propagation };
export type { OTelSpan, Context, Tracer };

// Tracing configuration
export interface TracingConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  exporterType: 'console' | 'otlp' | 'jaeger' | 'none';
  exporterEndpoint?: string;
  sampleRate: number;
}

// Default configuration
const defaultConfig: TracingConfig = {
  enabled: process.env.OTEL_ENABLED !== 'false',
  serviceName: process.env.OTEL_SERVICE_NAME || 'reporivals-api',
  serviceVersion: process.env.npm_package_version || '0.1.0',
  environment: env.NODE_ENV,
  exporterType: env.NODE_ENV === 'production' ? 'otlp' : 'console',
  exporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  sampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
};

// Configuration management
let config: TracingConfig = { ...defaultConfig };

export function configureTracing(newConfig: Partial<TracingConfig>): void {
  config = { ...defaultConfig, ...newConfig };
  logger.info({ config }, 'Tracing configured');
}

export function getConfig(): TracingConfig {
  return config;
}

/**
 * Get the tracer for this service
 */
export function getTracer(name?: string): Tracer {
  return trace.getTracer(name || config.serviceName, config.serviceVersion);
}

// Trace context interface (for compatibility with existing code)
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

// Simple span wrapper for backward compatibility
export interface SimpleSpan {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  setAttribute(key: string, value: string | number | boolean): SimpleSpan;
  setAttributes(attrs: Record<string, string | number | boolean>): SimpleSpan;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): SimpleSpan;
  setStatus(status: 'ok' | 'error' | 'unset', message?: string): SimpleSpan;
  end(): void;
}

/**
 * Wrapper around OTel Span for backward compatibility
 */
class SpanWrapper implements SimpleSpan {
  private otelSpan: OTelSpan;
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;

  constructor(otelSpan: OTelSpan, name: string) {
    this.otelSpan = otelSpan;
    this.name = name;

    // Extract IDs from span context
    const spanContext = otelSpan.spanContext();
    this.traceId = spanContext.traceId;
    this.spanId = spanContext.spanId;
  }

  setAttribute(key: string, value: string | number | boolean): this {
    this.otelSpan.setAttribute(key, value);
    return this;
  }

  setAttributes(attrs: Record<string, string | number | boolean>): this {
    this.otelSpan.setAttributes(attrs);
    return this;
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): this {
    this.otelSpan.addEvent(name, attributes);
    return this;
  }

  setStatus(status: 'ok' | 'error' | 'unset', message?: string): this {
    const code =
      status === 'ok'
        ? SpanStatusCode.OK
        : status === 'error'
        ? SpanStatusCode.ERROR
        : SpanStatusCode.UNSET;
    this.otelSpan.setStatus({ code, message });
    return this;
  }

  end(): void {
    this.otelSpan.end();
  }

  /**
   * Get the underlying OTel span
   */
  getOTelSpan(): OTelSpan {
    return this.otelSpan;
  }
}

/**
 * Start a new trace (root span)
 */
export function startTrace(
  name: string,
  attributes?: Record<string, string | number | boolean>
): SimpleSpan {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes,
  });
  return new SpanWrapper(span, name);
}

/**
 * Start a child span within an existing trace
 */
export function startSpan(
  name: string,
  parentSpan: SimpleSpan | TraceContext,
  attributes?: Record<string, string | number | boolean>
): SimpleSpan {
  const tracer = getTracer();

  // If parent is a SpanWrapper, use its context
  if (parentSpan instanceof SpanWrapper) {
    const parentContext = trace.setSpan(context.active(), parentSpan.getOTelSpan());
    const span = tracer.startSpan(
      name,
      {
        kind: SpanKind.INTERNAL,
        attributes,
      },
      parentContext
    );
    const wrapper = new SpanWrapper(span, name);
    wrapper.parentSpanId = parentSpan.spanId;
    return wrapper;
  }

  // If parent is TraceContext, create a new span
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes,
  });
  const wrapper = new SpanWrapper(span, name);
  wrapper.parentSpanId = parentSpan.spanId;
  return wrapper;
}

/**
 * Get the current active span
 */
export function getCurrentSpan(): OTelSpan | undefined {
  return trace.getActiveSpan();
}

/**
 * Run a function within a span context
 */
export function withSpan<T>(span: OTelSpan, fn: () => T): T {
  return context.with(trace.setSpan(context.active(), span), fn);
}

/**
 * Get trace context from HTTP headers (W3C Trace Context format)
 */
export function extractTraceContext(
  headers: Record<string, string | string[] | undefined>
): TraceContext | null {
  const traceparent = headers['traceparent'];
  if (!traceparent || typeof traceparent !== 'string') {
    return null;
  }

  // W3C Trace Context format: version-traceId-parentId-flags
  const parts = traceparent.split('-');
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;
  if (version !== '00' || traceId.length !== 32 || spanId.length !== 16) {
    return null;
  }

  return {
    traceId,
    spanId,
    sampled: (parseInt(flags, 16) & 1) === 1,
  };
}

/**
 * Inject trace context into HTTP headers (W3C Trace Context format)
 */
export function injectTraceContext(span: SimpleSpan | OTelSpan): Record<string, string> {
  let traceId: string;
  let spanId: string;

  if (span instanceof SpanWrapper) {
    traceId = span.traceId;
    spanId = span.spanId;
  } else if ('spanContext' in span) {
    const spanContext = span.spanContext();
    traceId = spanContext.traceId;
    spanId = spanContext.spanId;
  } else {
    // Fallback for SimpleSpan interface
    traceId = (span as SimpleSpan).traceId;
    spanId = (span as SimpleSpan).spanId;
  }

  const flags = config.sampleRate >= Math.random() ? '01' : '00';
  return {
    traceparent: `00-${traceId}-${spanId}-${flags}`,
    tracestate: `reporivals=${spanId}`,
  };
}

/**
 * Trace an async function execution
 */
export async function traceAsync<T>(
  name: string,
  fn: (span: SimpleSpan) => Promise<T>,
  parentSpan?: SimpleSpan | TraceContext,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();

  return tracer.startActiveSpan(
    name,
    {
      kind: SpanKind.INTERNAL,
      attributes,
    },
    async (otelSpan) => {
      const span = new SpanWrapper(otelSpan, name);

      try {
        const result = await fn(span);
        span.setStatus('ok');
        return result;
      } catch (error) {
        span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
        span.setAttribute('error.type', error instanceof Error ? error.constructor.name : 'Error');
        if (error instanceof Error && error.stack) {
          span.setAttribute('error.stack', error.stack);
        }
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Trace a synchronous function execution
 */
export function traceSync<T>(
  name: string,
  fn: (span: SimpleSpan) => T,
  parentSpan?: SimpleSpan | TraceContext,
  attributes?: Record<string, string | number | boolean>
): T {
  const tracer = getTracer();
  const otelSpan = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes,
  });
  const span = new SpanWrapper(otelSpan, name);

  try {
    const result = context.with(trace.setSpan(context.active(), otelSpan), () => fn(span));
    span.setStatus('ok');
    return result;
  } catch (error) {
    span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a span for database operations
 */
export function createDbSpan(
  operation: string,
  table: string,
  attributes?: Record<string, string | number | boolean>
): SimpleSpan {
  const tracer = getTracer();
  const span = tracer.startSpan(`db.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'db.system': 'postgresql',
      'db.operation': operation,
      'db.sql.table': table,
      ...attributes,
    },
  });
  return new SpanWrapper(span, `db.${operation}`);
}

/**
 * Create a span for Redis operations
 */
export function createRedisSpan(
  operation: string,
  key?: string,
  attributes?: Record<string, string | number | boolean>
): SimpleSpan {
  const tracer = getTracer();
  const span = tracer.startSpan(`redis.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'db.system': 'redis',
      'db.operation': operation,
      ...(key && { 'db.redis.key': key }),
      ...attributes,
    },
  });
  return new SpanWrapper(span, `redis.${operation}`);
}

/**
 * Create a span for queue operations
 */
export function createQueueSpan(
  operation: string,
  queueName: string,
  jobId?: string,
  attributes?: Record<string, string | number | boolean>
): SimpleSpan {
  const tracer = getTracer();
  const span = tracer.startSpan(`queue.${operation}`, {
    kind: operation === 'publish' || operation === 'enqueue' ? SpanKind.PRODUCER : SpanKind.CONSUMER,
    attributes: {
      'messaging.system': 'bullmq',
      'messaging.destination': queueName,
      'messaging.operation': operation,
      ...(jobId && { 'messaging.message_id': jobId }),
      ...attributes,
    },
  });
  return new SpanWrapper(span, `queue.${operation}`);
}

// Standard attribute names (following OpenTelemetry semantic conventions)
export const SemanticAttributes = {
  // HTTP
  HTTP_METHOD: 'http.method',
  HTTP_URL: 'http.url',
  HTTP_STATUS_CODE: 'http.status_code',
  HTTP_ROUTE: 'http.route',
  HTTP_USER_AGENT: 'http.user_agent',
  HTTP_CLIENT_IP: 'http.client_ip',
  HTTP_REQUEST_ID: 'http.request_id',

  // Database
  DB_SYSTEM: 'db.system',
  DB_NAME: 'db.name',
  DB_OPERATION: 'db.operation',
  DB_STATEMENT: 'db.statement',
  DB_SQL_TABLE: 'db.sql.table',

  // Messaging
  MESSAGING_SYSTEM: 'messaging.system',
  MESSAGING_DESTINATION: 'messaging.destination',
  MESSAGING_OPERATION: 'messaging.operation',
  MESSAGING_MESSAGE_ID: 'messaging.message_id',

  // RepoRivals specific
  USER_ID: 'reporivals.user_id',
  MATCH_ID: 'reporivals.match_id',
  CHALLENGE_ID: 'reporivals.challenge_id',
  SUBMISSION_ID: 'reporivals.submission_id',
  JUDGEMENT_RUN_ID: 'reporivals.judgement_run_id',
  TOURNAMENT_ID: 'reporivals.tournament_id',
  AUTOMATION_JOB_ID: 'reporivals.automation_job_id',
} as const;

/**
 * Add RepoRivals-specific attributes to the current span
 */
export function addRepoRivalsAttributes(attributes: {
  userId?: string;
  matchId?: string;
  challengeId?: string;
  submissionId?: string;
  judgementRunId?: string;
  tournamentId?: string;
  automationJobId?: string;
}): void {
  const span = getCurrentSpan();
  if (!span) return;

  if (attributes.userId) {
    span.setAttribute(SemanticAttributes.USER_ID, attributes.userId);
  }
  if (attributes.matchId) {
    span.setAttribute(SemanticAttributes.MATCH_ID, attributes.matchId);
  }
  if (attributes.challengeId) {
    span.setAttribute(SemanticAttributes.CHALLENGE_ID, attributes.challengeId);
  }
  if (attributes.submissionId) {
    span.setAttribute(SemanticAttributes.SUBMISSION_ID, attributes.submissionId);
  }
  if (attributes.judgementRunId) {
    span.setAttribute(SemanticAttributes.JUDGEMENT_RUN_ID, attributes.judgementRunId);
  }
  if (attributes.tournamentId) {
    span.setAttribute(SemanticAttributes.TOURNAMENT_ID, attributes.tournamentId);
  }
  if (attributes.automationJobId) {
    span.setAttribute(SemanticAttributes.AUTOMATION_JOB_ID, attributes.automationJobId);
  }
}
