'use client';

import { useMemo, useRef, useEffect, useCallback } from 'react';
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

// Constants for bracket layout
const MATCH_WIDTH = 200;
const MATCH_HEIGHT = 80;
const ROUND_GAP = 80;
const MATCH_GAP_BASE = 20;
const CONNECTOR_WIDTH = 40;

interface BracketViewerProps {
  format: TournamentFormat;
  rounds: Record<number, BracketMatch[]>;
  participants: Record<string, BracketParticipantInfo>;
  totalRounds: number;
  onMatchClick?: (match: BracketMatch) => void;
  autoScrollToActive?: boolean;
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

function getRoundName(round: number, totalRounds: number, bracketSide?: string | null): string {
  // Handle special bracket sides for double elimination
  if (bracketSide === 'grand_finals') return 'Grand Finals';
  if (bracketSide === 'grand_finals_reset') return 'Bracket Reset';

  // Standard round names for winners/losers brackets
  const prefix = bracketSide === 'losers' ? 'L' : bracketSide === 'winners' ? 'W' : '';

  if (round === totalRounds) return `${prefix}Finals`.trim();
  if (round === totalRounds - 1) return `${prefix}Semi-Finals`.trim();
  if (round === totalRounds - 2) return `${prefix}Quarter-Finals`.trim();
  return `${prefix}Round ${round}`.trim();
}

// Get bracket side display label
function getBracketSideLabel(bracketSide: string | null): string {
  switch (bracketSide) {
    case 'winners': return 'Winners Bracket';
    case 'losers': return 'Losers Bracket';
    case 'grand_finals': return 'Grand Finals';
    case 'grand_finals_reset': return 'Bracket Reset';
    default: return '';
  }
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

/**
 * SVG Connector component for drawing lines between matches
 */
function BracketConnector({
  fromY,
  toY,
  roundIndex,
  matchesInRound,
  isLast,
}: {
  fromY: number;
  toY: number;
  roundIndex: number;
  matchesInRound: number;
  isLast: boolean;
}) {
  if (isLast) return null;

  const midX = CONNECTOR_WIDTH / 2;

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: MATCH_WIDTH,
        width: CONNECTOR_WIDTH,
        height: '100%',
        top: 0,
      }}
    >
      {/* Draw horizontal line from match to middle */}
      <line
        x1={0}
        y1={fromY + MATCH_HEIGHT / 2}
        x2={midX}
        y2={fromY + MATCH_HEIGHT / 2}
        stroke="currentColor"
        strokeWidth={2}
        className="text-border"
      />
      {/* Draw vertical line connecting two matches to one */}
      <line
        x1={midX}
        y1={fromY + MATCH_HEIGHT / 2}
        x2={midX}
        y2={toY + MATCH_HEIGHT / 2}
        stroke="currentColor"
        strokeWidth={2}
        className="text-border"
      />
      {/* Draw horizontal line from middle to next round */}
      <line
        x1={midX}
        y1={(fromY + toY) / 2 + MATCH_HEIGHT / 2}
        x2={CONNECTOR_WIDTH}
        y2={(fromY + toY) / 2 + MATCH_HEIGHT / 2}
        stroke="currentColor"
        strokeWidth={2}
        className="text-border"
      />
    </svg>
  );
}

