'use client';

import Link from 'next/link';
import { Eye, MessageSquare, AlertCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DisputeListItem,
  statusLabels,
  statusColors,
} from '@/types/dispute';
import { modeLabels, modeColors } from '@/types/match';

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

interface DisputeTableProps {
  disputes: DisputeListItem[];
  isLoading?: boolean;
  onStartReview?: (id: string) => void;
}

export function DisputeTable({
  disputes,
  isLoading,
  onStartReview,
}: DisputeTableProps) {
  if (isLoading) {
    return <DisputeTableSkeleton />;
  }

  if (disputes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-2 font-medium text-muted-foreground">No disputes found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          All caught up! No disputes to review.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Dispute</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Opened By</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Match</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {disputes.map((dispute) => (
            <tr key={dispute.id} className="border-b last:border-b-0 hover:bg-muted/25">
              <td className="px-4 py-3">
                <div className="max-w-xs">
                  <Link
                    href={`/admin/disputes/${dispute.id}`}
                    className="font-medium hover:underline line-clamp-1"
                  >
                    {dispute.reason.length > 60
                      ? `${dispute.reason.substring(0, 60)}...`
                      : dispute.reason}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                    {dispute.id.substring(0, 8)}...
                  </p>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {dispute.openedBy.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{dispute.openedBy.displayName}</p>
                    {dispute.openedBy.email && (
                      <p className="text-xs text-muted-foreground">{dispute.openedBy.email}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div>
                  <Badge variant="outline" className={modeColors[dispute.match.mode]}>
                    {modeLabels[dispute.match.mode]}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground font-mono">
                    {dispute.matchId.substring(0, 8)}...
                  </p>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge className={statusColors[dispute.status]}>
                  {statusLabels[dispute.status]}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  {formatRelativeTime(dispute.createdAt)}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/disputes/${dispute.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  {dispute.status === 'open' && onStartReview && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStartReview(dispute.id)}
                    >
                      <MessageSquare className="mr-1 h-4 w-4" />
                      Review
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

function DisputeTableSkeleton() {
  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Dispute</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Opened By</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Match</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-1 h-3 w-24" />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="mt-1 h-3 w-32" />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="mt-1 h-3 w-20" />
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
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
