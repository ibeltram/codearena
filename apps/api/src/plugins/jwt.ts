/**
 * JWT Plugin
 *
 * Registers @fastify/jwt for signing and verifying access tokens.
 */

import jwt from '@fastify/jwt';
import { FastifyInstance } from 'fastify';
import { env } from '../lib/env';

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
}
