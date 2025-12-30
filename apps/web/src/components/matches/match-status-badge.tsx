'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MatchStatus, MatchMode } from '@/types/match';
import { statusLabels, statusColors, modeLabels, modeColors } from '@/types/match';

interface MatchStatusBadgeProps {
  status: MatchStatus;
  className?: string;
}

export function MatchStatusBadge({ status, className }: MatchStatusBadgeProps) {
  return (
    <Badge
      className={cn(
        'text-white',
        statusColors[status],
        className
      )}
    >
      {statusLabels[status]}
    </Badge>
  );
}

interface MatchModeBadgeProps {
  mode: MatchMode;
  className?: string;
}

export function MatchModeBadge({ mode, className }: MatchModeBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(className)}
    >
      {modeLabels[mode]}
    </Badge>
  );
}
