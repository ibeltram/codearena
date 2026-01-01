'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Users,
  Trophy,
  Clock,
  BookOpen,
  LayoutGrid,
  List,
} from 'lucide-react';

import { MainLayout } from '@/components/layout';
import {
  TournamentHeader,
  BracketViewer,
  BracketList,
  PrizeClaimCard,
} from '@/components/tournaments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useTournament,
  useTournamentParticipants,
  useTournamentBracket,
  useRegisterForTournament,
  useWithdrawFromTournament,
  useCheckInToTournament,
} from '@/hooks/use-tournament';
import { BracketMatch, PrizeType } from '@/types/tournament';
import { useAuthStore } from '@/store';

type TabType = 'bracket' | 'participants' | 'rules';

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.id as string;

  // Get current user from auth store
  const { user, isAuthenticated } = useAuthStore();
  const currentUserId = user?.id;

  const [activeTab, setActiveTab] = useState<TabType>('bracket');
  const [bracketView, setBracketView] = useState<'tree' | 'list'>('tree');

  const { data: tournament, isLoading, isError, error } = useTournament(tournamentId);
  const { data: participantsData, isLoading: isLoadingParticipants } =
    useTournamentParticipants(tournamentId);
  const { data: bracketData, isLoading: isLoadingBracket } =
    useTournamentBracket(tournamentId);

  const registerMutation = useRegisterForTournament();
  const withdrawMutation = useWithdrawFromTournament();
  const checkInMutation = useCheckInToTournament();

  const handleRegister = () => {
    registerMutation.mutate(tournamentId);
  };

  const handleWithdraw = () => {
    if (confirm('Are you sure you want to withdraw from this tournament?')) {
      withdrawMutation.mutate(tournamentId);
    }
  };

  const handleCheckIn = () => {
    checkInMutation.mutate(tournamentId);
  };

  const handleMatchClick = (match: BracketMatch) => {
    // If match has a linked match ID, navigate to it
    if (match.matchId) {
      router.push(`/matches/${match.matchId}`);
    }
  };

  // Check if current user is registered in the tournament
  const isRegistered = useMemo(() => {
    if (!isAuthenticated || !currentUserId || !participantsData?.participants) {
      return false;
    }
    return participantsData.participants.some(
      (participant) => participant.user.id === currentUserId
    );
  }, [isAuthenticated, currentUserId, participantsData?.participants]);

  // Check if current user is checked in
  const isCheckedIn = useMemo(() => {
    if (!isAuthenticated || !currentUserId || !participantsData?.participants) {
      return false;
    }
    const userParticipant = participantsData.participants.find(
      (p) => p.user.id === currentUserId
    );
    return userParticipant?.isCheckedIn || false;
  }, [isAuthenticated, currentUserId, participantsData?.participants]);

  // Get user's placement for prize claim eligibility
  const userPlacement = useMemo(() => {
    if (!isAuthenticated || !currentUserId || !participantsData?.participants) {
      return null;
    }
    const userParticipant = participantsData.participants.find(
      (p) => p.user.id === currentUserId
    );
    return userParticipant?.finalPlacement || null;
  }, [isAuthenticated, currentUserId, participantsData?.participants]);

  // Get prize info for user's placement
  const prizeInfo = useMemo(() => {
    if (!userPlacement || !tournament?.prizePoolJson) {
      return null;
    }
    const prizePool = tournament.prizePoolJson as {
      prizes?: Array<{ placement: number; type: PrizeType; value: string }>;
    };
    if (!prizePool.prizes) {
      return null;
    }
    const prize = prizePool.prizes.find((p) => p.placement === userPlacement);
    return prize || null;
  }, [userPlacement, tournament?.prizePoolJson]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-32" />
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <div className="grid grid-cols-4 gap-4 mt-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  if (isError || !tournament) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Link
            href="/tournaments"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tournaments
          </Link>

          <Card className="border-destructive bg-destructive/10">
            <CardContent className="py-12 text-center">
              <Trophy className="h-12 w-12 mx-auto text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Tournament Not Found</h3>
              <p className="text-muted-foreground mb-4">
                {error?.message || 'The tournament you\'re looking for doesn\'t exist.'}
              </p>
              <Button asChild>
                <Link href="/tournaments">Browse Tournaments</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  const tabs = [
    { id: 'bracket' as const, label: 'Bracket', icon: LayoutGrid },
    { id: 'participants' as const, label: 'Participants', icon: Users },
    { id: 'rules' as const, label: 'Rules', icon: BookOpen },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/tournaments"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tournaments
        </Link>

        {/* Tournament header */}
        <TournamentHeader
          tournament={tournament}
          isRegistered={isRegistered}
          isCheckedIn={isCheckedIn}
          isLoading={
            registerMutation.isPending ||
            withdrawMutation.isPending ||
            checkInMutation.isPending
          }
          onRegister={handleRegister}
          onWithdraw={handleWithdraw}
          onCheckIn={handleCheckIn}
        />

        {/* Prize claim card for eligible winners */}
        <PrizeClaimCard
          tournamentId={tournamentId}
          tournamentName={tournament.name}
          isCompleted={tournament.status === 'completed'}
          userPlacement={userPlacement}
          prizeInfo={prizeInfo}
        />

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}

          {/* Bracket view toggle (only shown on bracket tab) */}
          {activeTab === 'bracket' && (
            <div className="ml-auto flex items-center gap-1 pb-2">
              <Button
                variant={bracketView === 'tree' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setBracketView('tree')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={bracketView === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setBracketView('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Tab content */}
        {activeTab === 'bracket' && (
          <div>
            {isLoadingBracket ? (
              <Card>
                <CardContent className="py-12 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : bracketData && bracketData.matches.length > 0 ? (
              bracketView === 'tree' ? (
                <BracketViewer
                  format={bracketData.format}
                  rounds={bracketData.rounds}
                  participants={bracketData.participants}
                  totalRounds={bracketData.totalRounds}
                  onMatchClick={handleMatchClick}
                />
              ) : (
                <BracketList
                  matches={bracketData.matches}
                  participants={bracketData.participants}
                  onMatchClick={handleMatchClick}
                />
              )
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Bracket Not Yet Generated</h3>
                  <p className="text-muted-foreground">
                    The tournament bracket will be generated after registration closes.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'participants' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Registered Participants ({participantsData?.total || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingParticipants ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              ) : participantsData && participantsData.participants.length > 0 ? (
                <div className="space-y-2">
                  {participantsData.participants.map((participant, index) => (
                    <div
                      key={participant.id}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-sm text-muted-foreground text-right">
                          {participant.seed || index + 1}
                        </span>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={participant.user.avatarUrl || undefined} />
                          <AvatarFallback>
                            {participant.user.displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <Link
                          href={`/profile/${participant.user.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {participant.user.displayName}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2">
                        {participant.isCheckedIn && (
                          <Badge variant="secondary" className="text-green-600">
                            Checked In
                          </Badge>
                        )}
                        {participant.finalPlacement && (
                          <Badge
                            className={
                              participant.finalPlacement === 1
                                ? 'bg-amber-500'
                                : participant.finalPlacement === 2
                                ? 'bg-gray-400'
                                : participant.finalPlacement === 3
                                ? 'bg-orange-400'
                                : ''
                            }
                          >
                            #{participant.finalPlacement}
                          </Badge>
                        )}
                        {participant.eliminatedAt && !participant.finalPlacement && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Eliminated
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No participants registered yet.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'rules' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Tournament Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tournament.rulesJson && Object.keys(tournament.rulesJson).length > 0 ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <dl className="space-y-4">
                    {tournament.rulesJson.maxMatchDuration && (
                      <div>
                        <dt className="font-semibold">Match Duration</dt>
                        <dd className="text-muted-foreground">
                          {tournament.rulesJson.maxMatchDuration} minutes per match
                        </dd>
                      </div>
                    )}
                    {tournament.rulesJson.checkInRequired !== undefined && (
                      <div>
                        <dt className="font-semibold">Check-in Required</dt>
                        <dd className="text-muted-foreground">
                          {tournament.rulesJson.checkInRequired ? 'Yes' : 'No'}
                          {tournament.rulesJson.checkInWindowMinutes &&
                            ` (${tournament.rulesJson.checkInWindowMinutes} minutes before start)`}
                        </dd>
                      </div>
                    )}
                    {tournament.rulesJson.allowLateRegistration !== undefined && (
                      <div>
                        <dt className="font-semibold">Late Registration</dt>
                        <dd className="text-muted-foreground">
                          {tournament.rulesJson.allowLateRegistration
                            ? 'Allowed'
                            : 'Not allowed'}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {/* Any additional custom rules */}
                  {Object.entries(tournament.rulesJson)
                    .filter(
                      ([key]) =>
                        !['maxMatchDuration', 'checkInRequired', 'checkInWindowMinutes', 'allowLateRegistration'].includes(key)
                    )
                    .map(([key, value]) => (
                      <div key={key} className="mt-4">
                        <dt className="font-semibold capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </dt>
                        <dd className="text-muted-foreground">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </dd>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Standard tournament rules apply. Check back closer to the start date for
                    specific guidelines.
                  </p>
                </div>
              )}

              {/* Challenge info if linked */}
              {tournament.challenge && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-semibold mb-3">Challenge</h4>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{tournament.challenge.title}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline">{tournament.challenge.category}</Badge>
                            <Badge variant="outline">{tournament.challenge.difficulty}</Badge>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/challenges/${tournament.challenge.id}`}>
                            View Challenge
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
