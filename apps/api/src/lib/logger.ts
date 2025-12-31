/**
 * Structured Logging Module
 *
 * Provides:
 * - Structured JSON logging with pino
 * - Sensitive data redaction
 * - Context field support (user_id, match_id, judgement_run_id)
 * - Request correlation via requestId
 * - Log aggregation friendly format
 */

import pino, { Logger as PinoLogger } from 'pino';
import { AsyncLocalStorage } from 'async_hooks';
import { env } from './env';

// Sensitive field patterns to redact
const REDACT_PATHS = [
  'password',
  'accessToken',
  'refreshToken',
  'token',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'creditCard',
  'ssn',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.accessToken',
  '*.refreshToken',
];

// Serializers to format specific objects
const serializers = {
  req: (req: any) => ({
    method: req.method,
    url: req.url,
    path: req.routerPath || req.url,
    parameters: req.params,
    query: req.query,
    headers: {
      host: req.headers?.host,
      'user-agent': req.headers?.['user-agent'],
      'content-type': req.headers?.['content-type'],
      'x-request-id': req.headers?.['x-request-id'],
    },
    remoteAddress: req.ip || req.socket?.remoteAddress,
  }),
  res: (res: any) => ({
    statusCode: res.statusCode,
    headers: {
      'content-type': res.getHeader?.('content-type'),
      'x-request-id': res.getHeader?.('x-request-id'),
    },
  }),
  err: pino.stdSerializers.err,
};

// Create base logger configuration
const baseConfig: pino.LoggerOptions = {
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',

  // Redact sensitive fields
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },

  // Base context fields
  base: {
    env: env.NODE_ENV,
    service: 'reporivals-api',
    version: process.env.npm_package_version || '0.1.0',
  },

  // Custom serializers
  serializers,

  // Format level as string
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      ...bindings,
      // Add timestamp in ISO format for log aggregation
      timestamp: new Date().toISOString(),
    }),
  },

  // Add timestamp
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Development transport for pretty printing
const devTransport: pino.TransportSingleOptions = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname,service,version',
    messageFormat: '{requestId} {msg}',
    errorLikeObjectKeys: ['err', 'error'],
  },
};

// Create the logger
export const logger = pino({
  ...baseConfig,
  transport: env.NODE_ENV === 'development' ? devTransport : undefined,
});

export type Logger = PinoLogger;

/**
 * Context fields that can be added to log entries
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  matchId?: string;
  judgementRunId?: string;
  submissionId?: string;
  challengeId?: string;
  tournamentId?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Create a child logger with context fields
 */
export function createContextLogger(context: LogContext): PinoLogger {
  return logger.child(context);
}

/**
 * Async local storage for request context
 * This allows accessing request context from anywhere in the call stack
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  matchId?: string;
  judgementRunId?: string;
  logger: PinoLogger;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context logger
 * Falls back to the base logger if no context is available
 */
export function getContextLogger(): PinoLogger {
  const ctx = requestContext.getStore();
  return ctx?.logger || logger;
}

/**
 * Get current request context
 */
export function getCurrentContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Log helper functions with automatic context
 */
export const log = {
  debug: (msg: string, data?: object) => getContextLogger().debug(data, msg),
  info: (msg: string, data?: object) => getContextLogger().info(data, msg),
  warn: (msg: string, data?: object) => getContextLogger().warn(data, msg),
  error: (msg: string, data?: object) => getContextLogger().error(data, msg),
  fatal: (msg: string, data?: object) => getContextLogger().fatal(data, msg),
};

/**
 * Audit log for security-sensitive operations
 */
export function auditLog(
  action: string,
  details: {
    userId?: string;
    targetId?: string;
    targetType?: string;
    result: 'success' | 'failure';
    reason?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const ctx = getCurrentContext();
  const auditLogger = logger.child({
    audit: true,
    requestId: ctx?.requestId,
  });

  auditLogger.info(
    {
      action,
      ...details,
    },
    `AUDIT: ${action} - ${details.result}`
  );
}
