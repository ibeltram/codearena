'use client';

import { useState, useMemo } from 'react';
import { Loader2, Trophy, Medal, Calendar } from 'lucide-react';

import { MainLayout } from '@/components/layout';
import {
  LeaderboardFilters,
  LeaderboardTable,
  CurrentUserPosition,
} from '@/components/leaderboard';
import { Pagination } from '@/components/ui';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLeaderboard, useSeasons } from '@/hooks';
import { LeaderboardFilters as FilterState } from '@/types/leaderboard';

const ITEMS_PER_PAGE = 25;

export default function LeaderboardPage() {
  const [filters, setFilters] = useState<FilterState>({
    page: 1,
    limit: ITEMS_PER_PAGE,
    category: 'all',
  });

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
  } = useLeaderboard(filters);

  const { data: seasons, isLoading: isLoadingSeasons } = useSeasons();

  // Find current user in the leaderboard data
  const currentUserEntry = useMemo(() => {
    return data?.data.find((entry) => entry.isCurrentUser);
  }, [data]);

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Medal className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Leaderboard</h1>
              <p className="text-muted-foreground">
                {data?.season
                  ? `${data.season.name} rankings`
                  : 'Top players ranked by rating'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
            <Button variant="outline" size="sm" asChild>
              <a href="/leaderboard/seasons">
                <Calendar className="mr-2 h-4 w-4" />
                All Seasons
              </a>
            </Button>
          </div>
        </div>

        {/* Current user position (if in leaderboard) */}
        {!isLoading && data && (
          <CurrentUserPosition
            entry={currentUserEntry}
            totalPlayers={data.pagination.total}
          />
        )}

        {/* Filters */}
        <LeaderboardFilters
          filters={filters}
          onFilterChange={setFilters}
          seasons={seasons}
          isLoadingSeasons={isLoadingSeasons}
        />

        {/* Error state */}
        {isError && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="py-6">
              <p className="text-destructive text-center">
                Error loading leaderboard: {error?.message || 'Unknown error'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {isLoading && <LeaderboardTable entries={[]} isLoading={true} />}

        {/* Leaderboard table */}
        {data && !isLoading && (
          <>
            {/* Results count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.pagination.total === 0
                  ? 'No players found'
                  : `Showing ${
                      (data.pagination.page - 1) * data.pagination.limit + 1
                    }-${Math.min(
                      data.pagination.page * data.pagination.limit,
                      data.pagination.total
                    )} of ${data.pagination.total} players`}
              </p>
            </div>

            {/* Leaderboard entries */}
            <LeaderboardTable entries={data.data} isLoading={false} />

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <Pagination
                currentPage={data.pagination.page}
                totalPages={data.pagination.totalPages}
                onPageChange={handlePageChange}
                className="mt-6"
              />
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
