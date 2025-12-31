'use client';

import { Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react';
import {
  ConnectionStatus,
  getConnectionStatusColor,
  getConnectionStatusText,
} from '@/hooks/use-match-events';
import { cn } from '@/lib/utils';

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  reconnectAttempts?: number;
  className?: string;
  showLabel?: boolean;
}

export function ConnectionStatusIndicator({
  status,
  reconnectAttempts = 0,
  className,
  showLabel = false,
}: ConnectionStatusIndicatorProps) {
  const statusText = getConnectionStatusText(status);

  const Icon = () => {
    switch (status) {
      case 'connected':
        return <Wifi className="h-4 w-4" />;
      case 'connecting':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      case 'disconnected':
      default:
        return <WifiOff className="h-4 w-4" />;
    }
  };

  const titleText = status === 'error' && reconnectAttempts > 0
    ? `${statusText} (Attempt ${reconnectAttempts})`
    : statusText;

  return (
    <div
      className={cn('flex items-center gap-2 cursor-help', className)}
      title={titleText}
    >
      <div className={cn(
        'relative flex items-center justify-center rounded-full p-1',
        status === 'connected' && 'text-green-500',
        status === 'connecting' && 'text-yellow-500',
        status === 'error' && 'text-red-500',
        status === 'disconnected' && 'text-gray-500'
      )}>
        <Icon />
        {/* Pulse indicator for connected state */}
        {status === 'connected' && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}
      </div>
      {showLabel && (
        <span className={cn(
          'text-xs font-medium',
          status === 'connected' && 'text-green-500',
          status === 'connecting' && 'text-yellow-500',
          status === 'error' && 'text-red-500',
          status === 'disconnected' && 'text-gray-500'
        )}>
          {statusText}
        </span>
      )}
    </div>
  );
}

interface LiveBadgeProps {
  isLive: boolean;
  className?: string;
}

export function LiveBadge({ isLive, className }: LiveBadgeProps) {
  if (!isLive) return null;

  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-xs font-medium',
      className
    )}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
      LIVE
    </div>
  );
}
