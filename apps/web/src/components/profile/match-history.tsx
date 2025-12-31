'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MatchListItem,
  statusLabels,
  statusColors,
  modeLabels,
} from '@/types/match';
import { categoryLabels, difficultyColors } from '@/types/challenge';
import {
  Trophy,
  X,
  Minus,
  Clock,
  ChevronRight,
  History,
} from 'lucide-react';

type MatchResult = 'win' | 'loss' | 'draw' | 'pending';

interface MatchHistoryProps {
  matches: MatchListItem[];
  currentUserId?: string;
  isLoading?: boolean;
  showLoadMore?: boolean;
  onLoadMore?: () => void;
}

function getMatchResult(
  match: MatchListItem,
  currentUserId?: string
): MatchResult {
  if (match.status !== 'finalized' && match.status !== 'archived') {
    return 'pending';
  }
  // TODO: Once we have scores, determine win/loss/draw
  // For now, return pending as we don't have score data in MatchListItem
  return 'pending';
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

function MatchHistoryItem({
  match,
  currentUserId,
}: {
  match: MatchListItem;
  currentUserId?: string;
}) {
  const result = getMatchResult(match, currentUserId);

  return (
    <Link href={`/matches/${match.id}`}>
      <div className="flex items-center gap-4 p-4 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer group">
        {/* Result Icon */}
        <div className="flex-shrink-0">
          <ResultIcon result={result} />
        </div>

        {/* Match Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium truncate">{match.challenge.title}</h4>
            <Badge
              variant="outline"
              className={`text-xs ${difficultyColors[match.challenge.difficulty]}`}
            >
              {match.challenge.difficulty}
            </Badge>
          </div>

          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span>{categoryLabels[match.challenge.category]}</span>
            <span>·</span>
            <span>{modeLabels[match.mode]}</span>
            <span>·</span>
            <Badge
              variant="secondary"
              className={`text-xs ${statusColors[match.status]} text-white`}
            >
              {statusLabels[match.status]}
            </Badge>
          </div>
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
  currentUserId,
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
                  currentUserId={currentUserId}
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
