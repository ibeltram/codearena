'use client';

import {
  Calendar,
  Users,
  Trophy,
  Clock,
  Coins,
  Shield,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Tournament,
  statusLabels,
  statusColors,
  formatLabels,
  formatDescriptions,
  formatPrizePool,
  getTimeUntilStart,
  canRegister,
  canCheckIn,
  getCheckInWindowStatus,
  getCheckInWindowTime,
} from '@/types/tournament';

interface TournamentHeaderProps {
  tournament: Tournament;
  isRegistered?: boolean;
  isCheckedIn?: boolean;
  isLoading?: boolean;
  onRegister?: () => void;
  onWithdraw?: () => void;
  onCheckIn?: () => void;
}

export function TournamentHeader({
  tournament,
  isRegistered = false,
  isCheckedIn = false,
  isLoading = false,
  onRegister,
  onWithdraw,
  onCheckIn,
}: TournamentHeaderProps) {
  const isRegistrationOpen = tournament.status === 'registration_open';
  const isLive = tournament.status === 'in_progress';
  const isCompleted = tournament.status === 'completed';
  const registrationAvailable = canRegister(tournament);
  const checkInAvailable = canCheckIn(tournament, isRegistered, isCheckedIn);
  const checkInWindowStatus = getCheckInWindowStatus(tournament);
  const checkInWindowTime = getCheckInWindowTime(tournament);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const participantProgress =
    (tournament.participantCount / tournament.maxParticipants) * 100;

  return (
    <div className="space-y-6">
      {/* Main header card */}
      <Card>
        <CardContent className="p-6">
          {/* Status and format badges */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge
              className={`${statusColors[tournament.status]} text-white`}
              variant="secondary"
            >
              {isLive && (
                <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
              )}
              {statusLabels[tournament.status]}
            </Badge>
            <Badge variant="outline">{formatLabels[tournament.format]}</Badge>
            {tournament.challenge && (
              <Badge variant="secondary">
                {tournament.challenge.category} - {tournament.challenge.difficulty}
              </Badge>
            )}
          </div>

          {/* Tournament name and description */}
          <h1 className="text-3xl font-bold mb-2">{tournament.name}</h1>
          {tournament.description && (
            <p className="text-muted-foreground mb-4">{tournament.description}</p>
          )}

          {/* Key info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {/* Start time */}
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Starts</p>
                <p className="font-medium">{formatDate(tournament.startAt)}</p>
                {!isLive && !isCompleted && (
                  <p className="text-sm text-primary">
                    {getTimeUntilStart(tournament.startAt)}
                  </p>
                )}
              </div>
            </div>

            {/* Prize pool */}
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Prize Pool</p>
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  {formatPrizePool(tournament.prizePoolJson)}
                </p>
              </div>
            </div>

            {/* Entry fee */}
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Coins className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Entry Fee</p>
                <p className="font-medium">
                  {tournament.entryFeeCredits > 0
                    ? `${tournament.entryFeeCredits} credits`
                    : 'Free'}
                </p>
              </div>
            </div>

            {/* Format info */}
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Shield className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Format</p>
                <p className="font-medium">{formatLabels[tournament.format]}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDescriptions[tournament.format]}
                </p>
              </div>
            </div>
          </div>

          {/* Participants progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Participants</span>
              </div>
              <span className="text-sm font-medium">
                {tournament.participantCount} / {tournament.maxParticipants}
              </span>
            </div>
            <Progress value={participantProgress} className="h-2" />
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Min: {tournament.minParticipants}</span>
              <span>
                {tournament.maxParticipants - tournament.participantCount} spots
                remaining
              </span>
            </div>
          </div>

          {/* Registration deadline warning */}
          {tournament.registrationEndAt && isRegistrationOpen && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 mb-4">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                Registration closes {formatDate(tournament.registrationEndAt)}
              </span>
            </div>
          )}

          {/* Check-in window info */}
          {isRegistered && checkInWindowStatus !== 'not_configured' && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
                isCheckedIn
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : checkInWindowStatus === 'open'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                  : checkInWindowStatus === 'not_started'
                  ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              }`}
            >
              {isCheckedIn ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">You are checked in!</span>
                </>
              ) : checkInWindowStatus === 'open' ? (
                <>
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">
                    <strong>Check-in is open!</strong>
                    {checkInWindowTime && ` ${checkInWindowTime}`}
                  </span>
                </>
              ) : checkInWindowStatus === 'not_started' ? (
                <>
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">
                    Check-in not yet open.
                    {checkInWindowTime && ` ${checkInWindowTime}`}
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Check-in period has ended. You did not check in.
                  </span>
                </>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {isRegistered ? (
              <>
                <Badge variant="secondary" className="py-2 px-4">
                  <Users className="h-4 w-4 mr-2" />
                  You are registered
                </Badge>
                {isCheckedIn && (
                  <Badge variant="default" className="py-2 px-4 bg-green-600">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Checked In
                  </Badge>
                )}
                {(tournament.status === 'registration_open' ||
                  tournament.status === 'registration_closed') && (
                  <>
                    {checkInAvailable && (
                      <Button
                        variant="default"
                        onClick={onCheckIn}
                        disabled={isLoading}
                        className="gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Check In Now
                      </Button>
                    )}
                    {!isCheckedIn && checkInWindowStatus === 'not_started' && (
                      <Button variant="outline" disabled className="gap-2">
                        <Clock className="h-4 w-4" />
                        Check-in Not Open
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={onWithdraw}
                      disabled={isLoading}
                    >
                      Withdraw
                    </Button>
                  </>
                )}
              </>
            ) : registrationAvailable ? (
              <Button onClick={onRegister} disabled={isLoading} className="gap-2">
                <Trophy className="h-4 w-4" />
                Register Now
                {tournament.entryFeeCredits > 0 && (
                  <span className="text-xs opacity-75">
                    ({tournament.entryFeeCredits} credits)
                  </span>
                )}
              </Button>
            ) : tournament.status === 'registration_closed' ? (
              <Badge variant="secondary" className="py-2 px-4">
                Registration Closed
              </Badge>
            ) : isCompleted ? (
              <Badge variant="secondary" className="py-2 px-4">
                Tournament Complete
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Prize distribution card */}
      {tournament.prizePoolJson?.distribution &&
        tournament.prizePoolJson.distribution.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Prize Distribution
              </h3>
              <div className="space-y-2">
                {tournament.prizePoolJson.distribution.map((prize, index) => (
                  <div
                    key={prize.place}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                          prize.place === 1
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : prize.place === 2
                            ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                            : prize.place === 3
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {prize.place}
                      </span>
                      <span>
                        {prize.place === 1
                          ? '1st Place'
                          : prize.place === 2
                          ? '2nd Place'
                          : prize.place === 3
                          ? '3rd Place'
                          : `${prize.place}th Place`}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">
                        {prize.amount.toLocaleString()}{' '}
                        {tournament.prizePoolJson?.currency || 'credits'}
                      </span>
                      {prize.percentage && (
                        <span className="text-sm text-muted-foreground ml-2">
                          ({prize.percentage}%)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
