'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import {
  ArrowLeft,
  Clock,
  Trophy,
  AlertCircle,
  Play,
  Flag,
  ExternalLink,
  Loader2,
  CheckCircle2,
  FileCode2,
  Gavel,
  RefreshCw,
} from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  MatchTimer,
  ParticipantCard,
  EmptyParticipantSlot,
  MatchStatusBadge,
  MatchModeBadge,
  ConnectionStatusIndicator,
  LiveBadge,
} from '@/components/matches';
import { useMatch, useReadyUp, useForfeit, useMatchEvents } from '@/hooks';
import { categoryLabels, categoryColors, difficultyLabels, difficultyColors } from '@/types/challenge';
import { cn } from '@/lib/utils';

// Mock current user ID - in production this would come from auth context
const MOCK_USER_ID = 'mock-user-id';

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;

  const { data: match, isLoading, isError, error } = useMatch(matchId);
  const readyMutation = useReadyUp();
  const forfeitMutation = useForfeit();

  // SSE real-time events - keep track of live timer from server
  const [liveTimerRemaining, setLiveTimerRemaining] = useState<number | null>(null);

  const handleTimerTick = useCallback((remainingMs: number, isWarning: boolean) => {
    setLiveTimerRemaining(remainingMs);
  }, []);

  const handleStateChange = useCallback((newStatus: string) => {
    console.log('[SSE] Match status changed:', newStatus);
  }, []);

  // Enable SSE for active matches
  const shouldEnableSSE = match && ['matched', 'in_progress', 'submission_locked', 'judging'].includes(match.status);

  const {
    connectionStatus,
    timerRemaining,
    timerWarning,
    reconnect,
    reconnectAttempts,
  } = useMatchEvents(matchId, {
    enabled: shouldEnableSSE,
    userId: MOCK_USER_ID,
    onTimerTick: handleTimerTick,
    onStateChange: handleStateChange,
  });

  // Find current user's participant record (mock)
  const currentParticipant = match?.participants?.find(
    (p) => p.user.id === MOCK_USER_ID
  );
  const isParticipant = !!currentParticipant;

  const handleReadyUp = async () => {
    try {
      await readyMutation.mutateAsync(matchId);
    } catch (err) {
      console.error('Failed to ready up:', err);
    }
  };

  const handleForfeit = async () => {
    if (!confirm('Are you sure you want to forfeit? This cannot be undone.')) {
      return;
    }
    try {
      await forfeitMutation.mutateAsync(matchId);
    } catch (err) {
      console.error('Failed to forfeit:', err);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[200px] w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[100px]" />
          </div>
          <Skeleton className="h-[300px]" />
        </div>
      </MainLayout>
    );
  }

  // Error state
  if (isError || !match) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">Match Not Found</h1>
          <p className="text-muted-foreground mb-4">
            {error?.message || 'The match you are looking for does not exist.'}
          </p>
          <Button onClick={() => router.push('/challenges')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Challenges
          </Button>
        </div>
      </MainLayout>
    );
  }

  const { challenge, challengeVersion, participants, status, mode, startAt, endAt } = match;

  // Ensure we have both participant slots
  const participantA = participants?.find((p) => p.seat === 'A');
  const participantB = participants?.find((p) => p.seat === 'B');

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Back button and header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{challenge.title}</h1>
              <MatchStatusBadge status={status} />
              <MatchModeBadge mode={mode} />
              {/* Live indicator for active matches */}
              {shouldEnableSSE && <LiveBadge isLive={connectionStatus === 'connected'} />}
            </div>
            <p className="text-muted-foreground mt-1">
              Match #{matchId.slice(0, 8)}
            </p>
          </div>
          {/* Connection status indicator */}
          {shouldEnableSSE && (
            <div className="flex items-center gap-2">
              <ConnectionStatusIndicator
                status={connectionStatus}
                reconnectAttempts={reconnectAttempts}
              />
              {connectionStatus === 'error' && (
                <Button variant="ghost" size="sm" onClick={reconnect} className="gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Timer and actions */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <MatchTimer
                  status={status}
                  startAt={startAt}
                  endAt={endAt}
                  serverTimeRemaining={timerRemaining}
                  isWarning={timerWarning}
                  className="text-3xl"
                />
              </div>

              {/* Action buttons based on status */}
              <div className="flex items-center gap-2">
                {status === 'matched' && isParticipant && !currentParticipant?.readyAt && (
                  <Button
                    onClick={handleReadyUp}
                    disabled={readyMutation.isPending}
                    className="gap-2"
                  >
                    {readyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Ready Up
                  </Button>
                )}

                {status === 'in_progress' && isParticipant && (
                  <>
                    <Button variant="default" className="gap-2">
                      <FileCode2 className="h-4 w-4" />
                      Submit Code
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleForfeit}
                      disabled={forfeitMutation.isPending}
                      className="gap-2"
                    >
                      {forfeitMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Flag className="h-4 w-4" />
                      )}
                      Forfeit
                    </Button>
                  </>
                )}

                {status === 'finalized' && (
                  <Button variant="outline" className="gap-2">
                    <Gavel className="h-4 w-4" />
                    View Results
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Participants */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {participantA ? (
            <ParticipantCard
              participant={participantA}
              isCurrentUser={participantA.user.id === MOCK_USER_ID}
              matchStatus={status}
            />
          ) : (
            <EmptyParticipantSlot seat="A" />
          )}
          {participantB ? (
            <ParticipantCard
              participant={participantB}
              isCurrentUser={participantB.user.id === MOCK_USER_ID}
              matchStatus={status}
            />
          ) : (
            <EmptyParticipantSlot seat="B" />
          )}
        </div>

        {/* Challenge details */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Challenge Details
              </CardTitle>
              <Link href={`/challenges/${challenge.id}`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  View Challenge
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <CardDescription>{challenge.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge className={cn('text-white', categoryColors[challenge.category])}>
                {categoryLabels[challenge.category]}
              </Badge>
              <Badge className={cn('text-white', difficultyColors[challenge.difficulty])}>
                {difficultyLabels[challenge.difficulty]}
              </Badge>
              <Badge variant="outline">
                Version {challengeVersion.versionNumber}
              </Badge>
            </div>

            <Separator className="my-4" />

            {/* Requirements */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Requirements
              </h3>
              {challengeVersion.requirementsJson &&
              typeof challengeVersion.requirementsJson === 'object' &&
              'requirements' in challengeVersion.requirementsJson ? (
                <ul className="space-y-2">
                  {(challengeVersion.requirementsJson as { requirements: Array<{ id: string; title: string; description: string; weight: number }> }).requirements.map((req) => (
                    <li key={req.id} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{req.title}</span>
                          <Badge variant="secondary">{req.weight}%</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {req.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  Requirements will be displayed here.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Match timeline */}
        {startAt && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started</span>
                  <span>{new Date(startAt).toLocaleString()}</span>
                </div>
                {endAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {status === 'in_progress' ? 'Ends' : 'Ended'}
                    </span>
                    <span>{new Date(endAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