export function BracketViewer({
  format,
  rounds,
  participants,
  totalRounds,
  onMatchClick,
  autoScrollToActive = true,
}: BracketViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeMatchRef = useRef<HTMLDivElement>(null);

  // Organize matches by round
  const roundNumbers = useMemo(() => {
    return Object.keys(rounds)
      .map(Number)
      .sort((a, b) => a - b);
  }, [rounds]);

  // Find the current active round (first round with in_progress or pending matches)
  const activeRound = useMemo(() => {
    for (const roundNum of roundNumbers) {
      const roundMatches = rounds[roundNum] || [];
      const hasActive = roundMatches.some(
        (m) => m.status === 'in_progress' || m.status === 'pending'
      );
      if (hasActive) return roundNum;
    }
    return roundNumbers[roundNumbers.length - 1]; // Default to last round
  }, [rounds, roundNumbers]);

  // Auto-scroll to active round
  useEffect(() => {
    if (autoScrollToActive && activeMatchRef.current && containerRef.current) {
      const container = containerRef.current;
      const activeElement = activeMatchRef.current;

      // Calculate scroll position to center the active round
      const containerWidth = container.clientWidth;
      const elementLeft = activeElement.offsetLeft;
      const elementWidth = activeElement.clientWidth;
      const scrollTo = elementLeft - containerWidth / 2 + elementWidth / 2;

      container.scrollTo({
        left: Math.max(0, scrollTo),
        behavior: 'smooth',
      });
    }
  }, [autoScrollToActive, activeRound]);

  // Calculate match positions for SVG connectors
  const getMatchYPositions = useCallback(
    (roundNum: number, matchCount: number) => {
      const positions: number[] = [];
      const totalHeight =
        matchCount * MATCH_HEIGHT + (matchCount - 1) * MATCH_GAP_BASE * Math.pow(2, roundNum - 1);
      const gapBetweenMatches = MATCH_GAP_BASE * Math.pow(2, roundNum - 1);

      let currentY = 0;
      for (let i = 0; i < matchCount; i++) {
        positions.push(currentY);
        currentY += MATCH_HEIGHT + gapBetweenMatches;
      }
      return positions;
    },
    []
  );

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
    <div ref={containerRef} className="overflow-x-auto pb-4 scroll-smooth">
      <div className="inline-flex min-w-max p-4" style={{ gap: ROUND_GAP }}>
        {roundNumbers.map((roundNum, roundIndex) => {
          const roundMatches = rounds[roundNum] || [];
          const roundName = getRoundName(roundNum, totalRounds);
          const isActiveRound = roundNum === activeRound;
          const isLastRound = roundIndex === roundNumbers.length - 1;
          const matchYPositions = getMatchYPositions(roundNum, roundMatches.length);

          return (
            <div
              key={roundNum}
              ref={isActiveRound ? activeMatchRef : undefined}
              className="flex flex-col relative"
              style={{ width: MATCH_WIDTH + (isLastRound ? 0 : CONNECTOR_WIDTH) }}
            >
              {/* Round header */}
              <div className="text-center mb-4">
                <h3
                  className={cn(
                    'font-semibold text-sm uppercase tracking-wide',
                    isActiveRound ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {roundName}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {roundMatches.length} match{roundMatches.length !== 1 ? 'es' : ''}
                </p>
                {isActiveRound && (
                  <div className="mt-1">
                    <Badge variant="secondary" className="text-xs">
                      Current Round
                    </Badge>
                  </div>
                )}
              </div>

              {/* Matches in this round with connectors */}
              <div className="flex flex-col relative" style={{ width: MATCH_WIDTH }}>
                {roundMatches.map((match, matchIndex) => {
                  const isLive = match.status === 'in_progress';
                  const matchY = matchYPositions[matchIndex];
                  const isEven = matchIndex % 2 === 0;

                  return (
                    <div
                      key={match.id}
                      className="relative"
                      style={{
                        marginTop:
                          matchIndex === 0
                            ? 0
                            : MATCH_GAP_BASE * Math.pow(2, roundNum - 1),
                      }}
                    >
                      <MatchNode
                        match={match}
                        participants={participants}
                        onClick={() => onMatchClick?.(match)}
                        roundName={roundName}
                      />
                    </div>
                  );
                })}

                {/* SVG Connectors to next round */}
                {!isLastRound && roundMatches.length > 1 && (
                  <svg
                    className="absolute pointer-events-none text-border"
                    style={{
                      left: MATCH_WIDTH,
                      top: 0,
                      width: CONNECTOR_WIDTH + ROUND_GAP,
                      height: '100%',
                    }}
                  >
                    {roundMatches.map((match, idx) => {
                      if (idx % 2 !== 0) return null; // Only draw from even indices

                      const y1 = matchYPositions[idx] + MATCH_HEIGHT / 2;
                      const y2 =
                        idx + 1 < roundMatches.length
                          ? matchYPositions[idx + 1] + MATCH_HEIGHT / 2
                          : y1;
                      const midY = (y1 + y2) / 2;
                      const nextRoundY =
                        (matchYPositions[Math.floor(idx / 2)] || 0) + MATCH_HEIGHT / 2;

                      return (
                        <g key={match.id}>
                          {/* Horizontal line from top match */}
                          <line
                            x1={0}
                            y1={y1}
                            x2={20}
                            y2={y1}
                            stroke="currentColor"
                            strokeWidth={2}
                          />
                          {/* Horizontal line from bottom match */}
                          {idx + 1 < roundMatches.length && (
                            <line
                              x1={0}
                              y1={y2}
                              x2={20}
                              y2={y2}
                              stroke="currentColor"
                              strokeWidth={2}
                            />
                          )}
                          {/* Vertical connector */}
                          {idx + 1 < roundMatches.length && (
                            <line
                              x1={20}
                              y1={y1}
                              x2={20}
                              y2={y2}
                              stroke="currentColor"
                              strokeWidth={2}
                            />
                          )}
                          {/* Horizontal line to next round */}
                          <line
                            x1={20}
                            y1={midY}
                            x2={CONNECTOR_WIDTH + ROUND_GAP}
                            y2={midY}
                            stroke="currentColor"
                            strokeWidth={2}
                          />
                        </g>
                      );
                    })}
                  </svg>
                )}
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

// Compact bracket view for small screens - handles both single and double elimination
export function BracketList({
  matches,
  participants,
  onMatchClick,
}: {
  matches: BracketMatch[];
  participants: Record<string, BracketParticipantInfo>;
  onMatchClick?: (match: BracketMatch) => void;
}) {
  // Group by bracket side, then by round
  const bracketGroups = useMemo(() => {
    // Check if this is a double elimination bracket
    const hasWinnersBracket = matches.some(m => m.bracketSide === 'winners');
    const hasLosersBracket = matches.some(m => m.bracketSide === 'losers');
    const isDoubleElim = hasWinnersBracket && hasLosersBracket;

    if (!isDoubleElim) {
      // Single elimination - just group by round
      const groups: Record<number, BracketMatch[]> = {};
      matches.forEach((match) => {
        if (!groups[match.round]) groups[match.round] = [];
        groups[match.round].push(match);
      });
      return { type: 'single' as const, rounds: groups };
    }

    // Double elimination - group by bracket side then round
    const winners: Record<number, BracketMatch[]> = {};
    const losers: Record<number, BracketMatch[]> = {};
    const grandFinals: BracketMatch[] = [];
    const bracketReset: BracketMatch[] = [];

    matches.forEach((match) => {
      if (match.bracketSide === 'winners') {
        if (!winners[match.round]) winners[match.round] = [];
        winners[match.round].push(match);
      } else if (match.bracketSide === 'losers') {
        if (!losers[match.round]) losers[match.round] = [];
        losers[match.round].push(match);
      } else if (match.bracketSide === 'grand_finals') {
        grandFinals.push(match);
      } else if (match.bracketSide === 'grand_finals_reset') {
        bracketReset.push(match);
      }
    });

    return {
      type: 'double' as const,
      winners,
      losers,
      grandFinals,
      bracketReset,
    };
  }, [matches]);

  const renderMatch = (match: BracketMatch) => {
    const p1 = getParticipantInfo(match.participant1Id, participants);
    const p2 = getParticipantInfo(match.participant2Id, participants);
    const isComplete = match.status === 'completed';
    const isBye = match.status === 'bye';
    const winner = match.winnerId;

    return (
      <Card
        key={match.id}
        className={cn(
          'cursor-pointer hover:bg-muted/50',
          isBye && 'opacity-60'
        )}
        onClick={() => onMatchClick?.(match)}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex flex-col gap-1 flex-1">
                <span
                  className={cn(
                    'text-sm',
                    isComplete && winner === match.participant1Id && 'font-semibold text-green-600 dark:text-green-400'
                  )}
                >
                  {p1?.displayName || 'TBD'}
                </span>
                <span className="text-xs text-muted-foreground">vs</span>
                <span
                  className={cn(
                    'text-sm',
                    isComplete && winner === match.participant2Id && 'font-semibold text-green-600 dark:text-green-400'
                  )}
                >
                  {p2?.displayName || 'TBD'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isBye && (
                <Badge variant="outline" className="text-xs">Skipped</Badge>
              )}
              {isComplete && !isBye && (
                <Badge variant="secondary" className="text-xs">Done</Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (bracketGroups.type === 'single') {
    const roundNumbers = Object.keys(bracketGroups.rounds)
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
              {bracketGroups.rounds[roundNum].map(renderMatch)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Double elimination layout
  const winnersRounds = Object.keys(bracketGroups.winners).map(Number).sort((a, b) => a - b);
  const losersRounds = Object.keys(bracketGroups.losers).map(Number).sort((a, b) => a - b);
  const maxWinnersRound = Math.max(...winnersRounds, 0);
  const maxLosersRound = Math.max(...losersRounds, 0);

  return (
    <div className="space-y-8">
      {/* Winners Bracket */}
      <div>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Winners Bracket
        </h2>
        <div className="space-y-4 pl-4 border-l-2 border-amber-300">
          {winnersRounds.map((roundNum) => (
            <div key={`w-${roundNum}`}>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                {getRoundName(roundNum, maxWinnersRound, 'winners')}
              </h4>
              <div className="space-y-2">
                {bracketGroups.winners[roundNum].map(renderMatch)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Losers Bracket */}
      {losersRounds.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-gray-500" />
            Losers Bracket
          </h2>
          <div className="space-y-4 pl-4 border-l-2 border-gray-300">
            {losersRounds.map((roundNum) => (
              <div key={`l-${roundNum}`}>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {getRoundName(roundNum, maxLosersRound, 'losers')}
                </h4>
                <div className="space-y-2">
                  {bracketGroups.losers[roundNum].map(renderMatch)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grand Finals */}
      {bracketGroups.grandFinals.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-purple-500" />
            Grand Finals
          </h2>
          <div className="pl-4 border-l-2 border-purple-300 space-y-2">
            {bracketGroups.grandFinals.map(renderMatch)}
          </div>
        </div>
      )}

      {/* Bracket Reset */}
      {bracketGroups.bracketReset.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-red-500" />
            Bracket Reset
            <span className="text-xs font-normal text-muted-foreground">
              (if losers bracket champion wins grand finals)
            </span>
          </h2>
          <div className="pl-4 border-l-2 border-red-300 space-y-2">
            {bracketGroups.bracketReset.map(renderMatch)}
          </div>
        </div>
      )}
    </div>
  );
}
