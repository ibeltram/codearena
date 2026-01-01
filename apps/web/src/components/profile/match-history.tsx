'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  UserMatchHistoryItem,
  MatchResult,
  modeLabels,
} from '@/types/match';
import { categoryLabels } from '@/types/challenge';
import {
  Trophy,
  X,
  Minus,
  Clock,
  ChevronRight,
  History,
} from 'lucide-react';

interface MatchHistoryProps {
  matches: UserMatchHistoryItem[];
  currentUserId?: string;
  isLoading?: boolean;
  showLoadMore?: boolean;
  onLoadMore?: () => void;
}

function formatMatchDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}

function ResultIcon({ result }: { result: MatchResult }) {
  switch (result) {
    case 'win':
      return <Trophy className="h-5 w-5 text-green-500" />;
    case 'loss':
      return <X className="h-5 w-5 text-red-500" />;
    case 'draw':
      return <Minus className="h-5 w-5 text-yellow-500" />;
    case 'pending':
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
}

function ResultBadge({ result, userScore, opponentScore }: {
  result: MatchResult;
  userScore: number | null;
  opponentScore: number | null;
}) {
  const colors: Record<MatchResult, string> = {
    win: 'bg-green-500/10 text-green-500 border-green-500/30',
    loss: 'bg-red-500/10 text-red-500 border-red-500/30',
    draw: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
    pending: 'bg-muted text-muted-foreground border-muted',
  };

  const labels: Record<MatchResult, string> = {
    win: 'Won',
    loss: 'Lost',
    draw: 'Draw',
    pending: 'Pending',
  };

  return (
    <div className="flex items-center gap-2">
      {userScore !== null && opponentScore !== null && (
        <span className="text-sm font-medium tabular-nums">
          {userScore} - {opponentScore}
        </span>
      )}
      <Badge variant="outline" className={`text-xs ${colors[result]}`}>
        {labels[result]}
      </Badge>
    </div>
  );
}

function MatchHistoryItem({
  match,
}: {
  match: UserMatchHistoryItem;
}) {
  return (
    <Link href={`/matches/${match.id}`}>
      <div className="flex items-center gap-4 p-4 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer group">
        {/* Result Icon */}
        <div className="flex-shrink-0">
          <ResultIcon result={match.result} />
        </div>

        {/* Match Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium truncate">{match.challenge.title}</h4>
          </div>

          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span>{categoryLabels[match.challenge.category]}</span>
            <span>·</span>
            <span>{modeLabels[match.mode]}</span>
            {match.opponent && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  vs
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={match.opponent.avatarUrl || undefined} />
                    <AvatarFallback className="text-[8px]">
                      {match.opponent.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-foreground">
                    {match.opponent.displayName}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Result Badge with Score */}
        <div className="flex items-center gap-3">
          <ResultBadge
            result={match.result}
            userScore={match.userScore}
            opponentScore={match.opponentScore}
          />
        </div>

        {/* Date */}
        <div className="text-sm text-muted-foreground">
          {formatMatchDate(match.createdAt)}
        </div>

        {/* Arrow */}
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </Link>
  );
}

export function MatchHistory({
  matches,
  currentUserId: _currentUserId,
  isLoading,
  showLoadMore,
  onLoadMore,
}: MatchHistoryProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Match History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-5 w-5 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Match History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {matches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No matches played yet</p>
            <p className="text-sm mt-1">
              Join a challenge to start competing!
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y">
              {matches.map((match) => (
                <MatchHistoryItem
                  key={match.id}
                  match={match}
                />
              ))}
            </div>

            {showLoadMore && (
              <div className="mt-4 text-center">
                <Button variant="outline" onClick={onLoadMore}>
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
