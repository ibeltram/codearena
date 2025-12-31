/**
 * Match Events Manager
 *
 * Manages WebSocket and SSE connections for real-time match events.
 * Provides pub/sub functionality for match state changes.
 */

import type { WebSocket } from '@fastify/websocket';
import { FastifyReply } from 'fastify';
import { MatchEvent, MatchEventType, onMatchEvent, getMatchState } from './match-state-machine';
import { logger } from './logger';
import { getRedis, getSubscriber, CHANNELS } from './redis';

// Client connection types
type ConnectionType = 'websocket' | 'sse';

interface ClientConnection {
  type: ConnectionType;
  matchId: string;
  userId: string;
  connectedAt: Date;
  lastPingAt: Date;
  // WebSocket specific
  socket?: WebSocket;
  // SSE specific
  reply?: FastifyReply;
}

// Connection store: matchId -> Set of client connections
const connections = new Map<string, Set<ClientConnection>>();

// User connection lookup: userId -> matchId (for quick lookup)
const userConnections = new Map<string, string>();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// Ping timeout (60 seconds)
const PING_TIMEOUT = 60000;

/**
 * Wire event types for client communication
 */
export type WireEventType =
  | 'connected'
  | 'state_change'
  | 'timer_tick'
  | 'timer_warning'
  | 'participant_joined'
  | 'participant_ready'
  | 'participant_forfeited'
  | 'submission_received'
  | 'submission_locked'
  | 'judging_started'
  | 'judging_complete'
  | 'match_finalized'
  | 'error'
  | 'ping'
  | 'pong';

/**
 * Wire event payload sent to clients
 */
export interface WireEvent {
  type: WireEventType;
  matchId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/**
 * Map internal event types to wire event types
 */
function mapEventType(type: MatchEventType): WireEventType {
  const mapping: Record<MatchEventType, WireEventType> = {
    'match.created': 'state_change',
    'match.opened': 'state_change',
    'match.matched': 'state_change',
    'match.started': 'state_change',
    'match.submissions_locked': 'submission_locked',
    'match.judging_started': 'judging_started',
    'match.finalized': 'match_finalized',
    'match.archived': 'state_change',
    'match.cancelled': 'state_change',
    'match.forfeited': 'state_change',
    'participant.joined': 'participant_joined',
    'participant.ready': 'participant_ready',
    'participant.forfeited': 'participant_forfeited',
    'timer.warning': 'timer_warning',
    'timer.expired': 'timer_tick',
  };
  return mapping[type] || 'state_change';
}

/**
 * Create a wire event from internal event
 */
function createWireEvent(event: MatchEvent): WireEvent {
  return {
    type: mapEventType(event.type),
    matchId: event.matchId,
    timestamp: event.timestamp.toISOString(),
    data: event.data,
  };
}

/**
 * Send event to a client connection
 */
async function sendToClient(client: ClientConnection, event: WireEvent): Promise<boolean> {
  const message = JSON.stringify(event);

  try {
    if (client.type === 'websocket' && client.socket) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(message);
        return true;
      }
    } else if (client.type === 'sse' && client.reply) {
      if (!client.reply.raw.writableEnded) {
        client.reply.raw.write(`data: ${message}\n\n`);
        return true;
      }
    }
  } catch (error) {
    logger.error({ error, clientType: client.type, matchId: client.matchId }, 'Error sending to client');
  }

  return false;
}

/**
 * Broadcast event to all connections for a match
 */
async function broadcastToMatch(matchId: string, event: WireEvent): Promise<void> {
  const matchConnections = connections.get(matchId);
  if (!matchConnections || matchConnections.size === 0) {
    return;
  }

  const deadConnections: ClientConnection[] = [];

  for (const client of matchConnections) {
    const sent = await sendToClient(client, event);
    if (!sent) {
      deadConnections.push(client);
    }
  }

  // Clean up dead connections
  for (const client of deadConnections) {
    removeConnection(client);
  }
}

/**
 * Add a new client connection
 */
export async function addConnection(client: ClientConnection): Promise<void> {
  const isFirstConnection = !connections.has(client.matchId) || connections.get(client.matchId)!.size === 0;

  if (!connections.has(client.matchId)) {
    connections.set(client.matchId, new Set());
  }

  connections.get(client.matchId)!.add(client);
  userConnections.set(client.userId, client.matchId);

  // Subscribe to Redis channel for this match if first connection
  if (isFirstConnection) {
    await subscribeToMatchChannel(client.matchId);
  }

  logger.info(
    { matchId: client.matchId, userId: client.userId, type: client.type },
    'Client connected to match events'
  );
}

/**
 * Remove a client connection
 */
