'use client';

/**
 * CompareHeader Component
 *
 * Header showing score comparison between two participants.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import type { MatchComparison, SubmissionScore } from '@/types/artifact';

interface CompareHeaderProps {
  comparison: MatchComparison;
  className?: string;
}

export function CompareHeader({ comparison, className }: CompareHeaderProps) {
  const { leftParticipant, rightParticipant } = comparison;

  return (
    <div className={cn('grid grid-cols-2 gap-4', className)}>
      {/* Left Participant */}
      <ParticipantCard
        displayName={leftParticipant.displayName}
        avatarUrl={leftParticipant.avatarUrl}
        score={leftParticipant.score}
        isWinner={leftParticipant.isWinner}
        seat={leftParticipant.seat}
        side="left"
      />

      {/* Right Participant */}
      <ParticipantCard
        displayName={rightParticipant.displayName}
        avatarUrl={rightParticipant.avatarUrl}
        score={rightParticipant.score}
        isWinner={rightParticipant.isWinner}
        seat={rightParticipant.seat}
        side="right"
      />
    </div>
  );
}

interface ParticipantCardProps {
  displayName: string;
  avatarUrl: string | null;
  score?: SubmissionScore;
  isWinner?: boolean;
  seat: 'A' | 'B';
  side: 'left' | 'right';
}

function ParticipantCard({
  displayName,
  avatarUrl,
  score,
  isWinner,
  seat,
  side,
}: ParticipantCardProps) {
  const initials = displayName
    .split('_')
    .map((s) => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card className={cn(
      'p-4',
      isWinner && 'ring-2 ring-green-500 bg-green-50/50 dark:bg-green-900/10'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={avatarUrl || undefined} alt={displayName} />
            <AvatarFallback className="bg-gray-200 dark:bg-gray-700 text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {displayName}
            </div>
            <div className="text-xs text-gray-500">
              Seat {seat} • {side === 'left' ? 'Original' : 'Challenger'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isWinner && (
            <Badge className="bg-green-500 text-white">
              🏆 Winner
            </Badge>
          )}
        </div>
      </div>

      {/* Score */}
      {score && (
        <div className="space-y-4">
          {/* Total Score */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Total Score</span>
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {score.totalScore}
              <span className="text-sm font-normal text-gray-400">/100</span>
            </span>
          </div>

          {/* Score Breakdown */}
          <div className="space-y-2">
            {score.breakdown.map((item) => (
              <div key={item.requirementId} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400 truncate pr-2">
                    {item.title}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                    {item.score}/{item.maxScore}
                  </span>
                </div>
                <Progress
                  value={(item.score / item.maxScore) * 100}
                  className="h-1.5"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!score && (
        <div className="text-center py-4 text-gray-500">
          <div className="text-2xl mb-1">📊</div>
          <p className="text-sm">Scores pending</p>
        </div>
      )}
    </Card>
  );
}

export default CompareHeader;
