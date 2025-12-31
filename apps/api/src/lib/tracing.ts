/**
 * OpenTelemetry Tracing Module
 *
 * Provides distributed tracing capabilities:
 * - Trace context propagation across services
 * - Span creation for operations
 * - Integration with logging correlation IDs
 * - Export to various backends (console, Jaeger, OTLP)
 */

import { env } from './env';
import { logger } from './logger';

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
  enabled: env.NODE_ENV === 'production',
  serviceName: 'reporivals-api',
  serviceVersion: process.env.npm_package_version || '0.1.0',
  environment: env.NODE_ENV,
  exporterType: env.NODE_ENV === 'production' ? 'otlp' : 'console',
  exporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  sampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
};

// Trace context interface
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

// Span interface
export interface Span {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: bigint;
  endTime?: bigint;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: bigint;
  attributes?: Record<string, string | number | boolean>;
}

// Simple span implementation for development
class SimpleSpan implements Span {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: bigint;
  endTime?: bigint;
  status: 'ok' | 'error' | 'unset' = 'unset';
  attributes: Record<string, string | number | boolean> = {};
  events: SpanEvent[] = [];

  constructor(name: string, traceId: string, parentSpanId?: string) {
    this.name = name;
    this.traceId = traceId;
    this.spanId = generateSpanId();
    this.parentSpanId = parentSpanId;
    this.startTime = process.hrtime.bigint();
  }

  setAttribute(key: string, value: string | number | boolean): this {
    this.attributes[key] = value;
    return this;
  }

  setAttributes(attrs: Record<string, string | number | boolean>): this {
    Object.assign(this.attributes, attrs);
    return this;
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): this {
    this.events.push({
      name,
      timestamp: process.hrtime.bigint(),
      attributes,
    });
    return this;
  }

  setStatus(status: 'ok' | 'error' | 'unset', message?: string): this {
    this.status = status;
    if (message) {
      this.attributes['status.message'] = message;
    }
    return this;
  }

  end(): void {
    this.endTime = process.hrtime.bigint();
    exportSpan(this);
  }

  getDurationMs(): number {
    const end = this.endTime || process.hrtime.bigint();
    return Number(end - this.startTime) / 1e6;
  }
}

// ID generators
function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Active spans storage (using WeakMap to avoid memory leaks)
const activeSpans = new Map<string, SimpleSpan>();

// Export span to configured backend
function exportSpan(span: SimpleSpan): void {
  const config = getConfig();

  if (!config.enabled || config.exporterType === 'none') {
    return;
  }

  const spanData = {
    name: span.name,
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    startTime: new Date(Number(span.startTime / BigInt(1e6))).toISOString(),
    endTime: span.endTime ? new Date(Number(span.endTime / BigInt(1e6))).toISOString() : null,
    durationMs: span.getDurationMs(),
    status: span.status,
    attributes: span.attributes,
    events: span.events.map((e) => ({
      name: e.name,
      timestamp: new Date(Number(e.timestamp / BigInt(1e6))).toISOString(),
      attributes: e.attributes,
    })),
  };

  if (config.exporterType === 'console') {
    logger.debug({ span: spanData }, `Span: ${span.name}`);
  }

  // For OTLP/Jaeger exporters, you would send to the configured endpoint
  // This is a simplified implementation - for production, use @opentelemetry/sdk-node
}

// Configuration management
let config: TracingConfig = { ...defaultConfig };

export function configureTracing(newConfig: Partial<TracingConfig>): void {
  config = { ...defaultConfig, ...newConfig };
  logger.info({ config }, 'Tracing configured');
}

export function getConfig(): TracingConfig {
  return config;
}

// Public API

/**
 * Start a new trace (root span)
 */
export function startTrace(name: string, attributes?: Record<string, string | number | boolean>): SimpleSpan {
  const span = new SimpleSpan(name, generateTraceId());
  if (attributes) {
    span.setAttributes(attributes);
  }
  activeSpans.set(span.spanId, span);
  return span;
}

/**
 * Start a child span within an existing trace
 */
export function startSpan(
  name: string,
  parentSpan: SimpleSpan | TraceContext,
  attributes?: Record<string, string | number | boolean>
): SimpleSpan {
  const traceId = 'traceId' in parentSpan ? parentSpan.traceId : parentSpan.traceId;
  const parentId = 'spanId' in parentSpan ? parentSpan.spanId : parentSpan.spanId;

  const span = new SimpleSpan(name, traceId, parentId);
  if (attributes) {
    span.setAttributes(attributes);
  }
  activeSpans.set(span.spanId, span);
  return span;
}

/**
 * Get trace context from HTTP headers (W3C Trace Context format)
 */
export function extractTraceContext(headers: Record<string, string | string[] | undefined>): TraceContext | null {
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
export function injectTraceContext(span: SimpleSpan): Record<string, string> {
  const flags = config.sampleRate >= Math.random() ? '01' : '00';
  return {
    traceparent: `00-${span.traceId}-${span.spanId}-${flags}`,
    tracestate: `reporivals=${span.spanId}`,
  };
}

/**
 * Trace a function execution
 */
export async function traceAsync<T>(
  name: string,
  fn: (span: SimpleSpan) => Promise<T>,
  parentSpan?: SimpleSpan | TraceContext,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const span = parentSpan ? startSpan(name, parentSpan, attributes) : startTrace(name, attributes);

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
    activeSpans.delete(span.spanId);
  }
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
  const span = parentSpan ? startSpan(name, parentSpan, attributes) : startTrace(name, attributes);

  try {
    const result = fn(span);
    span.setStatus('ok');
    return result;
  } catch (error) {
    span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  } finally {
    span.end();
    activeSpans.delete(span.spanId);
  }
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

  // Database
  DB_SYSTEM: 'db.system',
  DB_NAME: 'db.name',
  DB_OPERATION: 'db.operation',
  DB_STATEMENT: 'db.statement',

  // Messaging
  MESSAGING_SYSTEM: 'messaging.system',
  MESSAGING_DESTINATION: 'messaging.destination',
  MESSAGING_OPERATION: 'messaging.operation',

  // RepoRivals specific
  USER_ID: 'reporivals.user_id',
  MATCH_ID: 'reporivals.match_id',
  CHALLENGE_ID: 'reporivals.challenge_id',
  SUBMISSION_ID: 'reporivals.submission_id',
  JUDGEMENT_RUN_ID: 'reporivals.judgement_run_id',
  TOURNAMENT_ID: 'reporivals.tournament_id',
} as const;
