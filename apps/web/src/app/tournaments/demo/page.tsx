'use client';

import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { BracketViewer, BracketList } from '@/components/tournaments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LayoutGrid, List, Trophy } from 'lucide-react';
import { BracketMatch, BracketParticipantInfo, TournamentFormat } from '@/types/tournament';

// Generate mock bracket data for an 8-player single elimination tournament
function generateMockBracket(): {
  rounds: Record<number, BracketMatch[]>;
  participants: Record<string, BracketParticipantInfo>;
  matches: BracketMatch[];
  totalRounds: number;
} {
  const participants: Record<string, BracketParticipantInfo> = {
    'p1': { id: 'p1', displayName: 'AlphaCode', avatarUrl: null },
    'p2': { id: 'p2', displayName: 'ByteBuilder', avatarUrl: null },
    'p3': { id: 'p3', displayName: 'CodeNinja', avatarUrl: null },
    'p4': { id: 'p4', displayName: 'DevMaster', avatarUrl: null },
    'p5': { id: 'p5', displayName: 'EliteHacker', avatarUrl: null },
    'p6': { id: 'p6', displayName: 'FlowState', avatarUrl: null },
    'p7': { id: 'p7', displayName: 'GitGuru', avatarUrl: null },
    'p8': { id: 'p8', displayName: 'HexWizard', avatarUrl: null },
  };

  const matches: BracketMatch[] = [
    // Round 1 - Quarter Finals (4 matches)
    {
      id: 'm1',
      tournamentId: 'demo',
      round: 1,
      position: 0,
      bracketSide: null,
      participant1Id: 'p1',
      participant2Id: 'p2',
      winnerId: 'p1',
      matchId: null,
      status: 'completed',
      scheduledAt: null,
      completedAt: new Date().toISOString(),
      nextMatchId: 'm5',
      loserNextMatchId: null,
    },
    {
      id: 'm2',
      tournamentId: 'demo',
      round: 1,
      position: 1,
      bracketSide: null,
      participant1Id: 'p3',
      participant2Id: 'p4',
      winnerId: 'p3',
      matchId: null,
      status: 'completed',
      scheduledAt: null,
      completedAt: new Date().toISOString(),
      nextMatchId: 'm5',
      loserNextMatchId: null,
    },
    {
      id: 'm3',
      tournamentId: 'demo',
      round: 1,
      position: 2,
      bracketSide: null,
      participant1Id: 'p5',
      participant2Id: 'p6',
      winnerId: 'p5',
      matchId: null,
      status: 'completed',
      scheduledAt: null,
      completedAt: new Date().toISOString(),
      nextMatchId: 'm6',
      loserNextMatchId: null,
    },
    {
      id: 'm4',
      tournamentId: 'demo',
      round: 1,
      position: 3,
      bracketSide: null,
      participant1Id: 'p7',
      participant2Id: 'p8',
      winnerId: 'p8',
      matchId: null,
      status: 'completed',
      scheduledAt: null,
      completedAt: new Date().toISOString(),
      nextMatchId: 'm6',
      loserNextMatchId: null,
    },
    // Round 2 - Semi Finals (2 matches)
    {
      id: 'm5',
      tournamentId: 'demo',
      round: 2,
      position: 0,
      bracketSide: null,
      participant1Id: 'p1',
      participant2Id: 'p3',
      winnerId: null,
      matchId: null,
      status: 'in_progress',
      scheduledAt: null,
      completedAt: null,
      nextMatchId: 'm7',
      loserNextMatchId: null,
    },
    {
      id: 'm6',
      tournamentId: 'demo',
      round: 2,
      position: 1,
      bracketSide: null,
      participant1Id: 'p5',
      participant2Id: 'p8',
      winnerId: null,
      matchId: null,
      status: 'pending',
      scheduledAt: null,
      completedAt: null,
      nextMatchId: 'm7',
      loserNextMatchId: null,
    },
    // Round 3 - Finals (1 match)
    {
      id: 'm7',
      tournamentId: 'demo',
      round: 3,
      position: 0,
      bracketSide: null,
      participant1Id: null,
      participant2Id: null,
      winnerId: null,
      matchId: null,
      status: 'pending',
      scheduledAt: null,
      completedAt: null,
      nextMatchId: null,
      loserNextMatchId: null,
    },
  ];

  // Organize by rounds
  const rounds: Record<number, BracketMatch[]> = {
    1: matches.filter(m => m.round === 1),
    2: matches.filter(m => m.round === 2),
    3: matches.filter(m => m.round === 3),
  };

  return {
    rounds,
    participants,
    matches,
    totalRounds: 3,
  };
}

export default function TournamentDemoPage() {
  const [bracketView, setBracketView] = useState<'tree' | 'list'>('tree');
  const mockData = generateMockBracket();

  const handleMatchClick = (match: BracketMatch) => {
    console.log('Match clicked:', match);
    alert(`Match clicked: ${match.id}\nRound: ${match.round}\nStatus: ${match.status}`);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Badge className="mb-2">Demo</Badge>
            <h1 className="text-2xl font-bold">Visual Bracket Viewer</h1>
            <p className="text-muted-foreground">
              Preview of the tournament bracket component with SVG connectors and auto-scroll
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={bracketView === 'tree' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setBracketView('tree')}
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Tree View
            </Button>
            <Button
              variant={bracketView === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setBracketView('list')}
            >
              <List className="h-4 w-4 mr-2" />
              List View
            </Button>
          </div>
        </div>

        {/* Tournament Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Demo Tournament - Single Elimination
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Format:</span>
                <p className="font-medium">Single Elimination</p>
              </div>
              <div>
                <span className="text-muted-foreground">Participants:</span>
                <p className="font-medium">8 players</p>
              </div>
              <div>
                <span className="text-muted-foreground">Rounds:</span>
                <p className="font-medium">3 rounds</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="secondary">In Progress</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bracket Viewer */}
        <Card>
          <CardHeader>
            <CardTitle>Tournament Bracket</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {bracketView === 'tree' ? (
              <BracketViewer
                format="single_elimination"
                rounds={mockData.rounds}
                participants={mockData.participants}
                totalRounds={mockData.totalRounds}
                onMatchClick={handleMatchClick}
                autoScrollToActive={true}
              />
            ) : (
              <div className="p-6">
                <BracketList
                  matches={mockData.matches}
                  participants={mockData.participants}
                  onMatchClick={handleMatchClick}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Features Info */}
        <Card>
          <CardHeader>
            <CardTitle>Features Demonstrated</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <strong>SVG Connectors:</strong> Lines connecting matches between rounds
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <strong>Auto-scroll:</strong> Automatically scrolls to the current active round
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <strong>Match Cards:</strong> Display participant info, avatars, and status
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <strong>Winner Highlighting:</strong> Winners shown with green background and trophy
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <strong>Live Indicator:</strong> In-progress matches have a pulsing Live badge
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <strong>Click Navigation:</strong> Click any match to view details
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <strong>Champion Display:</strong> Finals winner shown in champion box
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <strong>Mobile List View:</strong> Alternative compact view for small screens
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