export async function removeConnection(client: ClientConnection): Promise<void> {
  const matchConnections = connections.get(client.matchId);
  if (matchConnections) {
    matchConnections.delete(client);
    if (matchConnections.size === 0) {
      connections.delete(client.matchId);
      // Unsubscribe from Redis channel when no more local connections
      await unsubscribeFromMatchChannel(client.matchId);
    }
  }

  userConnections.delete(client.userId);

  logger.info(
    { matchId: client.matchId, userId: client.userId, type: client.type },
    'Client disconnected from match events'
  );
}

/**
 * Get connection count for a match
 */
export function getMatchConnectionCount(matchId: string): number {
  return connections.get(matchId)?.size || 0;
}

/**
 * Check if user is connected to a match
 */
export function isUserConnected(userId: string, matchId: string): boolean {
  return userConnections.get(userId) === matchId;
}

/**
 * Handle WebSocket connection
 */
export function handleWebSocketConnection(
  socket: WebSocket,
  matchId: string,
  userId: string
): void {
  const client: ClientConnection = {
    type: 'websocket',
    matchId,
    userId,
    connectedAt: new Date(),
    lastPingAt: new Date(),
    socket,
  };

  addConnection(client);

  // Send initial state
  sendInitialState(client);

  // Handle incoming messages (ping/pong)
  socket.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'ping') {
        client.lastPingAt = new Date();
        sendToClient(client, {
          type: 'pong',
          matchId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      // Ignore invalid messages
    }
  });

  // Handle close
  socket.on('close', () => {
    removeConnection(client);
  });

  // Handle error
  socket.on('error', (error) => {
    logger.error({ error, matchId, userId }, 'WebSocket error');
    removeConnection(client);
  });
}

/**
 * Handle SSE connection
 */
export function handleSSEConnection(
  reply: FastifyReply,
  matchId: string,
  userId: string
): void {
  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const client: ClientConnection = {
    type: 'sse',
    matchId,
    userId,
    connectedAt: new Date(),
    lastPingAt: new Date(),
    reply,
  };

  addConnection(client);

  // Send initial state
  sendInitialState(client);

  // Handle close
  reply.raw.on('close', () => {
    removeConnection(client);
  });

  // Keep-alive ping every 15 seconds for SSE
  const keepAliveInterval = setInterval(() => {
    if (!reply.raw.writableEnded) {
      reply.raw.write(': keep-alive\n\n');
    } else {
      clearInterval(keepAliveInterval);
      removeConnection(client);
    }
  }, 15000);
}

/**
 * Send initial match state to newly connected client
 */
async function sendInitialState(client: ClientConnection): Promise<void> {
  try {
    const state = await getMatchState(client.matchId);

    if (!state) {
      await sendToClient(client, {
        type: 'error',
        matchId: client.matchId,
        timestamp: new Date().toISOString(),
        data: { error: 'Match not found' },
      });
      return;
    }

    await sendToClient(client, {
      type: 'connected',
      matchId: client.matchId,
      timestamp: new Date().toISOString(),
      data: {
        status: state.status,
        participants: state.participants,
        timer: state.timer,
      },
    });
  } catch (error) {
    logger.error({ error, matchId: client.matchId }, 'Error sending initial state');
  }
}

/**
 * Start timer tick broadcasts for active matches
 */
const timerIntervals = new Map<string, NodeJS.Timeout>();

export function startTimerBroadcast(matchId: string, endAt: Date): void {
  // Clear existing interval if any
  stopTimerBroadcast(matchId);

  // Broadcast timer every second
  const interval = setInterval(async () => {
    const now = Date.now();
    const remaining = Math.max(0, endAt.getTime() - now);

    if (remaining === 0) {
      stopTimerBroadcast(matchId);
      return;
    }

    // Check for warnings (5 min, 1 min, 30 sec, 10 sec)
    const warnings = [300000, 60000, 30000, 10000];
    const isWarning = warnings.some((w) => remaining <= w && remaining > w - 1000);

    await broadcastToMatch(matchId, {
      type: isWarning ? 'timer_warning' : 'timer_tick',
      matchId,
      timestamp: new Date().toISOString(),
      data: {
        remainingMs: remaining,
        endAt: endAt.toISOString(),
        isWarning,
      },
    });
  }, 1000);

  timerIntervals.set(matchId, interval);
}

export function stopTimerBroadcast(matchId: string): void {
  const interval = timerIntervals.get(matchId);
  if (interval) {
    clearInterval(interval);
    timerIntervals.delete(matchId);
  }
}

/**
 * Publish event to Redis for multi-instance support
 */
async function publishToRedis(matchId: string, wireEvent: WireEvent): Promise<void> {
  try {
    const redis = getRedis();
    // Publish to match-specific channel for targeted delivery
    const channel = `${CHANNELS.MATCH_UPDATES}:${matchId}`;
    await redis.publish(channel, JSON.stringify(wireEvent));
  } catch (error) {
    logger.error({ error, matchId }, 'Failed to publish to Redis');
  }
}

