/**
 * JWT Plugin
 *
 * Registers @fastify/jwt for signing and verifying access tokens.
 * Also decorates the Fastify instance with an authenticate preHandler.
 */

import jwt from '@fastify/jwt';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../lib/env';
import { verifyAccessToken } from '../lib/session';

// Extend FastifyInstance to include the authenticate decorator
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: {
      id: string;
      sessionId?: string;
    };
  }
}

export async function registerJwt(app: FastifyInstance): Promise<void> {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      algorithm: 'HS256',
    },
    verify: {
      algorithms: ['HS256'],
    },
  });

  // Decorate with authenticate preHandler
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix
    const payload = await verifyAccessToken(app, token);

    if (!payload) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Invalid or expired access token',
      });
    }

    // Attach user info to request
    request.user = {
      id: payload.sub,
      sessionId: payload.sessionId,
    };
  });
}
