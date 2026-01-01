'use client';

import {
  Trophy,
  Calendar,
  ChevronRight,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSeasons, seasonStatusLabels, seasonStatusColors } from '@/hooks';

// Format date as "MMM d, yyyy" (e.g., "Jan 15, 2024")
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SeasonsPage() {
  const { data: seasons, isLoading, error } = useSeasons();

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <a href="/leaderboard">
              <ArrowLeft className="h-5 w-5" />
            </a>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Seasons</h1>
            <p className="text-muted-foreground">
              Browse all competitive seasons and their rankings
            </p>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="py-6">
              <p className="text-center text-destructive">
                Error loading seasons
              </p>
            </CardContent>
          </Card>
        )}

        {/* Seasons list */}
        {seasons && (
          <div className="space-y-4">
            {/* Current Season */}
            {seasons.filter((s) => s.isCurrent).map((season) => (
              <Card key={season.id} className="border-primary">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Trophy className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {season.name}
                          <Badge className="bg-green-500 text-white">
                            Current
                          </Badge>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Active competition season
                        </p>
                      </div>
                    </div>
                    <Button asChild>
                      <a href={`/leaderboard/seasons/${season.id}`}>
                        View Details
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {formatDate(season.startDate)} -{' '}
                        {season.endDate
                          ? formatDate(season.endDate)
                          : 'Ongoing'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Past Seasons */}
            {seasons.filter((s) => !s.isCurrent).length > 0 && (
              <>
                <h2 className="mt-8 text-lg font-semibold">Past Seasons</h2>
                <div className="space-y-3">
                  {seasons
                    .filter((s) => !s.isCurrent)
                    .map((season) => {
                      const statusColor =
                        seasonStatusColors[season.status || 'ended'] ||
                        'bg-gray-500';
                      const statusLabel =
                        seasonStatusLabels[season.status || 'ended'] ||
                        'Ended';

                      return (
                        <Card key={season.id}>
                          <CardContent className="flex items-center justify-between py-4">
                            <div className="flex items-center gap-4">
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                                <Trophy className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{season.name}</p>
                                  <Badge
                                    variant="secondary"
                                    className={`${statusColor} text-white`}
                                  >
                                    {statusLabel}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {formatDate(season.startDate)}{' '}
                                  -{' '}
                                  {season.endDate
                                    ? formatDate(season.endDate)
                                    : 'N/A'}
                                </p>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                              <a href={`/leaderboard/seasons/${season.id}`}>
                                View
                                <ChevronRight className="ml-1 h-4 w-4" />
                              </a>
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </>
            )}

            {/* Empty state */}
            {seasons.length === 0 && (
              <Card>
                <CardContent className="flex min-h-[200px] flex-col items-center justify-center gap-2">
                  <Trophy className="h-12 w-12 text-muted-foreground" />
                  <p className="text-lg font-medium">No seasons yet</p>
                  <p className="text-sm text-muted-foreground">
                    Seasons will appear here once created
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
