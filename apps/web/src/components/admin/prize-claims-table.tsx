'use client';

import Link from 'next/link';
import { Eye, Check, X, Gift, AlertCircle, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PrizeClaim,
  prizeClaimStatusLabels,
  prizeClaimStatusColors,
  prizeTypeLabels,
} from '@/types/tournament';

// Simple relative time formatter
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface PrizeClaimsTableProps {
  claims: PrizeClaim[];
  isLoading?: boolean;
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
  onFulfill?: (id: string) => void;
  approvingId?: string | null;
  denyingId?: string | null;
  fulfillingId?: string | null;
}

export function PrizeClaimsTable({
  claims,
  isLoading,
  onApprove,
  onDeny,
  onFulfill,
  approvingId,
  denyingId,
  fulfillingId,
}: PrizeClaimsTableProps) {
  if (isLoading) {
    return <PrizeClaimsTableSkeleton />;
  }

  if (claims.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-2 font-medium text-muted-foreground">No prize claims found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          All caught up! No prize claims to review.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Claimant</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Tournament</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Placement</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Prize</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Submitted</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id} className="border-b last:border-b-0 hover:bg-muted/25">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {claim.user?.displayName?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{claim.user?.displayName || 'Unknown User'}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {claim.userId.substring(0, 8)}...
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div>
                  <Link
                    href={`/tournaments/${claim.tournamentId}`}
                    className="font-medium hover:underline text-sm"
                  >
                    {claim.tournament?.name || 'Unknown Tournament'}
                  </Link>
                  <p className="text-xs text-muted-foreground font-mono">
                    {claim.tournamentId.substring(0, 8)}...
                  </p>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge
                  className={
                    claim.placement === 1
                      ? 'bg-amber-500'
                      : claim.placement === 2
                      ? 'bg-gray-400'
                      : claim.placement === 3
                      ? 'bg-orange-400'
                      : ''
                  }
                >
                  #{claim.placement}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div>
                  <Badge variant="outline">{prizeTypeLabels[claim.prizeType]}</Badge>
                  <p className="mt-1 text-sm font-medium">{claim.amountOrBundleRef}</p>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge className={prizeClaimStatusColors[claim.status]}>
                  {prizeClaimStatusLabels[claim.status]}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  {formatRelativeTime(claim.createdAt)}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/prize-claims/${claim.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>

                  {claim.status === 'pending' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-green-600 hover:text-green-700"
                        onClick={() => onApprove?.(claim.id)}
                        disabled={approvingId === claim.id}
                      >
                        {approvingId === claim.id ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-1 h-4 w-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => onDeny?.(claim.id)}
                        disabled={denyingId === claim.id}
                      >
                        {denyingId === claim.id ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <X className="mr-1 h-4 w-4" />
                        )}
                        Deny
                      </Button>
                    </>
                  )}

                  {claim.status === 'approved' && onFulfill && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-blue-600 hover:text-blue-700"
                      onClick={() => onFulfill(claim.id)}
                      disabled={fulfillingId === claim.id}
                    >
                      {fulfillingId === claim.id ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Gift className="mr-1 h-4 w-4" />
                      )}
                      Fulfill
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrizeClaimsTableSkeleton() {
  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Claimant</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Tournament</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Placement</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Prize</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Submitted</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="mt-1 h-3 w-16" />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-1 h-3 w-16" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-8" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="mt-1 h-4 w-20" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-20" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-24" />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
