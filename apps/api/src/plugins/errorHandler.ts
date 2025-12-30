import { FastifyInstance } from 'fastify';

import { AppError, formatError } from '../lib/errors';

export async function registerErrorHandler(app: FastifyInstance) {
  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    // Log the error
    if (error instanceof AppError && error.statusCode < 500) {
      request.log.warn({ err: error, requestId }, 'Client error');
    } else {
      request.log.error({ err: error, requestId }, 'Server error');
    }

    // Determine status code
    const statusCode = error instanceof AppError
      ? error.statusCode
      : (error.statusCode || 500);

    // Send formatted response
    reply.status(statusCode).send(formatError(error));
  });

  // Not found handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
}
