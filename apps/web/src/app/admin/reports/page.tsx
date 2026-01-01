'use client';

import { useState } from 'react';
import { Loader2, Flag, Filter, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui';
import { ReportTable } from '@/components/admin';
import { useAdminReports, useStartReportReview } from '@/hooks';
import {
  ReportFilters,
  ReportStatus,
  ReportReason,
  statusLabels,
  statusColors,
  reasonLabels,
  reasonColors,
} from '@/types/report';

const ITEMS_PER_PAGE = 20;

const statusOptions: ReportStatus[] = ['pending', 'in_review', 'resolved', 'dismissed'];
const reasonOptions: ReportReason[] = ['cheating', 'harassment', 'inappropriate_content', 'spam', 'other'];

export default function AdminReportsPage() {
  const [filters, setFilters] = useState<ReportFilters>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });

  const { data, isLoading, isError, error, isFetching } = useAdminReports(filters);
  const startReviewMutation = useStartReportReview();

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStatusFilter = (status: ReportStatus | undefined) => {
    setFilters((prev) => ({ ...prev, status, page: 1 }));
  };

  const handleReasonFilter = (reason: ReportReason | undefined) => {
    setFilters((prev) => ({ ...prev, reason, page: 1 }));
  };

  const handleStartReview = async (id: string) => {
    try {
      await startReviewMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to start review:', err);
    }
  };

  const clearFilters = () => {
    setFilters({ page: 1, limit: ITEMS_PER_PAGE });
  };

  const hasActiveFilters = filters.status || filters.reason;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500 text-white">
            <Flag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">User Reports</h1>
            <p className="text-muted-foreground">
              Review and resolve user reports
            </p>
          </div>
        </div>
        {isFetching && !isLoading && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Summary badges */}
      {data?.summary && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Pending:</span>
            <Badge className="bg-yellow-500">{data.summary.pending}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">In Review:</span>
            <Badge className="bg-blue-500">{data.summary.inReview}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Resolved:</span>
            <Badge className="bg-green-500">{data.summary.resolved}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Dismissed:</span>
            <Badge className="bg-gray-500">{data.summary.dismissed}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Total:</span>
            <Badge variant="secondary">{data.summary.total}</Badge>
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filter by status:</span>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <Button
                key={status}
                variant={filters.status === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusFilter(filters.status === status ? undefined : status)}
                className={filters.status === status ? statusColors[status] : ''}
              >
                {statusLabels[status]}
              </Button>
            ))}
          </div>
        </div>

        {/* Reason filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filter by reason:</span>
          <div className="flex flex-wrap gap-2">
            {reasonOptions.map((reason) => (
              <Button
                key={reason}
                variant={filters.reason === reason ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleReasonFilter(filters.reason === reason ? undefined : reason)}
                className={filters.reason === reason ? reasonColors[reason] : ''}
              >
                {reasonLabels[reason]}
              </Button>
            ))}
          </div>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XCircle className="mr-1 h-4 w-4" />
            Clear all filters
          </Button>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Error loading reports: {error?.message || 'Unknown error'}
          </p>
        </div>
      )}

      {/* Report table */}
      <ReportTable
        reports={data?.data || []}
        isLoading={isLoading}
        onStartReview={handleStartReview}
      />

      {/* Results count and pagination */}
      {data && !isLoading && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data.pagination.total === 0
                ? 'No reports found'
                : `Showing ${
                    (data.pagination.page - 1) * data.pagination.limit + 1
                  }-${Math.min(
                    data.pagination.page * data.pagination.limit,
                    data.pagination.total
                  )} of ${data.pagination.total} reports`}
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
