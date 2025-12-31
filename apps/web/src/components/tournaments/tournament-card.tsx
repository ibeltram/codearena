'use client';

import Link from 'next/link';
import {
  Calendar,
  Users,
  Trophy,
  Clock,
  Coins,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TournamentListItem,
  statusLabels,
  statusColors,
  formatLabels,
  formatPrizePool,
  getTimeUntilStart,
  canRegister,
} from '@/types/tournament';

interface TournamentCardProps {
  tournament: TournamentListItem;
}

export function TournamentCard({ tournament }: TournamentCardProps) {
  const isRegistrationOpen = tournament.status === 'registration_open';
  const isLive = tournament.status === 'in_progress';
  const isCompleted = tournament.status === 'completed';
  const registrationAvailable = canRegister(tournament);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-0">
        <Link href={`/tournaments/${tournament.id}`} className="block">
          {/* Header with status and format badges */}
          <div className="flex items-start justify-between p-4 pb-2">
            <div className="flex flex-wrap gap-2">
              <Badge
                className={`${statusColors[tournament.status]} text-white`}
                variant="secondary"
              >
                {isLive && (
                  <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
                )}
                {statusLabels[tournament.status]}
              </Badge>
              <Badge variant="outline">
                {formatLabels[tournament.format]}
              </Badge>
            </div>
            {tournament.prizePoolJson?.total && (
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Trophy className="h-4 w-4" />
                <span className="text-sm font-semibold">
                  {formatPrizePool(tournament.prizePoolJson)}
                </span>
              </div>
            )}
          </div>

          {/* Tournament name */}
          <div className="px-4 py-2">
            <h3 className="text-lg font-semibold group-hover:text-primary transition-colors line-clamp-1">
              {tournament.name}
            </h3>
            {tournament.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {tournament.description}
              </p>
            )}
          </div>

          {/* Stats row */}
          <div className="px-4 py-3 flex items-center gap-4 text-sm text-muted-foreground border-t">
            {/* Participants */}
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span>
                {tournament.participantCount}/{tournament.maxParticipants}
              </span>
            </div>

            {/* Start date / time remaining */}
            {!isCompleted && (
              <div className="flex items-center gap-1.5">
                {isLive ? (
                  <>
                    <Clock className="h-4 w-4 text-green-500" />
                    <span className="text-green-600 dark:text-green-400">Live Now</span>
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(tournament.startAt)}</span>
                  </>
                )}
              </div>
            )}

            {/* Entry fee */}
            {tournament.entryFeeCredits > 0 && (
              <div className="flex items-center gap-1.5">
                <Coins className="h-4 w-4" />
                <span>{tournament.entryFeeCredits} credits</span>
              </div>
            )}

            {/* Time until start for upcoming */}
            {isRegistrationOpen && (
              <div className="ml-auto flex items-center gap-1.5 text-primary">
                <Clock className="h-4 w-4" />
                <span className="font-medium">
                  Starts in {getTimeUntilStart(tournament.startAt)}
                </span>
              </div>
            )}
          </div>

          {/* Action footer */}
          <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between">
            {registrationAvailable ? (
              <Button size="sm" className="gap-1">
                Register Now
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : isLive ? (
              <Button size="sm" variant="secondary" className="gap-1">
                View Bracket
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : isCompleted ? (
              <Button size="sm" variant="ghost" className="gap-1">
                View Results
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="gap-1">
                View Details
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}

            {/* Spots remaining indicator */}
            {isRegistrationOpen && (
              <span className="text-sm text-muted-foreground">
                {tournament.maxParticipants - tournament.participantCount} spots left
              </span>
            )}
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
