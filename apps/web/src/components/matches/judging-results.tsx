'use client';

import { Trophy, Medal, Check, X, AlertCircle, Award, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type {
  MatchResults,
  ParticipantWithScore,
} from '@/hooks/use-match';

interface JudgingResultsProps {
  results: MatchResults;
  isLoading?: boolean;
}

// Winner announcement banner
function WinnerBanner({ results }: { results: MatchResults }) {
  const { winner, isTie, tieBreaker } = results;

  if (isTie) {
    return (
      <Card className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border-amber-500/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-4">
            <div className="p-3 rounded-full bg-amber-500/20">
              <Minus className="h-8 w-8 text-amber-500" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-amber-400">It's a Tie!</h2>
              <p className="text-muted-foreground">
                Both competitors achieved equal scores
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!winner) {
    return (
      <Card className="bg-muted/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">
              Results are being calculated...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-r from-green-500/20 via-emerald-500/20 to-teal-500/20 border-green-500/30 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-transparent" />
      <CardContent className="p-6 relative">
        <div className="flex items-center justify-center gap-6">
          {/* Trophy icon */}
          <div className="p-4 rounded-full bg-green-500/20 ring-4 ring-green-500/30">
            <Trophy className="h-10 w-10 text-green-400" />
          </div>

          {/* Winner info */}
          <div className="text-center">
            <Badge className="mb-2 bg-green-500/20 text-green-400 border-green-500/30">
              <Award className="h-3 w-3 mr-1" />
              WINNER
            </Badge>
            <div className="flex items-center gap-3 justify-center">
              <Avatar className="h-12 w-12 ring-2 ring-green-500/50">
                <AvatarImage src={winner.avatarUrl || undefined} alt={winner.displayName} />
                <AvatarFallback className="bg-green-500/20 text-green-400">
                  {winner.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-2xl font-bold">{winner.displayName}</h2>
                <p className="text-green-400 font-medium">
                  Score: {winner.totalScore}/100
                </p>
              </div>
            </div>
            {tieBreaker && (
              <p className="text-sm text-muted-foreground mt-2">
                Won by tie-breaker: {tieBreaker}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Score comparison card
function ScoreComparisonCard({ participant, isWinner }: {
  participant: ParticipantWithScore;
  isWinner: boolean;
}) {
  const score = participant.score?.totalScore ?? 0;
  const buildSuccess = participant.score?.breakdown?.buildSuccess ?? false;

  return (
    <Card className={cn(
      'relative overflow-hidden transition-all',
      isWinner && 'ring-2 ring-green-500/50 bg-green-500/5',
      participant.seat === 'A' ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-orange-500'
    )}>
      {isWinner && (
        <div className="absolute top-2 right-2">
          <Medal className="h-6 w-6 text-yellow-500" />
        </div>
      )}

      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={participant.avatarUrl || undefined} alt={participant.displayName} />
            <AvatarFallback>
              {participant.displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-lg">{participant.displayName}</CardTitle>
            <Badge variant="secondary" className="text-xs">
              Seat {participant.seat}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Total score */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Score</span>
            <span className={cn(
              'text-2xl font-bold',
              isWinner ? 'text-green-500' : 'text-foreground'
            )}>
              {score}
              <span className="text-sm text-muted-foreground">/100</span>
            </span>
          </div>
          <Progress
            value={score}
            className={cn(
              'h-3',
              isWinner ? '[&>div]:bg-green-500' : ''
            )}
          />
        </div>

        {/* Build status */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Build Status</span>
          <div className={cn(
            'flex items-center gap-1',
            buildSuccess ? 'text-green-500' : 'text-red-500'
          )}>
            {buildSuccess ? (
              <>
                <Check className="h-4 w-4" />
                <span>Passed</span>
              </>
            ) : (
              <>
                <X className="h-4 w-4" />
                <span>Failed</span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Requirement breakdown row
function RequirementRow({
  requirement,
  participantAScore,
  participantBScore
}: {
  requirement: { id: string; name: string; weight: number };
  participantAScore: number;
  participantBScore: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const maxScore = requirement.weight;

  return (
    <div>
      <div
        className="grid grid-cols-[1fr,100px,60px,100px] gap-4 items-center py-3 px-4 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        {/* Requirement name with toggle */}
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <span className="font-medium">{requirement.name}</span>
        </div>

        {/* Participant A score */}
        <div className="text-center">
          <span className={cn(
            'font-semibold',
            participantAScore > participantBScore && 'text-green-500',
            participantAScore < participantBScore && 'text-red-500'
          )}>
            {participantAScore}
          </span>
          <span className="text-muted-foreground">/{maxScore}</span>
        </div>

        {/* Weight */}
        <div className="text-center">
          <Badge variant="outline" className="text-xs">
            {requirement.weight}%
          </Badge>
        </div>

        {/* Participant B score */}
        <div className="text-center">
          <span className={cn(
            'font-semibold',
            participantBScore > participantAScore && 'text-green-500',
            participantBScore < participantAScore && 'text-red-500'
          )}>
            {participantBScore}
          </span>
          <span className="text-muted-foreground">/{maxScore}</span>
        </div>
      </div>

      {/* Expanded details */}
      {isOpen && (
        <div className="px-8 pb-3 text-sm text-muted-foreground animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
            <div>
              <div className="font-medium text-foreground mb-1">Seat A Details</div>
              <Progress value={(participantAScore / maxScore) * 100} className="h-2" />
            </div>
            <div>
              <div className="font-medium text-foreground mb-1">Seat B Details</div>
              <Progress value={(participantBScore / maxScore) * 100} className="h-2" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Per-requirement breakdown table
function RequirementBreakdown({ results }: { results: MatchResults }) {
  const { participants } = results;

  if (participants.length < 2) {
    return null;
  }

  const participantA = participants.find(p => p.seat === 'A');
  const participantB = participants.find(p => p.seat === 'B');

  if (!participantA || !participantB) {
    return null;
  }

  // Get requirements from breakdown
  const requirements = participantA.score?.breakdown?.requirements ||
    participantB.score?.breakdown?.requirements || [];

  if (requirements.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Score Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            No detailed breakdown available
          </p>
        </CardContent>
      </Card>
    );
  }

  // Get scores for each participant per requirement
  const getParticipantReqScore = (participant: ParticipantWithScore, reqId: string): number => {
    const reqs = participant.score?.breakdown?.requirements || [];
    const req = reqs.find(r => r.id === reqId);
    return req?.score ?? 0;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Score Breakdown by Requirement
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Header */}
        <div className="grid grid-cols-[1fr,100px,60px,100px] gap-4 items-center py-2 px-4 border-b text-sm font-medium text-muted-foreground">
          <div>Requirement</div>
          <div className="text-center">
            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
              {participantA.displayName.slice(0, 10)}
            </Badge>
          </div>
          <div className="text-center">Weight</div>
          <div className="text-center">
            <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30">
              {participantB.displayName.slice(0, 10)}
            </Badge>
          </div>
        </div>

        {/* Requirement rows */}
        <div className="divide-y">
          {requirements.map((req) => (
            <RequirementRow
              key={req.id}
              requirement={req}
              participantAScore={getParticipantReqScore(participantA, req.id)}
              participantBScore={getParticipantReqScore(participantB, req.id)}
            />
          ))}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-[1fr,100px,60px,100px] gap-4 items-center py-3 px-4 border-t bg-muted/50 rounded-b-lg mt-2">
          <div className="font-bold">Total Score</div>
          <div className="text-center">
            <span className={cn(
              'text-lg font-bold',
              (participantA.score?.totalScore ?? 0) > (participantB.score?.totalScore ?? 0) && 'text-green-500'
            )}>
              {participantA.score?.totalScore ?? 0}
            </span>
          </div>
          <div className="text-center text-muted-foreground">100%</div>
          <div className="text-center">
            <span className={cn(
              'text-lg font-bold',
              (participantB.score?.totalScore ?? 0) > (participantA.score?.totalScore ?? 0) && 'text-green-500'
            )}>
              {participantB.score?.totalScore ?? 0}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Loading skeleton
function JudgingResultsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

// Main component
export function JudgingResults({ results, isLoading }: JudgingResultsProps) {
  if (isLoading) {
    return <JudgingResultsSkeleton />;
  }

  const { participants, winner } = results;
  const participantA = participants.find(p => p.seat === 'A');
  const participantB = participants.find(p => p.seat === 'B');

  return (
    <div className="space-y-6">
      {/* Winner banner */}
      <WinnerBanner results={results} />

      {/* Side-by-side score comparison */}
      {participantA && participantB && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ScoreComparisonCard
            participant={participantA}
            isWinner={winner?.userId === participantA.userId}
          />
          <ScoreComparisonCard
            participant={participantB}
            isWinner={winner?.userId === participantB.userId}
          />
        </div>
      )}

      {/* Per-requirement breakdown */}
      <RequirementBreakdown results={results} />
    </div>
  );
}

export { WinnerBanner, ScoreComparisonCard, RequirementBreakdown };
