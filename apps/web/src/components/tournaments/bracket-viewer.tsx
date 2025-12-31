'use client';

import { useMemo } from 'react';
import { User, Trophy, Clock, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  BracketMatch,
  BracketParticipantInfo,
  TournamentFormat,
  BracketMatchStatus,
} from '@/types/tournament';

interface BracketViewerProps {
  format: TournamentFormat;
  rounds: Record<number, BracketMatch[]>;
  participants: Record<string, BracketParticipantInfo>;
  totalRounds: number;
  onMatchClick?: (match: BracketMatch) => void;
}

interface MatchNodeProps {
  match: BracketMatch;
  participants: Record<string, BracketParticipantInfo>;
  onClick?: () => void;
  roundName?: string;
}

function getParticipantInfo(
  participantId: string | null,
  participants: Record<string, BracketParticipantInfo>
): BracketParticipantInfo | null {
  if (!participantId) return null;
  return participants[participantId] || null;
}

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return 'Finals';
  if (round === totalRounds - 1) return 'Semi-Finals';
  if (round === totalRounds - 2) return 'Quarter-Finals';
  return `Round ${round}`;
}

function MatchNode({ match, participants, onClick, roundName }: MatchNodeProps) {
  const participant1 = getParticipantInfo(match.participant1Id, participants);
  const participant2 = getParticipantInfo(match.participant2Id, participants);
  const winner = match.winnerId ? getParticipantInfo(match.winnerId, participants) : null;

  const isComplete = match.status === 'completed';
  const isLive = match.status === 'in_progress';
  const isBye = match.status === 'bye';

  const getStatusBadge = () => {
    if (isLive) {
      return (
        <Badge className="bg-green-500 text-white animate-pulse">
          <Clock className="h-3 w-3 mr-1" />
          Live
        </Badge>
      );
    }
    if (isComplete) {
      return <Badge variant="secondary">Complete</Badge>;
    }
    if (isBye) {
      return <Badge variant="outline">BYE</Badge>;
    }
    return <Badge variant="outline">Pending</Badge>;
  };

  const ParticipantRow = ({
    participant,
    isWinner,
    isTop,
  }: {
    participant: BracketParticipantInfo | null;
    isWinner: boolean;
    isTop: boolean;
  }) => (
    <div
      className={cn(
        'flex items-center gap-2 p-2',
        isTop ? 'border-b' : '',
        isWinner && isComplete && 'bg-green-50 dark:bg-green-900/20',
        !participant && 'opacity-50'
      )}
    >
      {participant ? (
        <>
          <Avatar className="h-6 w-6">
            <AvatarImage src={participant.avatarUrl || undefined} />
            <AvatarFallback>
              {participant.displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              'text-sm flex-1 truncate',
              isWinner && isComplete && 'font-semibold text-green-700 dark:text-green-400'
            )}
          >
            {participant.displayName}
          </span>
          {isWinner && isComplete && (
            <Trophy className="h-4 w-4 text-amber-500" />
          )}
        </>
      ) : (
        <>
          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
            <User className="h-3 w-3 text-muted-foreground" />
          </div>
          <span className="text-sm text-muted-foreground italic">
            {isBye ? 'BYE' : 'TBD'}
          </span>
        </>
      )}
    </div>
  );

  return (
    <Card
      className={cn(
        'w-48 cursor-pointer transition-shadow hover:shadow-md',
        isLive && 'ring-2 ring-green-500',
        isComplete && 'opacity-90'
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between px-2 py-1 bg-muted/50 text-xs">
        <span className="text-muted-foreground">Match {match.position + 1}</span>
        {getStatusBadge()}
      </div>
      <ParticipantRow
        participant={participant1}
        isWinner={match.winnerId === match.participant1Id}
        isTop={true}
      />
      <ParticipantRow
        participant={participant2}
        isWinner={match.winnerId === match.participant2Id}
        isTop={false}
      />
    </Card>
  );
}

export function BracketViewer({
  format,
  rounds,
  participants,
  totalRounds,
  onMatchClick,
}: BracketViewerProps) {
  // Organize matches by round
  const roundNumbers = useMemo(() => {
    return Object.keys(rounds)
      .map(Number)
      .sort((a, b) => a - b);
  }, [rounds]);

  if (roundNumbers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Bracket Not Generated</h3>
          <p className="text-muted-foreground">
            The tournament bracket will be available once registration closes.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="inline-flex gap-8 min-w-max p-4">
        {roundNumbers.map((roundNum) => {
          const roundMatches = rounds[roundNum] || [];
          const roundName = getRoundName(roundNum, totalRounds);

          return (
            <div key={roundNum} className="flex flex-col">
              {/* Round header */}
              <div className="text-center mb-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  {roundName}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {roundMatches.length} match{roundMatches.length !== 1 ? 'es' : ''}
                </p>
              </div>

              {/* Matches in this round */}
              <div
                className="flex flex-col justify-around flex-1"
                style={{
                  gap: `${Math.pow(2, roundNum - 1) * 2}rem`,
                }}
              >
                {roundMatches.map((match) => (
                  <MatchNode
                    key={match.id}
                    match={match}
                    participants={participants}
                    onClick={() => onMatchClick?.(match)}
                    roundName={roundName}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Champion display */}
        {totalRounds > 0 && (
          <div className="flex flex-col items-center justify-center">
            <div className="text-center mb-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Champion
              </h3>
            </div>
            <div className="w-48 h-24 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              {(() => {
                const finalsMatch = rounds[totalRounds]?.[0];
                const champion = finalsMatch?.winnerId
                  ? getParticipantInfo(finalsMatch.winnerId, participants)
                  : null;

                if (champion) {
                  return (
                    <div className="flex flex-col items-center gap-2">
                      <Trophy className="h-8 w-8 text-amber-500" />
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {champion.displayName}
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Trophy className="h-8 w-8" />
                    <span className="text-sm">TBD</span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Compact bracket view for small screens
export function BracketList({
  matches,
  participants,
  onMatchClick,
}: {
  matches: BracketMatch[];
  participants: Record<string, BracketParticipantInfo>;
  onMatchClick?: (match: BracketMatch) => void;
}) {
  // Group by round
  const roundGroups = useMemo(() => {
    const groups: Record<number, BracketMatch[]> = {};
    matches.forEach((match) => {
      if (!groups[match.round]) groups[match.round] = [];
      groups[match.round].push(match);
    });
    return groups;
  }, [matches]);

  const roundNumbers = Object.keys(roundGroups)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {roundNumbers.map((roundNum) => (
        <div key={roundNum}>
          <h3 className="font-semibold mb-3">
            {getRoundName(roundNum, Math.max(...roundNumbers))}
          </h3>
          <div className="space-y-2">
            {roundGroups[roundNum].map((match) => {
              const p1 = getParticipantInfo(match.participant1Id, participants);
              const p2 = getParticipantInfo(match.participant2Id, participants);
              const isComplete = match.status === 'completed';
              const winner = match.winnerId;

              return (
                <Card
                  key={match.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onMatchClick?.(match)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex flex-col gap-1 flex-1">
                          <span
                            className={cn(
                              'text-sm',
                              isComplete && winner === match.participant1Id && 'font-semibold'
                            )}
                          >
                            {p1?.displayName || 'TBD'}
                          </span>
                          <span className="text-xs text-muted-foreground">vs</span>
                          <span
                            className={cn(
                              'text-sm',
                              isComplete && winner === match.participant2Id && 'font-semibold'
                            )}
                          >
                            {p2?.displayName || 'TBD'}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
