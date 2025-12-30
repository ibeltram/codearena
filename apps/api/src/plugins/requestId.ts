import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';

export async function registerRequestId(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    // Use provided request ID or generate a new one
    const requestId = (request.headers['x-request-id'] as string) || randomUUID();

    // Store request ID
    request.id = requestId;

    // Add to response headers
    reply.header('X-Request-ID', requestId);

    // Add to logger context
    request.log = request.log.child({ requestId });
  });
}
