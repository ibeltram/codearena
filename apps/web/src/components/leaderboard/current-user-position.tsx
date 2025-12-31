'use client';

import Link from 'next/link';
import { User, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LeaderboardEntry, formatRatingChange } from '@/types/leaderboard';
import { rankTierLabels, rankTierColors } from '@/types/user';
import { cn } from '@/lib/utils';

interface CurrentUserPositionProps {
  entry: LeaderboardEntry | undefined;
  totalPlayers: number;
}

export function CurrentUserPosition({ entry, totalPlayers }: CurrentUserPositionProps) {
  if (!entry) {
    return (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <User className="h-5 w-5" />
            <span>Sign in to see your ranking</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const tierClasses = rankTierColors[entry.tier];
  const percentile = ((totalPlayers - entry.rank + 1) / totalPlayers * 100).toFixed(1);

  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Rank badge */}
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted-foreground">Your Rank</span>
              <span className="text-3xl font-bold text-primary">#{entry.rank}</span>
              <span className="text-xs text-muted-foreground">
                Top {percentile}%
              </span>
            </div>

            {/* Player info */}
            <Link
              href={`/profile/${entry.displayName}`}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <Avatar className="h-12 w-12 border-2 border-primary">
                <AvatarImage src={entry.avatarUrl || undefined} alt={entry.displayName} />
                <AvatarFallback>
                  {entry.displayName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold text-lg">{entry.displayName}</div>
                <Badge className={cn('text-xs', tierClasses)}>
                  {rankTierLabels[entry.tier]}
                </Badge>
              </div>
            </Link>
          </div>

          {/* Rating info */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{entry.rating}</div>
              <div className="flex items-center justify-center gap-1 text-sm">
                {entry.ratingChange > 0 ? (
                  <span className="flex items-center text-green-500">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    {formatRatingChange(entry.ratingChange)}
                  </span>
                ) : entry.ratingChange < 0 ? (
                  <span className="flex items-center text-red-500">
                    <TrendingDown className="h-4 w-4 mr-1" />
                    {formatRatingChange(entry.ratingChange)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No change</span>
                )}
              </div>
            </div>

            {/* Win/Loss stats */}
            <div className="hidden sm:flex gap-4 text-sm">
              <div className="text-center">
                <div className="font-bold text-green-500">{entry.wins}</div>
                <div className="text-muted-foreground">Wins</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-red-500">{entry.losses}</div>
                <div className="text-muted-foreground">Losses</div>
              </div>
              <div className="text-center">
                <div className="font-bold">{entry.winRate.toFixed(1)}%</div>
                <div className="text-muted-foreground">Win Rate</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
