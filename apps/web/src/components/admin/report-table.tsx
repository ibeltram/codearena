'use client';

import Link from 'next/link';
import { Eye, MessageSquare, AlertCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ReportListItem,
  statusLabels,
  statusColors,
  reasonLabels,
  reasonColors,
} from '@/types/report';

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

interface ReportTableProps {
  reports: ReportListItem[];
  isLoading?: boolean;
  onStartReview?: (id: string) => void;
}

export function ReportTable({
  reports,
  isLoading,
  onStartReview,
}: ReportTableProps) {
  if (isLoading) {
    return <ReportTableSkeleton />;
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-2 font-medium text-muted-foreground">No reports found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          All caught up! No user reports to review.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Report</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Reported By</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Reported User</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Reason</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id} className="border-b last:border-b-0 hover:bg-muted/25">
              <td className="px-4 py-3">
                <div className="max-w-xs">
                  <Link
                    href={`/admin/reports/${report.id}`}
                    className="font-medium hover:underline line-clamp-1"
                  >
                    {report.description.length > 50
                      ? `${report.description.substring(0, 50)}...`
                      : report.description}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                    {report.id.substring(0, 8)}...
                  </p>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {report.reporter.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{report.reporter.displayName}</p>
                    {report.reporter.email && (
                      <p className="text-xs text-muted-foreground">{report.reporter.email}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center text-xs font-medium text-destructive">
                    {report.reportedUser.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <Link
                      href={`/profile/${report.reportedUser.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {report.reportedUser.displayName}
                    </Link>
                    {report.reportedUser.email && (
                      <p className="text-xs text-muted-foreground">{report.reportedUser.email}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className={reasonColors[report.reason]}>
                  {reasonLabels[report.reason]}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Badge className={statusColors[report.status]}>
                  {statusLabels[report.status]}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  {formatRelativeTime(report.createdAt)}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/reports/${report.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  {report.status === 'pending' && onStartReview && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStartReview(report.id)}
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

function ReportTableSkeleton() {
  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Report</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Reported By</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Reported User</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Reason</th>
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
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="mt-1 h-3 w-32" />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-20" />
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
