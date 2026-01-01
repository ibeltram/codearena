'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Flag,
  MessageSquare,
  CheckCircle2,
  XCircle,
  User,
  Clock,
  Activity,
  Shield,
  Ban,
  AlertTriangle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdminReport,
  useStartReportReview,
  useResolveReport,
} from '@/hooks';
import {
  statusLabels,
  statusColors,
  reasonLabels,
  reasonColors,
  actionLabels,
  ReportResolutionAction,
  ResolveReportInput,
} from '@/types/report';

// Simple date formatters
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

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function ReportDetailPage() {
  const params = useParams();
  const reportId = params.id as string;

  const [activeTab, setActiveTab] = useState('overview');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolveForm, setResolveForm] = useState<ResolveReportInput>({
    resolution: 'dismissed',
    action: 'no_action',
    notes: '',
  });

  const { data, isLoading, isError, error } = useAdminReport(reportId);
  const startReviewMutation = useStartReportReview();
  const resolveMutation = useResolveReport();

  const handleStartReview = async () => {
    try {
      await startReviewMutation.mutateAsync(reportId);
    } catch (err) {
      console.error('Failed to start review:', err);
      alert('Failed to start review.');
    }
  };

  const handleResolve = async (resolution: 'resolved' | 'dismissed') => {
    try {
      await resolveMutation.mutateAsync({
        reportId,
        data: {
          ...resolveForm,
          resolution,
        },
      });
      setShowResolveForm(false);
    } catch (err) {
      console.error('Failed to resolve:', err);
      alert('Failed to resolve report.');
    }
  };

  if (isLoading) {
    return <ReportDetailSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/reports">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <Card className="border-destructive">
          <CardContent className="py-6">
            <p className="text-destructive text-center">
              {error?.message || 'Report not found'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { report, auditHistory, otherReports } = data;
  const isActionable = report.status === 'pending' || report.status === 'in_review';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
              <Link href="/admin/reports">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Report Details</h1>
          </div>
          <div className="flex items-center gap-2 ml-10">
            <Badge className={statusColors[report.status]}>
              {statusLabels[report.status]}
            </Badge>
            <Badge variant="outline" className={reasonColors[report.reason]}>
              {reasonLabels[report.reason]}
            </Badge>
            <span className="text-sm text-muted-foreground font-mono">
              {reportId.substring(0, 8)}...
            </span>
            <span className="text-sm text-muted-foreground">
              {formatRelativeTime(report.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {report.status === 'pending' && (
            <Button
              onClick={handleStartReview}
              disabled={startReviewMutation.isPending}
            >
              {startReviewMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="mr-2 h-4 w-4" />
              )}
              Start Review
            </Button>
          )}
          {isActionable && (
            <Button
              variant="default"
              onClick={() => setShowResolveForm(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Take Action
            </Button>
          )}
        </div>
      </div>

      {/* Resolution form modal */}
      {showResolveForm && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Take Action on Report
            </CardTitle>
            <CardDescription>
              Choose an action to take against the reported user
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="action">Action to Take</Label>
              <Select
                value={resolveForm.action}
                onValueChange={(value) =>
                  setResolveForm((prev) => ({ ...prev, action: value as ReportResolutionAction }))
                }
              >
                <SelectTrigger id="action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_action">No Action - Dismiss report</SelectItem>
                  <SelectItem value="warning_issued">Issue Warning to User</SelectItem>
                  <SelectItem value="temp_ban">Temporary Ban</SelectItem>
                  <SelectItem value="permanent_ban">Permanent Ban</SelectItem>
                  <SelectItem value="other">Other Action</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {resolveForm.action === 'temp_ban' && (
              <div className="space-y-2">
                <Label htmlFor="banDuration">Ban Duration (days)</Label>
                <Input
                  id="banDuration"
                  type="number"
                  min="1"
                  max="365"
                  placeholder="7"
                  value={resolveForm.banDurationDays || ''}
                  onChange={(e) =>
                    setResolveForm((prev) => ({
                      ...prev,
                      banDurationDays: parseInt(e.target.value) || undefined,
                    }))
                  }
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Add notes about this decision..."
                value={resolveForm.notes || ''}
                onChange={(e) =>
                  setResolveForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowResolveForm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                onClick={() => handleResolve('dismissed')}
                disabled={resolveMutation.isPending}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Dismiss
              </Button>
              <Button
                onClick={() => handleResolve('resolved')}
                disabled={resolveMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {resolveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Resolve & Take Action
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resolution display (if resolved) */}
      {(report.status === 'resolved' || report.status === 'dismissed') && (
        <Card className={report.status === 'resolved' ? 'border-green-500 bg-green-500/5' : 'border-gray-500 bg-gray-500/5'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {report.status === 'resolved' ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-gray-500" />
              )}
              {report.status === 'resolved' ? 'Resolved' : 'Dismissed'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <Badge variant="secondary">
                {statusLabels[report.status]}
              </Badge>
              {report.resolvedAt && (
                <span className="text-sm text-muted-foreground">
                  {formatRelativeTime(report.resolvedAt)}
                </span>
              )}
            </div>
            {report.reviewNotes && (
              <p className="text-sm">{report.reviewNotes}</p>
            )}
            {report.reviewedBy && (
              <p className="text-xs text-muted-foreground">
                Reviewed by {report.reviewedBy.displayName}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Report Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Report Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Reason Category</h4>
                  <Badge className={`mt-1 ${reasonColors[report.reason]}`}>
                    {reasonLabels[report.reason]}
                  </Badge>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                  <Badge className={`mt-1 ${statusColors[report.status]}`}>
                    {statusLabels[report.status]}
                  </Badge>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                <p className="mt-1 whitespace-pre-wrap">{report.description}</p>
              </div>
              {report.evidenceJson && Object.keys(report.evidenceJson).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Evidence</h4>
                  <div className="mt-2 space-y-2">
                    {report.evidenceJson.matchId && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Match ID:</span>
                        <Link
                          href={`/matches/${report.evidenceJson.matchId}`}
                          className="text-sm font-mono text-primary hover:underline"
                        >
                          {report.evidenceJson.matchId}
                        </Link>
                      </div>
                    )}
                    {report.evidenceJson.links && report.evidenceJson.links.length > 0 && (
                      <div>
                        <span className="text-sm text-muted-foreground">Links:</span>
                        <ul className="mt-1 list-disc list-inside">
                          {report.evidenceJson.links.map((link, i) => (
                            <li key={i}>
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline"
                              >
                                {link}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {report.evidenceJson.additionalContext && (
                      <div>
                        <span className="text-sm text-muted-foreground">Additional Context:</span>
                        <p className="mt-1 text-sm">{report.evidenceJson.additionalContext}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Other Reports */}
          {otherReports && otherReports.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Other Reports Against This User
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {otherReports.map((r) => (
                    <Link
                      key={r.id}
                      href={`/admin/reports/${r.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={reasonColors[r.reason]}>
                          {reasonLabels[r.reason]}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatRelativeTime(r.createdAt)}
                        </span>
                      </div>
                      <Badge className={statusColors[r.status]}>
                        {statusLabels[r.status]}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="mt-6 space-y-6">
          {/* Reporter */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Reporter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-lg font-medium">
                  {report.reporter.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <Link
                    href={`/profile/${report.reporter.id}`}
                    className="font-medium hover:underline"
                  >
                    {report.reporter.displayName}
                  </Link>
                  {report.reporter.email && (
                    <p className="text-sm text-muted-foreground">{report.reporter.email}</p>
                  )}
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm text-muted-foreground">Reported</p>
                  <p className="text-sm">{formatDateTime(report.createdAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reported User */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Ban className="h-5 w-5" />
                Reported User
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-lg font-medium text-destructive">
                  {report.reportedUser.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <Link
                    href={`/profile/${report.reportedUser.id}`}
                    className="font-medium hover:underline"
                  >
                    {report.reportedUser.displayName}
                  </Link>
                  {report.reportedUser.email && (
                    <p className="text-sm text-muted-foreground">{report.reportedUser.email}</p>
                  )}
                </div>
                <div className="ml-auto">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/users?search=${report.reportedUser.id}`}>
                      View in Admin
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Audit History
              </CardTitle>
              <CardDescription>
                All actions taken on this report
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!auditHistory || auditHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No audit events recorded
                </p>
              ) : (
                <div className="space-y-4">
                  {auditHistory.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 border-l-2 border-muted pl-4 py-2"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{event.eventType}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.actor?.displayName || 'System'} &bull;{' '}
                          {formatDateTime(event.createdAt)}
                        </p>
                        {Object.keys(event.payloadJson).length > 0 && (
                          <pre className="mt-2 rounded bg-muted p-2 text-xs overflow-auto">
                            {JSON.stringify(event.payloadJson, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      <Skeleton className="h-10 w-96" />

      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
