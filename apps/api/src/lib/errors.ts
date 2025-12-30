import { FastifyError } from 'fastify';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// Common error types
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      404
    );
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super('RATE_LIMITED', message, 429);
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super('INTERNAL_ERROR', message, 500);
  }
}

// Error handler for Fastify
export function formatError(error: FastifyError | AppError | Error) {
  if (error instanceof AppError) {
    return error.toJSON();
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          issues: error.validation,
        },
      },
    };
  }

  // Handle Zod errors
  if (error.name === 'ZodError') {
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          issues: (error as unknown as { issues: unknown[] }).issues,
        },
      },
    };
  }

  // Generic error
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : error.message,
    },
  };
}
