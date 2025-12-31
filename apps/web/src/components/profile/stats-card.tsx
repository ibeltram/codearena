'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { UserStats, CategoryStats } from '@/types/user';
import { ChallengeCategory, categoryLabels } from '@/types/challenge';
import {
  BarChart3,
  Trophy,
  Target,
  TrendingUp,
  Flame,
  Award,
} from 'lucide-react';

interface StatsCardProps {
  stats: UserStats;
}

function CategoryStatsRow({ category }: { category: CategoryStats }) {
  const winRate = category.winRate * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {categoryLabels[category.category as ChallengeCategory]}
        </span>
        <span className="text-sm text-muted-foreground">
          {category.matchesPlayed} matches
        </span>
      </div>
      <div className="flex items-center gap-4">
        <Progress value={winRate} className="flex-1 h-2" />
        <span className="text-sm font-medium w-12 text-right">
          {Math.round(winRate)}%
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="text-green-600">{category.wins}W</span>
        <span className="text-red-600">{category.losses}L</span>
        {category.draws > 0 && (
          <span className="text-yellow-600">{category.draws}D</span>
        )}
        <span className="ml-auto">
          Avg: {Math.round(category.averageScore)}pts
        </span>
      </div>
    </div>
  );
}

export function StatsCard({ stats }: StatsCardProps) {
  const winRate = stats.totalMatches > 0 ? stats.winRate * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Overall Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Target className="h-5 w-5 text-blue-500" />
              </div>
              <p className="text-2xl font-bold">{stats.totalMatches}</p>
              <p className="text-xs text-muted-foreground">Total Matches</p>
            </div>

            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Trophy className="h-5 w-5 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-600">{stats.wins}</p>
              <p className="text-xs text-muted-foreground">Victories</p>
            </div>

            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
              <p className="text-2xl font-bold">
                {stats.totalMatches > 0 ? `${Math.round(winRate)}%` : '-'}
              </p>
              <p className="text-xs text-muted-foreground">Win Rate</p>
            </div>

            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Award className="h-5 w-5 text-amber-500" />
              </div>
              <p className="text-2xl font-bold">
                {stats.totalMatches > 0
                  ? Math.round(stats.averageScore)
                  : '-'}
              </p>
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </div>
          </div>

          {/* Win/Loss Bar */}
          {stats.totalMatches > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-green-600 font-medium">
                  {stats.wins} Wins
                </span>
                {stats.draws > 0 && (
                  <span className="text-yellow-600 font-medium">
                    {stats.draws} Draws
                  </span>
                )}
                <span className="text-red-600 font-medium">
                  {stats.losses} Losses
                </span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                <div
                  className="bg-green-500 transition-all"
                  style={{
                    width: `${(stats.wins / stats.totalMatches) * 100}%`,
                  }}
                />
                {stats.draws > 0 && (
                  <div
                    className="bg-yellow-500 transition-all"
                    style={{
                      width: `${(stats.draws / stats.totalMatches) * 100}%`,
                    }}
                  />
                )}
                <div
                  className="bg-red-500 transition-all"
                  style={{
                    width: `${(stats.losses / stats.totalMatches) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Streaks */}
          <div className="mt-6 flex items-center gap-4 justify-center">
            <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-sm">
                Current:{' '}
                <span className="font-bold">{stats.currentStreak}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
              <Flame className="h-4 w-4 text-red-500" />
              <span className="text-sm">
                Best: <span className="font-bold">{stats.bestStreak}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats by Category */}
      {stats.byCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Stats by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {stats.byCategory.map((category) => (
                <CategoryStatsRow key={category.category} category={category} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
