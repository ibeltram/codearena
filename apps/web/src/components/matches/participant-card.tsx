'use client';

import { Check, Clock, Flag, User, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MatchParticipant } from '@/types/match';

interface ParticipantCardProps {
  participant: MatchParticipant;
  isCurrentUser?: boolean;
  matchStatus: string;
}

export function ParticipantCard({ participant, isCurrentUser, matchStatus }: ParticipantCardProps) {
  const { user, seat, readyAt, submissionId, forfeitAt } = participant;

  // Determine participant status
  let status: 'waiting' | 'ready' | 'submitted' | 'forfeited' = 'waiting';
  if (forfeitAt) {
    status = 'forfeited';
  } else if (submissionId) {
    status = 'submitted';
  } else if (readyAt) {
    status = 'ready';
  }

  const statusConfig = {
    waiting: {
      icon: Clock,
      label: 'Waiting',
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
    ready: {
      icon: Check,
      label: 'Ready',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    submitted: {
      icon: Check,
      label: 'Submitted',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    forfeited: {
      icon: Flag,
      label: 'Forfeited',
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Card
      className={cn(
        'relative overflow-hidden',
        isCurrentUser && 'ring-2 ring-primary'
      )}
    >
      {/* Seat indicator */}
      <div
        className={cn(
          'absolute top-0 left-0 w-1 h-full',
          seat === 'A' ? 'bg-blue-500' : 'bg-orange-500'
        )}
      />

      <CardContent className="p-4 pl-5">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <Avatar className="h-14 w-14">
            <AvatarImage src={user.avatarUrl || undefined} alt={user.displayName} />
            <AvatarFallback>
              <User className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>

          {/* User info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{user.displayName}</h3>
              {isCurrentUser && (
                <Badge variant="outline" className="text-xs">
                  You
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                Seat {seat}
              </Badge>
            </div>
          </div>

          {/* Status */}
          <div className={cn('flex flex-col items-center gap-1', config.color)}>
            <div className={cn('p-2 rounded-full', config.bgColor)}>
              {matchStatus === 'matched' && status === 'waiting' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <StatusIcon className="h-5 w-5" />
              )}
            </div>
            <span className="text-xs font-medium">{config.label}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Empty participant slot
export function EmptyParticipantSlot({ seat }: { seat: 'A' | 'B' }) {
  return (
    <Card className="relative overflow-hidden border-dashed">
      <div
        className={cn(
          'absolute top-0 left-0 w-1 h-full opacity-50',
          seat === 'A' ? 'bg-blue-500' : 'bg-orange-500'
        )}
      />

      <CardContent className="p-4 pl-5">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-muted-foreground">
              Waiting for opponent...
            </h3>
            <Badge variant="secondary" className="text-xs mt-1">
              Seat {seat}
            </Badge>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
