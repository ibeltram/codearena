'use client';

import { useState } from 'react';
import { Loader2, AlertTriangle, Filter, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui';
import { DisputeTable } from '@/components/admin';
import { useAdminDisputes, useStartReview } from '@/hooks';
import { DisputeFilters, DisputeTableStatus, statusLabels, statusColors } from '@/types/dispute';

const ITEMS_PER_PAGE = 20;

const statusOptions: DisputeTableStatus[] = ['open', 'in_review', 'resolved'];

export default function AdminDisputesPage() {
  const [filters, setFilters] = useState<DisputeFilters>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });

  const { data, isLoading, isError, error, isFetching } = useAdminDisputes(filters);
  const startReviewMutation = useStartReview();

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStatusFilter = (status: DisputeTableStatus | undefined) => {
    setFilters((prev) => ({ ...prev, status, page: 1 }));
  };

  const handleStartReview = async (id: string) => {
    try {
      await startReviewMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to start review:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500 text-white">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Disputes</h1>
            <p className="text-muted-foreground">
              Review and resolve match disputes
            </p>
          </div>
        </div>
        {isFetching && !isLoading && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Summary badges */}
      {data?.summary && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Open:</span>
            <Badge className="bg-yellow-500">{data.summary.open}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">In Review:</span>
            <Badge className="bg-blue-500">{data.summary.inReview}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Total:</span>
            <Badge variant="secondary">{data.summary.total}</Badge>
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Filter by status:</span>
        <div className="flex gap-2">
          {statusOptions.map((status) => (
            <Button
              key={status}
              variant={filters.status === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleStatusFilter(status)}
              className={filters.status === status ? statusColors[status] : ''}
            >
              {statusLabels[status]}
            </Button>
          ))}
          {filters.status && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleStatusFilter(undefined)}
            >
              <XCircle className="mr-1 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Error loading disputes: {error?.message || 'Unknown error'}
          </p>
        </div>
      )}

      {/* Dispute table */}
      <DisputeTable
        disputes={data?.data || []}
        isLoading={isLoading}
        onStartReview={handleStartReview}
      />

      {/* Results count and pagination */}
      {data && !isLoading && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data.pagination.total === 0
                ? 'No disputes found'
                : `Showing ${
                    (data.pagination.page - 1) * data.pagination.limit + 1
                  }-${Math.min(
                    data.pagination.page * data.pagination.limit,
                    data.pagination.total
                  )} of ${data.pagination.total} disputes`}
            </p>
          </div>

          {data.pagination.totalPages > 1 && (
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}
    </div>
  );
}
