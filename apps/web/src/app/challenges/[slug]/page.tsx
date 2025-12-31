'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Trophy,
  AlertCircle,
  Zap,
  Users,
  FileCode,
  Loader2,
  Copy,
  Check,
  Share2,
} from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChallenge, useJoinQueue, useCreateMatch } from '@/hooks/use-challenges';
import {
  categoryLabels,
  categoryColors,
  difficultyLabels,
  difficultyColors,
} from '@/types/challenge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';

export default function ChallengeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const { user, isAuthenticated } = useAuthStore();
  const { data: challenge, isLoading, isError, error } = useChallenge(slug);

  const joinQueue = useJoinQueue();
  const createMatch = useCreateMatch();

  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Handle joining the ranked queue
  const handleJoinQueue = async () => {
    if (!challenge?.latestVersion) return;

    try {
      const result = await joinQueue.mutateAsync({
        challengeVersionId: challenge.latestVersion.id,
        stakeAmount: 100, // Default stake
      });

      setShowJoinDialog(false);

      if (result.matched) {
        // Matched immediately - go to match page
        router.push(`/matches/${result.matchId}`);
      } else {
        // Waiting in queue - show message and redirect
        router.push(`/matches/${result.matchId}`);
      }
    } catch (err) {
      console.error('Failed to join queue:', err);
    }
  };

  // Handle creating an invite match
  const handleCreateInvite = async () => {
    if (!challenge?.latestVersion) return;

    try {
      const result = await createMatch.mutateAsync({
        challengeVersionId: challenge.latestVersion.id,
        mode: 'invite',
        stakeAmount: 100,
        durationMinutes: 60,
      });

      setInviteLink(`${window.location.origin}${result.inviteLink}`);
      setShowInviteDialog(true);
    } catch (err) {
      console.error('Failed to create invite:', err);
    }
  };

  const handleCopyInvite = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[300px]" />
        </div>
      </MainLayout>
    );
  }

  // Error state
  if (isError || !challenge) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">Challenge Not Found</h1>
          <p className="text-muted-foreground mb-4">
            {error?.message || 'The challenge you are looking for does not exist.'}
          </p>
          <Button onClick={() => router.push('/challenges')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Challenges
          </Button>
        </div>
      </MainLayout>
    );
  }

  const { latestVersion, versionCount } = challenge;
  const hasTemplate = !!latestVersion?.templateRef;
  const requirements = latestVersion?.requirementsJson || [];
  const constraints = latestVersion?.constraintsJson;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Back button and header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{challenge.title}</h1>
              <Badge className={cn('text-white', categoryColors[challenge.category])}>
                {categoryLabels[challenge.category]}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'border-2',
                  difficultyColors[challenge.difficulty].replace('bg-', 'border-'),
                  difficultyColors[challenge.difficulty].replace('bg-', 'text-').replace('-500', '-600')
                )}
              >
                {difficultyLabels[challenge.difficulty]}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">{challenge.description}</p>
          </div>
        </div>

        {/* Action buttons */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {hasTemplate && (
                  <span className="flex items-center gap-1">
                    <FileCode className="h-4 w-4" />
                    Template Available
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {constraints?.maxDurationMinutes || 60} min
                </span>
                {versionCount > 0 && (
                  <span className="flex items-center gap-1">
                    Version {latestVersion?.versionNumber || 1}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isAuthenticated ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleCreateInvite}
                      disabled={createMatch.isPending || !latestVersion}
                      className="gap-2"
                    >
                      {createMatch.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Users className="h-4 w-4" />
                      )}
                      Create Invite Match
                    </Button>
                    <Button
                      onClick={() => setShowJoinDialog(true)}
                      disabled={!latestVersion}
                      className="gap-2"
                    >
                      <Zap className="h-4 w-4" />
                      Find Match
                    </Button>
                  </>
                ) : (
                  <Button asChild>
                    <Link href="/login">Sign in to Compete</Link>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requirements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Requirements
            </CardTitle>
            <CardDescription>
              Complete these requirements to score points in this challenge
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requirements.length > 0 ? (
              <ul className="space-y-3">
                {requirements.map((req, index) => (
                  <li
                    key={req.id || index}
                    className="flex items-start gap-3 p-4 bg-muted rounded-lg"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
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
              <p className="text-muted-foreground text-center py-8">
                Requirements will be displayed when you join a match.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Constraints */}
        {constraints && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Constraints
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {constraints.maxDurationMinutes && (
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{constraints.maxDurationMinutes}</div>
                    <div className="text-sm text-muted-foreground">Minutes</div>
                  </div>
                )}
                {constraints.maxFiles && (
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{constraints.maxFiles}</div>
                    <div className="text-sm text-muted-foreground">Max Files</div>
                  </div>
                )}
                {constraints.maxFileSize && (
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">
                      {Math.round(constraints.maxFileSize / 1024)}
                    </div>
                    <div className="text-sm text-muted-foreground">KB per file</div>
                  </div>
                )}
                {constraints.allowedLanguages && constraints.allowedLanguages.length > 0 && (
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{constraints.allowedLanguages.length}</div>
                    <div className="text-sm text-muted-foreground">Languages</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Join Queue Dialog */}
        <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Find a Match</DialogTitle>
              <DialogDescription>
                Join the matchmaking queue for this challenge. You'll be matched with another
                player of similar skill level.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span>Entry Stake</span>
                <span className="font-bold">100 credits</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span>Duration</span>
                <span className="font-bold">{constraints?.maxDurationMinutes || 60} minutes</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Your stake will be held until the match is complete. The winner takes all
                (minus platform fee).
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowJoinDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleJoinQueue}
                disabled={joinQueue.isPending}
                className="gap-2"
              >
                {joinQueue.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Join Queue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invite Link Dialog */}
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Created!</DialogTitle>
              <DialogDescription>
                Share this link with your opponent to start the match.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-muted rounded-lg text-sm break-all">
                  {inviteLink}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopyInvite}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                Close
              </Button>
              <Button asChild>
                <Link href={inviteLink?.replace(window.location.origin, '') || '#'}>
                  Go to Match
                </Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
