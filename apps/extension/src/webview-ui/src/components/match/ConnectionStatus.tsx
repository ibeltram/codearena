import React from 'react';
import './ConnectionStatus.css';

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export interface ConnectionStatusProps {
  /** Current connection state */
  state: ConnectionState;
  /** Additional CSS class names */
  className?: string;
  /** Whether to show the label text */
  showLabel?: boolean;
}

/**
 * ConnectionStatus - SSE connection state indicator
 *
 * Displays the current connection state with a colored dot and optional label.
 * Used to show real-time connection status in the match panel.
 *
 * States:
 * - connected: Green dot, "Connected"
 * - disconnected: Red dot, "Disconnected"
 * - reconnecting: Yellow dot with pulse animation, "Reconnecting..."
 */
export function ConnectionStatus({
  state,
  className = '',
  showLabel = true,
}: ConnectionStatusProps) {
  const labels: Record<ConnectionState, string> = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    reconnecting: 'Reconnecting...',
  };

  const classNames = ['connection-status', `connection-status--${state}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classNames} title={labels[state]} aria-label={labels[state]}>
      <span className="connection-status__dot" aria-hidden="true" />
      {showLabel && <span className="connection-status__label">{labels[state]}</span>}
    </span>
  );
}

export default ConnectionStatus;
