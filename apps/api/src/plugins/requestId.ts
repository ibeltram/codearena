/**
 * Request ID and Context Plugin
 *
 * Provides:
 * - Request ID generation/propagation
 * - Async local storage context for request-scoped logging
 * - User ID and entity ID context injection
 * - Response timing metrics
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { requestContext, createContextLogger, logger } from '../lib/logger';

// Extend FastifyRequest to include context methods
declare module 'fastify' {
  interface FastifyRequest {
    setLogContext: (context: {
      userId?: string;
      matchId?: string;
      judgementRunId?: string;
      submissionId?: string;
      challengeId?: string;
      tournamentId?: string;
    }) => void;
    startTime: bigint;
  }
}

export async function registerRequestId(app: FastifyInstance) {
  // Add request ID and context on every request
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Use provided request ID or generate a new one
    const requestId = (request.headers['x-request-id'] as string) || randomUUID();

    // Store request ID and start time
    request.id = requestId;
    request.startTime = process.hrtime.bigint();

    // Add to response headers for correlation
    reply.header('X-Request-ID', requestId);

    // Create context-aware logger
    const contextLogger = createContextLogger({ requestId });
    request.log = contextLogger;

    // Run the rest of the request in async local storage context
    // This allows any code to access the request context via requestContext.getStore()
    const runWithContext = (callback: () => Promise<void>) => {
      return requestContext.run(
        {
          requestId,
          logger: contextLogger,
        },
        callback
      );
    };

    // Store the context runner on the request for use in route handlers
    (request as any).runWithContext = runWithContext;

    // Add method to set additional context (userId, matchId, etc.)
    request.setLogContext = (context) => {
      const currentStore = requestContext.getStore();
      if (currentStore) {
        // Update the store with new context
        Object.assign(currentStore, context);

        // Create new child logger with additional context
        currentStore.logger = createContextLogger({
          requestId,
          ...context,
        });
        request.log = currentStore.logger;
      }
    };
  });

  // Log request completion with timing
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const duration = Number(process.hrtime.bigint() - request.startTime) / 1e6; // Convert to milliseconds

    const ctx = requestContext.getStore();
    const logData = {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: Math.round(duration * 100) / 100,
      userId: ctx?.userId,
      matchId: ctx?.matchId,
    };

    // Log at different levels based on status code
    if (reply.statusCode >= 500) {
      request.log.error(logData, 'Request completed with server error');
    } else if (reply.statusCode >= 400) {
      request.log.warn(logData, 'Request completed with client error');
    } else {
      request.log.info(logData, 'Request completed');
    }
  });

  // Log errors
  app.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const ctx = requestContext.getStore();

    request.log.error(
      {
        requestId: request.id,
        err: error,
        userId: ctx?.userId,
        matchId: ctx?.matchId,
        stack: error.stack,
      },
      'Request error'
    );
  });
}

/**
 * Middleware to wrap route handler in async local storage context
 * Use this for routes that need context-aware logging throughout
 */
export function withRequestContext<T>(
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<T>
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<T> => {
    const requestId = request.id as string;
    const contextLogger = request.log;

    return requestContext.run(
      {
        requestId,
        logger: contextLogger,
        userId: (request as any).user?.id,
      },
      () => handler(request, reply)
    );
  };
}
