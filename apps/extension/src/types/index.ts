/**
 * CodeArena Extension Types
 */

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  timeLimit: number; // in minutes
  stakeAmount: number;
  hasTemplate: boolean;
  isPublished: boolean;
}

export type ChallengeCategory =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'algorithm'
  | 'devops';

export type ChallengeDifficulty =
  | 'easy'
  | 'medium'
  | 'hard'
  | 'expert';

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

export type MatchStatus =
  | 'created'
  | 'open'
  | 'matched'
  | 'in_progress'
  | 'submission_locked'
  | 'judging'
  | 'finalized'
  | 'archived';

export type MatchMode =
  | 'ranked'
  | 'invite'
  | 'tournament';

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
  rating: number;
  rank: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface ExtensionConfig {
  apiUrl: string;
  webUrl: string;
  autoSubmit: boolean;
  showTimerInStatusBar: boolean;
  timerWarningMinutes: number;
  excludePatterns: string[];
  maxSubmissionSizeMB: number;
}

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
}
