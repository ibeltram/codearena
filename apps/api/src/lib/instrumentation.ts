/**
 * OpenTelemetry Instrumentation Setup
 *
 * IMPORTANT: This file must be imported FIRST before any other modules
 * to ensure proper auto-instrumentation of HTTP, PostgreSQL, Redis, etc.
 *
 * Features:
 * - Auto-instrumentation for HTTP requests (incoming and outgoing)
 * - PostgreSQL query tracing with db.statement capture
 * - Redis/ioredis command tracing
 * - Fastify request/response tracing
 * - OTLP export for production (Jaeger, Tempo, etc.)
 * - Console export for development
 * - Configurable sampling rate (10% in production, 100% in dev)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
} from '@opentelemetry/sdk-trace-node';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const OTEL_ENABLED = process.env.OTEL_ENABLED !== 'false';
const OTEL_EXPORTER_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'reporivals-api';
const OTEL_SERVICE_VERSION = process.env.npm_package_version || '0.1.0';
const OTEL_SAMPLE_RATE = parseFloat(process.env.OTEL_SAMPLE_RATE || (NODE_ENV === 'production' ? '0.1' : '1.0'));
const OTEL_DEBUG = process.env.OTEL_DEBUG === 'true';

// Enable debug logging for troubleshooting
if (OTEL_DEBUG) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

/**
 * SDK instance (singleton)
 */
let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK
 * Call this at the very start of your application, before importing other modules
 */
export function initializeTracing(): NodeSDK | null {
  if (!OTEL_ENABLED) {
    console.log('OpenTelemetry tracing disabled (OTEL_ENABLED=false)');
    return null;
  }

  if (sdk) {
    console.log('OpenTelemetry SDK already initialized');
    return sdk;
  }

  console.log(`Initializing OpenTelemetry tracing...`);
  console.log(`  Service: ${OTEL_SERVICE_NAME}@${OTEL_SERVICE_VERSION}`);
  console.log(`  Environment: ${NODE_ENV}`);
  console.log(`  Sample Rate: ${OTEL_SAMPLE_RATE * 100}%`);

  // Create resource with service information
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: OTEL_SERVICE_NAME,
    [SEMRESATTRS_SERVICE_VERSION]: OTEL_SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: NODE_ENV,
  });

  // Configure sampler based on environment
  // In production, sample 10% of traces to reduce overhead
  // In development, sample 100% for debugging
  const sampler = new ParentBasedSampler({
    root: OTEL_SAMPLE_RATE >= 1.0
      ? new AlwaysOnSampler()
      : new TraceIdRatioBasedSampler(OTEL_SAMPLE_RATE),
  });

  // Configure exporter based on environment
  // Production: OTLP exporter to send traces to Jaeger/Tempo/etc
  // Development: Console exporter for local debugging
  const isProduction = NODE_ENV === 'production';

  let spanProcessor;
  if (isProduction && OTEL_EXPORTER_ENDPOINT) {
    // Use OTLP exporter with batch processing for efficiency
    const otlpExporter = new OTLPTraceExporter({
      url: OTEL_EXPORTER_ENDPOINT,
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
        ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
        : {},
    });
    spanProcessor = new BatchSpanProcessor(otlpExporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    });
    console.log(`  Exporter: OTLP -> ${OTEL_EXPORTER_ENDPOINT}`);
  } else {
    // Use console exporter for development
    const consoleExporter = new ConsoleSpanExporter();
    spanProcessor = new SimpleSpanProcessor(consoleExporter);
    console.log(`  Exporter: Console (development mode)`);
  }

  // Create SDK with instrumentations
  sdk = new NodeSDK({
    resource,
    sampler,
    spanProcessor,
    instrumentations: [
      // HTTP instrumentation for incoming and outgoing requests
      new HttpInstrumentation({
        // Ignore health check endpoints to reduce noise
        ignoreIncomingRequestHook: (request) => {
          const url = request.url || '';
          return url.includes('/health') || url.includes('/metrics') || url.includes('/favicon');
        },
        // Add custom attributes to HTTP spans
        requestHook: (span, request) => {
          // Add request ID if present
          const requestId = request.headers?.['x-request-id'];
          if (requestId && typeof requestId === 'string') {
            span.setAttribute('http.request_id', requestId);
          }
        },
      }),

      // Fastify instrumentation for route-level spans
      new FastifyInstrumentation({
        requestHook: (span, info) => {
          // Add route pattern to span name for better grouping
          if (info.request?.routeOptions?.url) {
            span.updateName(`${info.request.method} ${info.request.routeOptions.url}`);
          }
        },
      }),

      // PostgreSQL instrumentation for database queries
      new PgInstrumentation({
        // Enable capturing SQL statements (be careful with sensitive data)
        enhancedDatabaseReporting: true,
        // Add query parameters (be careful with sensitive data)
        addSqlCommenterCommentToQueries: false,
      }),

      // Redis instrumentation for cache operations
      new IORedisInstrumentation({
        // Add db.statement attribute with Redis command
        dbStatementSerializer: (cmdName, cmdArgs) => {
          // Redact sensitive data from SET/SETEX commands
          if (cmdName === 'SET' || cmdName === 'SETEX') {
            return `${cmdName} ${cmdArgs[0]} [REDACTED]`;
          }
          // Limit command display for large data
          const argsStr = cmdArgs.slice(0, 3).join(' ');
          return cmdArgs.length > 3 ? `${cmdName} ${argsStr}...` : `${cmdName} ${argsStr}`;
        },
      }),
    ],
  });

  // Start the SDK
  sdk.start();

  // Graceful shutdown on process termination
  const shutdown = async () => {
    try {
      await sdk?.shutdown();
      console.log('OpenTelemetry SDK shut down successfully');
    } catch (error) {
      console.error('Error shutting down OpenTelemetry SDK:', error);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('OpenTelemetry tracing initialized successfully');
  return sdk;
}

/**
 * Get the current SDK instance
 */
export function getTracingSDK(): NodeSDK | null {
  return sdk;
}

/**
 * Shutdown tracing gracefully
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
    console.log('OpenTelemetry SDK shut down');
  }
}
