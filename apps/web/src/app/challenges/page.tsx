'use client';

import { useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { ChallengeCard, ChallengeFilters } from '@/components/challenges';
import { Pagination, Skeleton } from '@/components/ui';
import { useChallenges } from '@/hooks';
import { ChallengeFilters as FilterState } from '@/types/challenge';

const ITEMS_PER_PAGE = 12;

export default function ChallengesPage() {
  const [filters, setFilters] = useState<FilterState>({
    page: 1,
    limit: ITEMS_PER_PAGE,
    sort: 'newest',
  });

  const { data, isLoading, isError, error, isFetching } = useChallenges(filters);

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    // Scroll to top on page change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Challenges</h1>
            <p className="text-muted-foreground">
              Browse and compete in coding challenges
            </p>
          </div>
        </div>

        {/* Filters */}
        <ChallengeFilters filters={filters} onFilterChange={setFilters} />

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
              <div key={i} className="rounded-lg border p-6 space-y-4">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <div className="flex justify-between pt-3 border-t">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="text-center py-12">
            <p className="text-destructive">
              Error loading challenges: {error?.message || 'Unknown error'}
            </p>
          </div>
        )}

        {/* Challenges grid */}
        {data && !isLoading && (
          <>
            {/* Results count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.pagination.total === 0
                  ? 'No challenges found'
                  : `Showing ${(data.pagination.page - 1) * data.pagination.limit + 1}-${Math.min(
                      data.pagination.page * data.pagination.limit,
                      data.pagination.total
                    )} of ${data.pagination.total} challenges`}
              </p>
              {isFetching && !isLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Challenge cards */}
            {data.data.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.data.map((challenge) => (
                  <ChallengeCard key={challenge.id} challenge={challenge} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border rounded-lg bg-muted/20">
                <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No challenges found</h3>
                <p className="text-muted-foreground mt-1">
                  Try adjusting your filters or search terms
                </p>
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
