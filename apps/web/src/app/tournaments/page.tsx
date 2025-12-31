'use client';

import { useState } from 'react';
import { Loader2, Trophy, Plus } from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { TournamentCard, TournamentFilters } from '@/components/tournaments';
import { Pagination } from '@/components/ui';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTournaments } from '@/hooks/use-tournament';
import { TournamentFilters as FilterState } from '@/types/tournament';

const ITEMS_PER_PAGE = 12;

// Loading skeleton
function TournamentCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-4 pb-2">
          <div className="flex gap-2 mb-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
        <div className="px-4 py-2">
          <Skeleton className="h-6 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="px-4 py-3 border-t flex gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="px-4 py-3 border-t">
          <Skeleton className="h-8 w-28" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function TournamentsPage() {
  const [filters, setFilters] = useState<FilterState>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });

  const { data, isLoading, isError, error, isFetching } = useTournaments(filters);

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
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Tournaments</h1>
              <p className="text-muted-foreground">
                Compete in organized events for prizes and glory
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Filters */}
        <TournamentFilters filters={filters} onFilterChange={setFilters} />

        {/* Error state */}
        {isError && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="py-6">
              <p className="text-destructive text-center">
                Error loading tournaments: {error?.message || 'Unknown error'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <TournamentCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Tournament grid */}
        {data && !isLoading && (
          <>
            {/* Results count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.pagination.total === 0
                  ? 'No tournaments found'
                  : `Showing ${
                      (data.pagination.page - 1) * data.pagination.limit + 1
                    }-${Math.min(
                      data.pagination.page * data.pagination.limit,
                      data.pagination.total
                    )} of ${data.pagination.total} tournaments`}
              </p>
            </div>

            {/* Empty state */}
            {data.data.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No tournaments found</h3>
                  <p className="text-muted-foreground mb-4">
                    {filters.status || filters.format || filters.upcoming
                      ? 'Try adjusting your filters to see more tournaments.'
                      : 'Check back later for upcoming tournaments.'}
                  </p>
                  {(filters.status || filters.format || filters.upcoming) && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setFilters({ page: 1, limit: ITEMS_PER_PAGE })
                      }
                    >
                      Clear Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.data.map((tournament) => (
                  <TournamentCard key={tournament.id} tournament={tournament} />
                ))}
              </div>
            )}

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
