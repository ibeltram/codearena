'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Swords, Loader2, Clock, ArrowRight } from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui';
import { MatchStatusBadge, MatchModeBadge } from '@/components/matches';
import { useMatches } from '@/hooks';
import { categoryLabels, categoryColors, difficultyColors } from '@/types/challenge';
import { MatchFilters } from '@/types/match';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 10;

export default function MatchesPage() {
  const [filters, setFilters] = useState<MatchFilters>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });

  const { data, isLoading, isError, error, isFetching } = useMatches(filters);

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
              <Swords className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Matches</h1>
              <p className="text-muted-foreground">
                View all matches and find opponents
              </p>
            </div>
          </div>
          <Link href="/challenges">
            <Button>
              Find a Match
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-1/3" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                    <Skeleton className="h-8 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="text-center py-12">
            <p className="text-destructive">
              Error loading matches: {error?.message || 'Unknown error'}
            </p>
          </div>
        )}

        {/* Matches list */}
        {data && !isLoading && (
          <>
            {/* Results count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.pagination.total === 0
                  ? 'No matches found'
                  : `Showing ${(data.pagination.page - 1) * data.pagination.limit + 1}-${Math.min(
                      data.pagination.page * data.pagination.limit,
                      data.pagination.total
                    )} of ${data.pagination.total} matches`}
              </p>
              {isFetching && !isLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Match cards */}
            {data.data.length > 0 ? (
              <div className="space-y-4">
                {data.data.map((match) => (
                  <Link key={match.id} href={`/matches/${match.id}`}>
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          {/* Challenge info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate">
                                {match.challenge.title}
                              </h3>
                              <MatchStatusBadge status={match.status} />
                              <MatchModeBadge mode={match.mode} />
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'text-xs text-white',
                                  categoryColors[match.challenge.category]
                                )}
                              >
                                {categoryLabels[match.challenge.category]}
                              </Badge>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(match.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          {/* Action */}
                          <Button variant="ghost" size="sm">
                            View
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border rounded-lg bg-muted/20">
                <Swords className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No matches yet</h3>
                <p className="text-muted-foreground mt-1 mb-4">
                  Start your first match by finding a challenge
                </p>
                <Link href="/challenges">
                  <Button>Browse Challenges</Button>
                </Link>
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
