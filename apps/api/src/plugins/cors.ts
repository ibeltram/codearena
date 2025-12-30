import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';

import { env } from '../lib/env';

export async function registerCors(app: FastifyInstance) {
  await app.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? [env.WEB_URL]
      : true, // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });
}
