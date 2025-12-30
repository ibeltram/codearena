'use client';

import { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MatchTimerProps {
  endAt: string | null;
  startAt: string | null;
  status: string;
  className?: string;
}

export function MatchTimer({ endAt, startAt, status, className }: MatchTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!endAt || status !== 'in_progress') {
      setTimeRemaining(null);
      return;
    }

    const calculateRemaining = () => {
      const now = Date.now();
      const end = new Date(endAt).getTime();
      const remaining = Math.max(0, end - now);
      setTimeRemaining(remaining);
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);

    return () => clearInterval(interval);
  }, [endAt, status]);

  if (timeRemaining === null) {
    if (status === 'matched') {
      return (
        <div className={cn('flex items-center gap-2 text-blue-500', className)}>
          <Clock className="h-5 w-5" />
          <span className="font-mono text-lg">Waiting to start...</span>
        </div>
      );
    }
    if (status === 'finalized' || status === 'archived') {
      return (
        <div className={cn('flex items-center gap-2 text-muted-foreground', className)}>
          <Clock className="h-5 w-5" />
          <span className="font-mono text-lg">Match ended</span>
        </div>
      );
    }
    return null;
  }

  const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

  const isUrgent = timeRemaining < 5 * 60 * 1000; // Less than 5 minutes
  const isCritical = timeRemaining < 60 * 1000; // Less than 1 minute

  const formatTime = (value: number) => value.toString().padStart(2, '0');

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        isCritical && 'text-red-500 animate-pulse',
        isUrgent && !isCritical && 'text-orange-500',
        !isUrgent && 'text-green-500',
        className
      )}
    >
      {isCritical ? (
        <AlertTriangle className="h-5 w-5" />
      ) : (
        <Clock className="h-5 w-5" />
      )}
      <span className="font-mono text-2xl font-bold">
        {hours > 0 && `${formatTime(hours)}:`}
        {formatTime(minutes)}:{formatTime(seconds)}
      </span>
    </div>
  );
}
