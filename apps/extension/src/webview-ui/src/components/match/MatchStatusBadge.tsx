import React from 'react';
import { Badge } from '../ui';
import type { BadgeVariant } from '../ui/Badge';
import './MatchStatusBadge.css';

export type MatchStatus =
  | 'created'
  | 'open'
  | 'matched'
  | 'in_progress'
  | 'submission_locked'
  | 'judging'
  | 'finalized'
  | 'archived';

export interface MatchStatusBadgeProps {
  /** Current match status */
  status: MatchStatus;
  /** Additional CSS class names */
  className?: string;
}

/**
 * MatchStatusBadge - Display current match status with semantic colors
 *
 * Status to color mapping:
 * - created/open: info (blue) - waiting states
 * - matched: warning (yellow) - ready to start
 * - in_progress: success (green) - active
 * - submission_locked: warning (orange) - pending
 * - judging: info (purple) - processing
 * - finalized/archived: muted (gray) - complete
 */
export function MatchStatusBadge({ status, className = '' }: MatchStatusBadgeProps) {
  const statusConfig: Record<MatchStatus, { label: string; variant: BadgeVariant }> = {
    created: { label: 'Created', variant: 'muted' },
    open: { label: 'Open', variant: 'info' },
    matched: { label: 'Matched', variant: 'warning' },
    in_progress: { label: 'In Progress', variant: 'success' },
    submission_locked: { label: 'Locked', variant: 'warning' },
    judging: { label: 'Judging', variant: 'info' },
    finalized: { label: 'Finalized', variant: 'muted' },
    archived: { label: 'Archived', variant: 'muted' },
  };

  const config = statusConfig[status] || { label: status, variant: 'default' as BadgeVariant };

  return (
    <Badge
      variant={config.variant}
      className={`match-status-badge match-status-badge--${status} ${className}`}
    >
      {config.label}
    </Badge>
  );
}

export default MatchStatusBadge;
