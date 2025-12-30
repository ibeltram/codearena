/**
 * Match Events Routes
 *
 * Provides WebSocket and SSE endpoints for real-time match event streaming.
 *
 * Endpoints:
 * - GET /api/matches/:id/events (WebSocket upgrade or SSE fallback)
 * - GET /api/matches/:id/events/sse (SSE only)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import {
  handleWebSocketConnection,
  handleSSEConnection,
  getMatchConnectionCount,
} from '../lib/match-events';
import { getMatchState } from '../lib/match-state-machine';

// Request params schema
const matchIdSchema = z.object({
  id: z.string().uuid(),
});

// Query params for optional user ID (in production, would come from auth)
const querySchema = z.object({
  userId: z.string().uuid().optional(),
});

/**
 * Validate match exists and user is participant
 */
async function validateAccess(
  matchId: string,
  userId: string
): Promise<{ valid: boolean; error?: string }> {
  const state = await getMatchState(matchId);

  if (!state) {
    return { valid: false, error: 'Match not found' };
  }

  // Check if user is a participant
  const isParticipant = state.participants.some((p) => p.userId === userId);

  // For now, allow any authenticated user to watch
  // In production, might restrict to participants only for in-progress matches
  if (!isParticipant && ['in_progress', 'submission_locked'].includes(state.status)) {
    // Allow viewing but could add restrictions here
  }

  return { valid: true };
}

export async function matchEventRoutes(app: FastifyInstance) {
  // Register WebSocket plugin
  await app.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB max payload
      clientTracking: false, // We handle tracking ourselves
    },
  });

  /**
   * WebSocket/SSE endpoint for match events
   * Attempts WebSocket upgrade, falls back to SSE if not available
   */
  app.get(
    '/api/matches/:id/events',
    {
      websocket: true,
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (connection, request) => {
      // Parse and validate params
      const paramsResult = matchIdSchema.safeParse(request.params);
      const queryResult = querySchema.safeParse(request.query);

      if (!paramsResult.success) {
        connection.socket.close(4000, 'Invalid match ID');
        return;
      }

      const matchId = paramsResult.data.id;
      // In production, get userId from authenticated session
      const userId = queryResult.success && queryResult.data.userId
        ? queryResult.data.userId
        : 'anonymous';

      // Validate access
      const access = await validateAccess(matchId, userId);
      if (!access.valid) {
        connection.socket.close(4001, access.error || 'Access denied');
        return;
      }

      // Handle WebSocket connection
      handleWebSocketConnection(connection.socket, matchId, userId);
    }
  );

  /**
   * SSE-only endpoint for match events (fallback for browsers without WebSocket)
   */
  app.get(
    '/api/matches/:id/events/sse',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Parse and validate params
      const paramsResult = matchIdSchema.safeParse(request.params);
      const queryResult = querySchema.safeParse(request.query);

      if (!paramsResult.success) {
        return reply.status(400).send({ error: 'Invalid match ID' });
      }

      const matchId = paramsResult.data.id;
      // In production, get userId from authenticated session
      const userId = queryResult.success && queryResult.data.userId
        ? queryResult.data.userId
        : 'anonymous';

      // Validate access
      const access = await validateAccess(matchId, userId);
      if (!access.valid) {
        return reply.status(access.error === 'Match not found' ? 404 : 403)
          .send({ error: access.error });
      }

      // Handle SSE connection (this takes over the response)
      handleSSEConnection(reply, matchId, userId);
    }
  );

  /**
   * Get current match state (REST endpoint for initial load)
   */
  app.get(
    '/api/matches/:id/state',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  participants: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        userId: { type: 'string' },
                        seat: { type: 'string' },
                        isReady: { type: 'boolean' },
                        hasForfeited: { type: 'boolean' },
                      },
                    },
                  },
                  timer: {
                    type: 'object',
                    properties: {
                      startAt: { type: ['string', 'null'] },
                      endAt: { type: ['string', 'null'] },
                      lockAt: { type: ['string', 'null'] },
                      remainingMs: { type: ['number', 'null'] },
                    },
                  },
                  connectionCount: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsResult = matchIdSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({ error: 'Invalid match ID' });
      }

      const matchId = paramsResult.data.id;
      const state = await getMatchState(matchId);

      if (!state) {
        return reply.status(404).send({ error: 'Match not found' });
      }

      return {
        data: {
          ...state,
          timer: {
            ...state.timer,
            startAt: state.timer.startAt?.toISOString() || null,
            endAt: state.timer.endAt?.toISOString() || null,
            lockAt: state.timer.lockAt?.toISOString() || null,
          },
          connectionCount: getMatchConnectionCount(matchId),
        },
      };
    }
  );
}
