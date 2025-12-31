'use client';

import { useState } from 'react';
import { Loader2, Gift, Filter, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui';
import { PrizeClaimsTable } from '@/components/admin';
import {
  useAdminPrizeClaims,
  useApprovePrizeClaim,
  useFulfillPrizeClaim,
  useUpdatePrizeClaim,
} from '@/hooks/use-prize-claims';
import {
  PrizeClaimStatus,
  prizeClaimStatusLabels,
  prizeClaimStatusColors,
} from '@/types/tournament';

const ITEMS_PER_PAGE = 20;

const statusOptions: PrizeClaimStatus[] = ['pending', 'approved', 'fulfilled', 'denied'];

export default function AdminPrizeClaimsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<PrizeClaimStatus | undefined>();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);

  const { data, isLoading, isError, error, isFetching } = useAdminPrizeClaims({
    page,
    limit: ITEMS_PER_PAGE,
    status: statusFilter,
  });

  const approveMutation = useApprovePrizeClaim();
  const fulfillMutation = useFulfillPrizeClaim();
  const updateMutation = useUpdatePrizeClaim();

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStatusFilter = (status: PrizeClaimStatus | undefined) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      await approveMutation.mutateAsync({ claimId: id });
    } catch (err) {
      console.error('Failed to approve claim:', err);
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeny = async (id: string) => {
    const reason = prompt('Enter denial reason (optional):');
    setDenyingId(id);
    try {
      await updateMutation.mutateAsync({
        claimId: id,
        data: {
          status: 'denied',
          denialReason: reason || undefined,
        },
      });
    } catch (err) {
      console.error('Failed to deny claim:', err);
    } finally {
      setDenyingId(null);
    }
  };

  const handleFulfill = async (id: string) => {
    setFulfillingId(id);
    try {
      await fulfillMutation.mutateAsync({ claimId: id });
    } catch (err) {
      console.error('Failed to fulfill claim:', err);
    } finally {
      setFulfillingId(null);
    }
  };

  // Calculate summary from data
  const summary = data?.data?.reduce(
    (acc, claim) => {
      acc[claim.status] = (acc[claim.status] || 0) + 1;
      acc.total++;
      return acc;
    },
    { pending: 0, approved: 0, fulfilled: 0, denied: 0, total: 0 } as Record<string, number>
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white">
            <Gift className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Prize Claims</h1>
            <p className="text-muted-foreground">
              Review and fulfill tournament prize claims
            </p>
          </div>
        </div>
        {isFetching && !isLoading && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Summary badges */}
      {summary && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Pending:</span>
            <Badge className="bg-yellow-500">{summary.pending}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Approved:</span>
            <Badge className="bg-green-500">{summary.approved}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Fulfilled:</span>
            <Badge className="bg-blue-500">{summary.fulfilled}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Total:</span>
            <Badge variant="secondary">{data?.pagination?.total || 0}</Badge>
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Filter by status:</span>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleStatusFilter(status)}
              className={statusFilter === status ? prizeClaimStatusColors[status] : ''}
            >
              {prizeClaimStatusLabels[status]}
            </Button>
          ))}
          {statusFilter && (
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
            Error loading prize claims: {error?.message || 'Unknown error'}
          </p>
        </div>
      )}

      {/* Prize claims table */}
      <PrizeClaimsTable
        claims={data?.data || []}
        isLoading={isLoading}
        onApprove={handleApprove}
        onDeny={handleDeny}
        onFulfill={handleFulfill}
        approvingId={approvingId}
        denyingId={denyingId}
        fulfillingId={fulfillingId}
      />

      {/* Results count and pagination */}
      {data && !isLoading && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data.pagination.total === 0
                ? 'No prize claims found'
                : `Showing ${
                    (data.pagination.page - 1) * data.pagination.limit + 1
                  }-${Math.min(
                    data.pagination.page * data.pagination.limit,
                    data.pagination.total
                  )} of ${data.pagination.total} claims`}
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
