'use client';

import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LeaderboardEntry,
  getRankChange,
  formatRatingChange,
} from '@/types/leaderboard';
import { rankTierLabels, rankTierColors } from '@/types/user';
import { cn } from '@/lib/utils';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  isLoading: boolean;
}

function RankChangeIndicator({ current, previous }: { current: number; previous: number | null }) {
  const change = getRankChange(current, previous);

  switch (change) {
    case 'up':
      return (
        <span className="flex items-center text-green-500" title={`Up from #${previous}`}>
          <ChevronUp className="h-4 w-4" />
          <span className="text-xs">{(previous ?? 0) - current}</span>
        </span>
      );
    case 'down':
      return (
        <span className="flex items-center text-red-500" title={`Down from #${previous}`}>
          <ChevronDown className="h-4 w-4" />
          <span className="text-xs">{current - (previous ?? 0)}</span>
        </span>
      );
    case 'new':
      return (
        <span className="flex items-center text-blue-500" title="New to leaderboard">
          <Sparkles className="h-4 w-4" />
        </span>
      );
    default:
      return (
        <span className="text-muted-foreground" title="No change">
          <Minus className="h-4 w-4" />
        </span>
      );
  }
}

function RatingChangeIndicator({ change }: { change: number }) {
  if (change > 0) {
    return (
      <span className="flex items-center text-green-500 text-sm">
        <TrendingUp className="h-3 w-3 mr-1" />
        {formatRatingChange(change)}
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="flex items-center text-red-500 text-sm">
        <TrendingDown className="h-3 w-3 mr-1" />
        {formatRatingChange(change)}
      </span>
    );
  }
  return <span className="text-muted-foreground text-sm">-</span>;
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const tierClasses = rankTierColors[entry.tier];
  const isTopThree = entry.rank <= 3;

  const rankColors: Record<number, string> = {
    1: 'bg-yellow-500 text-yellow-950',
    2: 'bg-gray-400 text-gray-950',
    3: 'bg-amber-600 text-amber-950',
  };

  return (
    <Link
      href={`/profile/${entry.displayName}`}
      className={cn(
        'flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors rounded-lg',
        entry.isCurrentUser && 'bg-primary/5 border border-primary/20'
      )}
    >
      {/* Rank */}
      <div className="flex items-center gap-2 w-20">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm',
            isTopThree ? rankColors[entry.rank] : 'bg-muted text-muted-foreground'
          )}
        >
          {entry.rank}
        </div>
        <RankChangeIndicator current={entry.rank} previous={entry.previousRank} />
      </div>

      {/* Player info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar className="h-10 w-10">
          <AvatarImage src={entry.avatarUrl || undefined} alt={entry.displayName} />
          <AvatarFallback>
            {entry.displayName.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{entry.displayName}</span>
            {entry.isCurrentUser && (
              <Badge variant="secondary" className="text-xs">
                You
              </Badge>
            )}
          </div>
          <Badge className={cn('text-xs', tierClasses)}>
            {rankTierLabels[entry.tier]}
          </Badge>
        </div>
      </div>

      {/* Rating */}
      <div className="text-right w-24">
        <div className="font-bold text-lg">{entry.rating}</div>
        <RatingChangeIndicator change={entry.ratingChange} />
      </div>

      {/* Stats */}
      <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
        <div className="text-center w-16">
          <div className="font-medium text-foreground">{entry.wins}</div>
          <div>Wins</div>
        </div>
        <div className="text-center w-16">
          <div className="font-medium text-foreground">{entry.losses}</div>
          <div>Losses</div>
        </div>
        <div className="text-center w-16">
          <div className="font-medium text-foreground">{entry.winRate.toFixed(1)}%</div>
          <div>Win Rate</div>
        </div>
      </div>
    </Link>
  );
}

function LeaderboardRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="flex items-center gap-2 w-20">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-6" />
      </div>
      <div className="flex items-center gap-3 flex-1">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div>
          <Skeleton className="h-5 w-32 mb-1" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
      <div className="w-24">
        <Skeleton className="h-6 w-16 ml-auto mb-1" />
        <Skeleton className="h-4 w-12 ml-auto" />
      </div>
      <div className="hidden md:flex gap-6">
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-10 w-16" />
      </div>
    </div>
  );
}

export function LeaderboardTable({ entries, isLoading }: LeaderboardTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-0 divide-y">
          {Array.from({ length: 10 }).map((_, i) => (
            <LeaderboardRowSkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-medium">No players found</p>
            <p className="text-sm mt-1">
              Try adjusting your filters or search terms
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {entries.map((entry) => (
          <LeaderboardRow key={entry.userId} entry={entry} />
        ))}
      </CardContent>
    </Card>
  );
}
