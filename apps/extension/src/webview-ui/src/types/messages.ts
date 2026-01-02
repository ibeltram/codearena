/**
 * Message types for communication between extension and webview
 */

// ============================================
// Shared Types (mirrored from extension types)
// ============================================

export type ChallengeCategory =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'algorithm'
  | 'devops';

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  timeLimit: number;
  stakeAmount: number;
  hasTemplate: boolean;
  isPublished: boolean;
}

export type MatchStatus =
  | 'created'
  | 'open'
  | 'matched'
  | 'in_progress'
  | 'submission_locked'
  | 'judging'
  | 'finalized'
  | 'archived';

export type MatchMode = 'ranked' | 'invite' | 'tournament';

export interface MatchParticipant {
  userId: string;
  username: string;
  avatarUrl?: string;
  seat: 'A' | 'B';
  joinedAt: string;
  readyAt?: string;
  hasSubmitted: boolean;
  hasLocked: boolean;
}

export interface Submission {
  id: string;
  matchId: string;
  artifactId?: string;
  submittedAt: string;
  lockedAt?: string;
  method: 'zip' | 'github_repo';
}

export interface Match {
  id: string;
  challengeId: string;
  challengeTitle: string;
  status: MatchStatus;
  mode: MatchMode;
  startAt: string | null;
  endAt: string | null;
  timeLimit: number;
  stakeAmount: number;
  participants: MatchParticipant[];
  mySubmission: Submission | null;
}

export interface MatchHistoryItem {
  id: string;
  challengeTitle: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  opponentUsername: string;
  result: 'win' | 'loss' | 'draw' | 'in_progress';
  score?: number;
  opponentScore?: number;
  creditsWon?: number;
  creditsLost?: number;
  completedAt?: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

// ============================================
// Connection State
// ============================================

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

// ============================================
// Webview State
// ============================================

export interface WebviewState {
  isAuthenticated: boolean;
  user: User | null;
  challenges: Challenge[];
  challengesLoading: boolean;
  challengesError: string | null;
  categoryFilter: string | null;
  match: Match | null;
  timeRemaining: number;
  connectionState: ConnectionState;
  history: MatchHistoryItem[];
  historyLoading: boolean;
  historyError: string | null;
  activeTab: 'challenges' | 'match' | 'history';
}

// ============================================
// Commands (Webview -> Extension)
// ============================================

export type WebviewCommand =
  | { command: 'signIn' }
  | { command: 'signOut' }
  | { command: 'refreshChallenges' }
  | { command: 'filterChallenges'; category: string | null }
  | { command: 'joinMatch'; challengeId: string }
  | { command: 'openChallengeInWeb'; challengeSlug: string }
  | { command: 'submit' }
  | { command: 'lockSubmission' }
  | { command: 'setReady' }
  | { command: 'forfeit' }
  | { command: 'openMatchInWeb' }
  | { command: 'refreshHistory' }
  | { command: 'viewMatchDetails'; matchId: string };

// ============================================
// Messages (Extension -> Webview)
// ============================================

export type ExtensionMessage =
  | {
      type: 'stateUpdate';
      data: {
        auth: { isAuthenticated: boolean; user: User | null };
        challenges: {
          challenges: Challenge[];
          loading: boolean;
          error: string | null;
        };
        match: {
          match: Match | null;
          timeRemaining: number;
          connectionState: ConnectionState;
        };
        history: {
          matches: MatchHistoryItem[];
          loading: boolean;
          error: string | null;
        };
      };
    }
  | { type: 'authUpdate'; data: { isAuthenticated: boolean; user: User | null } }
  | {
      type: 'challengesUpdate';
      data: { challenges: Challenge[]; loading: boolean; error: string | null };
    }
  | { type: 'matchUpdate'; data: { match: Match | null } }
  | { type: 'timerUpdate'; data: { timeRemaining: number } }
  | { type: 'connectionUpdate'; data: { state: ConnectionState } }
  | {
      type: 'historyUpdate';
      data: { matches: MatchHistoryItem[]; loading: boolean; error: string | null };
    };
