'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  RefreshCw,
  User,
  Clock,
  FileText,
  Activity,
  Trophy,
  Shield,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdminDispute,
  useStartReview,
  useResolveDispute,
  useRejudgeDispute,
} from '@/hooks';
import {
  statusLabels,
  statusColors,
  resolutionLabels,
  resolutionColors,
  outcomeLabels,
  DisputeResolution,
  DisputeNewOutcome,
  ResolveDisputeInput,
} from '@/types/dispute';
import { categoryLabels, difficultyLabels } from '@/types/challenge';
import { modeLabels, statusLabels as matchStatusLabels } from '@/types/match';

// Simple date formatters (avoiding date-fns dependency)
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

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function DisputeDetailPage() {
  const params = useParams();
  const disputeId = params.id as string;

  const [activeTab, setActiveTab] = useState('overview');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolveForm, setResolveForm] = useState<ResolveDisputeInput>({
    resolution: 'rejected',
    reason: '',
    newOutcome: 'no_change',
  });

  const { data, isLoading, isError, error } = useAdminDispute(disputeId);
  const startReviewMutation = useStartReview();
  const resolveMutation = useResolveDispute();
  const rejudgeMutation = useRejudgeDispute();

  const handleStartReview = async () => {
    try {
      await startReviewMutation.mutateAsync(disputeId);
    } catch (err) {
      console.error('Failed to start review:', err);
      alert('Failed to start review.');
    }
  };

  const handleResolve = async () => {
    if (resolveForm.reason.length < 10) {
      alert('Please provide a detailed reason (at least 10 characters).');
      return;
    }
    try {
      await resolveMutation.mutateAsync({
        disputeId,
        data: resolveForm,
      });
      setShowResolveForm(false);
    } catch (err) {
      console.error('Failed to resolve:', err);
      alert('Failed to resolve dispute.');
    }
  };

  const handleRejudge = async () => {
    if (!confirm('Are you sure you want to trigger re-judging? This will queue a new judging run.')) {
      return;
    }
    try {
      await rejudgeMutation.mutateAsync(disputeId);
      alert('Re-judging has been queued.');
    } catch (err) {
      console.error('Failed to request rejudge:', err);
      alert('Failed to request re-judging.');
    }
  };

  if (isLoading) {
    return <DisputeDetailSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/disputes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <Card className="border-destructive">
          <CardContent className="py-6">
            <p className="text-destructive text-center">
              {error?.message || 'Dispute not found'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { dispute, match, participants, scores, otherDisputes, auditHistory } = data;
  const participantA = participants.find(p => p.seat === 'A');
  const participantB = participants.find(p => p.seat === 'B');
  const scoreA = scores.find(s => s.userId === participantA?.user.id);
  const scoreB = scores.find(s => s.userId === participantB?.user.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
              <Link href="/admin/disputes">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Dispute Details</h1>
          </div>
          <div className="flex items-center gap-2 ml-10">
            <Badge className={statusColors[dispute.status]}>
              {statusLabels[dispute.status]}
            </Badge>
            <span className="text-sm text-muted-foreground font-mono">
              {disputeId.substring(0, 8)}...
            </span>
            <span className="text-sm text-muted-foreground">
              {formatRelativeTime(dispute.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dispute.status === 'open' && (
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
          {dispute.status !== 'resolved' && (
            <>
              <Button
                variant="outline"
                onClick={handleRejudge}
                disabled={rejudgeMutation.isPending}
              >
                {rejudgeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Re-judge
              </Button>
              <Button
                variant="default"
                onClick={() => setShowResolveForm(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Resolve
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Resolution form modal */}
      {showResolveForm && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Resolve Dispute
            </CardTitle>
            <CardDescription>
              Enter your decision and resolution details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="resolution">Resolution Decision</Label>
                <Select
                  value={resolveForm.resolution}
                  onValueChange={(value) =>
                    setResolveForm((prev) => ({ ...prev, resolution: value as DisputeResolution }))
                  }
                >
                  <SelectTrigger id="resolution">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upheld">Upheld - Disputant is correct</SelectItem>
                    <SelectItem value="rejected">Rejected - Dispute is invalid</SelectItem>
                    <SelectItem value="partial">Partial - Partially valid claims</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newOutcome">New Match Outcome</Label>
                <Select
                  value={resolveForm.newOutcome || 'no_change'}
                  onValueChange={(value) =>
                    setResolveForm((prev) => ({ ...prev, newOutcome: value as DisputeNewOutcome }))
                  }
                >
                  <SelectTrigger id="newOutcome">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_change">No Change</SelectItem>
                    <SelectItem value="winner_a">
                      Player A Wins ({participantA?.user.displayName})
                    </SelectItem>
                    <SelectItem value="winner_b">
                      Player B Wins ({participantB?.user.displayName})
                    </SelectItem>
                    <SelectItem value="tie">Declare a Tie</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Resolution Reason</Label>
              <Textarea
                id="reason"
                placeholder="Explain your decision in detail (minimum 10 characters)..."
                value={resolveForm.reason}
                onChange={(e) =>
                  setResolveForm((prev) => ({ ...prev, reason: e.target.value }))
                }
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="internalNotes">Internal Notes (optional)</Label>
              <Textarea
                id="internalNotes"
                placeholder="Private notes for admin reference..."
                value={resolveForm.internalNotes || ''}
                onChange={(e) =>
                  setResolveForm((prev) => ({ ...prev, internalNotes: e.target.value }))
                }
                rows={2}
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
                onClick={handleResolve}
                disabled={resolveMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {resolveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Submit Resolution
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resolution display (if resolved) */}
      {dispute.status === 'resolved' && dispute.resolutionJson && (
        <Card className="border-green-500 bg-green-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Resolution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <Badge className={resolutionColors[dispute.resolutionJson.resolution]}>
                {resolutionLabels[dispute.resolutionJson.resolution]}
              </Badge>
              <Badge variant="outline">
                {outcomeLabels[dispute.resolutionJson.newOutcome]}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Resolved {formatRelativeTime(dispute.resolutionJson.resolvedAt)}
              </span>
            </div>
            <p className="text-sm">{dispute.resolutionJson.reason}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="match" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Match & Scores
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Dispute Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Dispute Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Reason</h4>
                <p className="mt-1">{dispute.reason}</p>
              </div>
              {dispute.evidenceJson && Object.keys(dispute.evidenceJson).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Evidence</h4>
                  <pre className="mt-1 rounded-lg bg-muted p-3 text-sm overflow-auto">
                    {JSON.stringify(dispute.evidenceJson, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Opened By */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Opened By
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-lg font-medium">
                  {dispute.openedBy.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{dispute.openedBy.displayName}</p>
                  {dispute.openedBy.email && (
                    <p className="text-sm text-muted-foreground">{dispute.openedBy.email}</p>
                  )}
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="text-sm">
                    {formatDateTime(dispute.createdAt)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Other Disputes */}
          {otherDisputes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Other Disputes on this Match
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {otherDisputes.map((d) => (
                    <Link
                      key={d.id}
                      href={`/admin/disputes/${d.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50"
                    >
                      <div>
                        <p className="text-sm font-medium">{d.reason.substring(0, 60)}...</p>
                        <p className="text-xs text-muted-foreground">
                          by {d.openedBy.displayName}
                        </p>
                      </div>
                      <Badge className={statusColors[d.status]}>
                        {statusLabels[d.status]}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Match & Scores Tab */}
        <TabsContent value="match" className="mt-6 space-y-6">
          {/* Match Info */}
          <Card>
            <CardHeader>
              <CardTitle>Match Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Challenge</h4>
                  <p className="mt-1 font-medium">{match.challenge.title}</p>
                  <div className="mt-1 flex gap-2">
                    <Badge variant="secondary">
                      {categoryLabels[match.challenge.category]}
                    </Badge>
                    <Badge variant="outline">
                      {difficultyLabels[match.challenge.difficulty]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Match Details</h4>
                  <div className="mt-1 space-y-1">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Status:</span>{' '}
                      {matchStatusLabels[match.status]}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Mode:</span>{' '}
                      {modeLabels[match.mode]}
                    </p>
                    <p className="text-sm font-mono text-muted-foreground">
                      {match.id.substring(0, 8)}...
                    </p>
                  </div>
                </div>
              </div>
              {match.startAt && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Timeline</h4>
                  <div className="mt-1 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Start: {formatDate(match.startAt)}
                    </div>
                    {match.endAt && (
                      <div>End: {formatDate(match.endAt)}</div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Participants & Scores */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Player A */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Player A: {participantA?.user.displayName || 'Unknown'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {participantA && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-medium">
                      {participantA.user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      {participantA.user.email && (
                        <p className="text-sm text-muted-foreground">
                          {participantA.user.email}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Joined {formatRelativeTime(participantA.joinedAt)}
                      </p>
                    </div>
                  </div>
                )}
                {scoreA ? (
                  <div className="rounded-lg bg-muted p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Score</span>
                      <span className="text-2xl font-bold">
                        {scoreA.totalPoints} / {scoreA.maxPoints}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Judge: {scoreA.judgeType}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No score available</p>
                )}
              </CardContent>
            </Card>

            {/* Player B */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Player B: {participantB?.user.displayName || 'Unknown'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {participantB && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-medium">
                      {participantB.user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      {participantB.user.email && (
                        <p className="text-sm text-muted-foreground">
                          {participantB.user.email}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Joined {formatRelativeTime(participantB.joinedAt)}
                      </p>
                    </div>
                  </div>
                )}
                {scoreB ? (
                  <div className="rounded-lg bg-muted p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Score</span>
                      <span className="text-2xl font-bold">
                        {scoreB.totalPoints} / {scoreB.maxPoints}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Judge: {scoreB.judgeType}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No score available</p>
                )}
              </CardContent>
            </Card>
          </div>
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
                All actions taken on this dispute
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditHistory.length === 0 ? (
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

function DisputeDetailSkeleton() {
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