/**
 * Handle incoming Redis message and broadcast to local connections
 */
function handleRedisMessage(channel: string, message: string): void {
  try {
    // Extract matchId from channel (format: match:updates:${matchId})
    const parts = channel.split(':');
    const matchId = parts[parts.length - 1];

    if (!matchId) return;

    const event: WireEvent = JSON.parse(message);

    // Only broadcast to local connections (avoid duplicate sends)
    broadcastToMatchLocal(matchId, event);
  } catch (error) {
    logger.error({ error, channel }, 'Failed to handle Redis message');
  }
}

/**
 * Broadcast event to local connections only (used by Redis subscriber)
 */
async function broadcastToMatchLocal(matchId: string, event: WireEvent): Promise<void> {
  const matchConnections = connections.get(matchId);
  if (!matchConnections || matchConnections.size === 0) {
    return;
  }

  const deadConnections: ClientConnection[] = [];

  for (const client of matchConnections) {
    const sent = await sendToClient(client, event);
    if (!sent) {
      deadConnections.push(client);
    }
  }

  // Clean up dead connections
  for (const client of deadConnections) {
    removeConnection(client);
  }
}

// Track active subscriptions
const activeSubscriptions = new Set<string>();

/**
 * Subscribe to Redis channel for a match
 */
async function subscribeToMatchChannel(matchId: string): Promise<void> {
  const channel = `${CHANNELS.MATCH_UPDATES}:${matchId}`;

  if (activeSubscriptions.has(channel)) {
    return; // Already subscribed
  }

  try {
    const subscriber = getSubscriber();

    // Set up message handler if not already done
    if (activeSubscriptions.size === 0) {
      subscriber.on('message', handleRedisMessage);
    }

    await subscriber.subscribe(channel);
    activeSubscriptions.add(channel);
    logger.info({ matchId, channel }, 'Subscribed to match channel');
  } catch (error) {
    logger.error({ error, matchId }, 'Failed to subscribe to match channel');
  }
}

/**
 * Unsubscribe from Redis channel for a match
 */
async function unsubscribeFromMatchChannel(matchId: string): Promise<void> {
  const channel = `${CHANNELS.MATCH_UPDATES}:${matchId}`;

  if (!activeSubscriptions.has(channel)) {
    return; // Not subscribed
  }

  // Only unsubscribe if no local connections
  const matchConnections = connections.get(matchId);
  if (matchConnections && matchConnections.size > 0) {
    return; // Still have local connections
  }

  try {
    const subscriber = getSubscriber();
    await subscriber.unsubscribe(channel);
    activeSubscriptions.delete(channel);
    logger.info({ matchId, channel }, 'Unsubscribed from match channel');
  } catch (error) {
    logger.error({ error, matchId }, 'Failed to unsubscribe from match channel');
  }
}

/**
 * Initialize match events system
 * Subscribe to state machine events and broadcast to connected clients
 * Uses Redis pub/sub for multi-instance support
 */
export function initializeMatchEvents(): void {
  // Subscribe to all match events from state machine
  onMatchEvent(async (event: MatchEvent) => {
    const wireEvent = createWireEvent(event);

    // Publish to Redis for multi-instance distribution
    await publishToRedis(event.matchId, wireEvent);

    // Also broadcast locally for single-instance efficiency
    await broadcastToMatchLocal(event.matchId, wireEvent);

    // Handle timer broadcasts based on events
    if (event.type === 'match.started' && event.data?.endAt) {
      startTimerBroadcast(event.matchId, new Date(event.data.endAt as string));
    } else if (
      event.type === 'match.submissions_locked' ||
      event.type === 'match.finalized' ||
      event.type === 'match.cancelled'
    ) {
      stopTimerBroadcast(event.matchId);
    }
  });

  logger.info('Match events system initialized with Redis pub/sub support');
}

/**
 * Cleanup all connections (for graceful shutdown)
 */
export async function cleanupAllConnections(): Promise<void> {
  // Stop all timer broadcasts
  for (const matchId of timerIntervals.keys()) {
    stopTimerBroadcast(matchId);
  }

  // Close all connections
  for (const [matchId, matchConnections] of connections) {
    for (const client of matchConnections) {
      if (client.type === 'websocket' && client.socket) {
        client.socket.close(1000, 'Server shutting down');
      } else if (client.type === 'sse' && client.reply) {
        client.reply.raw.end();
      }
    }
    matchConnections.clear();
  }
  connections.clear();
  userConnections.clear();

  // Unsubscribe from all Redis channels
  try {
    const subscriber = getSubscriber();
    for (const channel of activeSubscriptions) {
      await subscriber.unsubscribe(channel);
    }
    activeSubscriptions.clear();
  } catch (error) {
    logger.error({ error }, 'Error cleaning up Redis subscriptions');
  }

  logger.info('All match event connections cleaned up');
}
