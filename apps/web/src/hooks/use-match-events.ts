'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * SSE event types from the server
 */
export type MatchEventType =
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
 * SSE event payload
 */
export interface MatchEvent {
  type: MatchEventType;
  matchId: string;
  timestamp: string;
  data?: {
    status?: string;
    participants?: Array<{
      id: string;
      oderId: string;
      username: string;
      isReady: boolean;
      hasSubmitted: boolean;
    }>;
    timer?: {
      startAt: string;
      endAt: string;
      remainingMs: number;
    };
    remainingMs?: number;
    endAt?: string;
    isWarning?: boolean;
    error?: string;
    [key: string]: unknown;
  };
}

/**
 * Connection status
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Hook options
 */
export interface UseMatchEventsOptions {
  /** Whether to enable the connection */
  enabled?: boolean;
  /** User ID for authentication */
  userId?: string;
  /** Callback when event is received */
  onEvent?: (event: MatchEvent) => void;
  /** Callback when timer ticks */
  onTimerTick?: (remainingMs: number, isWarning: boolean) => void;
  /** Callback when match state changes */
  onStateChange?: (status: string) => void;
  /** Callback when connection status changes */
  onConnectionChange?: (status: ConnectionStatus) => void;
  /** Max reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Base reconnection delay in ms (default: 1000) */
  baseReconnectDelay?: number;
}

/**
 * Hook return value
 */
export interface UseMatchEventsReturn {
  /** Current connection status */
  connectionStatus: ConnectionStatus;
  /** Latest event received */
  lastEvent: MatchEvent | null;
  /** Current timer remaining in ms */
  timerRemaining: number | null;
  /** Whether timer is in warning state */
  timerWarning: boolean;
  /** Manually disconnect */
  disconnect: () => void;
  /** Manually reconnect */
  reconnect: () => void;
  /** Number of reconnect attempts */
  reconnectAttempts: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

/**
 * Hook for subscribing to real-time match events via SSE
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection status tracking
 * - Timer state management
 * - React Query cache invalidation on events
 */
export function useMatchEvents(
  matchId: string | undefined,
  options: UseMatchEventsOptions = {}
): UseMatchEventsReturn {
  const {
    enabled = true,
    userId,
    onEvent,
    onTimerTick,
    onStateChange,
    onConnectionChange,
    maxReconnectAttempts = 10,
    baseReconnectDelay = 1000,
  } = options;

  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const manualDisconnectRef = useRef(false);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<MatchEvent | null>(null);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [timerWarning, setTimerWarning] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Update connection status and notify callback
  const updateConnectionStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    onConnectionChange?.(status);
  }, [onConnectionChange]);

  // Handle incoming SSE event
  const handleEvent = useCallback((event: MatchEvent) => {
    setLastEvent(event);
    onEvent?.(event);

    // Handle specific event types
    switch (event.type) {
      case 'connected':
        updateConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0);
        break;

      case 'timer_tick':
      case 'timer_warning':
        if (event.data?.remainingMs !== undefined) {
          const remaining = event.data.remainingMs;
          const isWarning = event.data.isWarning ?? event.type === 'timer_warning';
          setTimerRemaining(remaining);
          setTimerWarning(isWarning);
          onTimerTick?.(remaining, isWarning);
        }
        break;

      case 'state_change':
      case 'match_finalized':
        if (event.data?.status) {
          onStateChange?.(event.data.status);
          // Invalidate match query to refresh data
          queryClient.invalidateQueries({ queryKey: ['match', matchId] });
        }
        break;

      case 'participant_joined':
      case 'participant_ready':
      case 'participant_forfeited':
        // Invalidate match query to update participant list
        queryClient.invalidateQueries({ queryKey: ['match', matchId] });
        break;

      case 'submission_received':
      case 'submission_locked':
        // Invalidate match and submissions queries
        queryClient.invalidateQueries({ queryKey: ['match', matchId] });
        queryClient.invalidateQueries({ queryKey: ['submissions', matchId] });
        break;

      case 'judging_started':
      case 'judging_complete':
        // Invalidate match query
        queryClient.invalidateQueries({ queryKey: ['match', matchId] });
        break;

      case 'error':
        console.error('[SSE] Server error:', event.data?.error);
        break;
    }
  }, [matchId, onEvent, onTimerTick, onStateChange, queryClient, updateConnectionStatus]);

  // Connect to SSE endpoint
  const connect = useCallback(() => {
    if (!matchId || !enabled) return;

    // Clear any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    manualDisconnectRef.current = false;
    updateConnectionStatus('connecting');

    // Build URL with optional userId
    const url = new URL(`${API_BASE}/api/matches/${matchId}/events/sse`);
    if (userId) {
      url.searchParams.set('userId', userId);
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Connection opened');
      // Status will be updated when we receive 'connected' event
    };

    eventSource.onmessage = (e) => {
      try {
        const event: MatchEvent = JSON.parse(e.data);
        handleEvent(event);
      } catch (err) {
        console.error('[SSE] Failed to parse event:', err);
      }
    };

    eventSource.onerror = (e) => {
      console.error('[SSE] Connection error:', e);
      eventSource.close();
      eventSourceRef.current = null;

      if (manualDisconnectRef.current) {
        updateConnectionStatus('disconnected');
        return;
      }

      updateConnectionStatus('error');

      // Attempt reconnection with exponential backoff
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(
          baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
          30000 // Max 30 seconds
        );

        console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          setReconnectAttempts(reconnectAttemptsRef.current);
          connect();
        }, delay);
      } else {
        console.error('[SSE] Max reconnection attempts reached');
        updateConnectionStatus('disconnected');
      }
    };
  }, [matchId, enabled, userId, handleEvent, updateConnectionStatus, maxReconnectAttempts, baseReconnectDelay]);

  // Disconnect from SSE
  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
    updateConnectionStatus('disconnected');
  }, [updateConnectionStatus]);

  // Reconnect manually
  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
    // Small delay before reconnecting
    setTimeout(connect, 100);
  }, [connect, disconnect]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (enabled && matchId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [matchId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connectionStatus,
    lastEvent,
    timerRemaining,
    timerWarning,
    disconnect,
    reconnect,
    reconnectAttempts,
  };
}

/**
 * Connection status indicator component helper
 */
export function getConnectionStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'bg-green-500';
    case 'connecting':
      return 'bg-yellow-500 animate-pulse';
    case 'error':
      return 'bg-red-500';
    case 'disconnected':
    default:
      return 'bg-gray-500';
  }
}

export function getConnectionStatusText(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'error':
      return 'Connection error';
    case 'disconnected':
    default:
      return 'Disconnected';
  }
}
