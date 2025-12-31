import cookie from '@fastify/cookie';
import { FastifyInstance } from 'fastify';

import { env } from '../lib/env';

/**
 * Register the cookie plugin for Fastify
 * This enables cookie parsing and setting for auth flows
 */
export async function registerCookie(app: FastifyInstance) {
  await app.register(cookie, {
    secret: env.JWT_SECRET, // Used to sign cookies if needed
    parseOptions: {
      // Default parse options
    },
  });
}
