import { ChallengeCategory, ChallengeDifficulty } from './challenge';

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

export type ParticipantSeat = 'A' | 'B';

export type DisputeStatus = 'none' | 'open' | 'in_review' | 'resolved';

export interface MatchParticipant {
  id: string;
  seat: ParticipantSeat;
  joinedAt: string;
  readyAt: string | null;
  submissionId: string | null;
  forfeitAt: string | null;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface MatchChallengeVersion {
  id: string;
  versionNumber: number;
  requirementsJson: Record<string, unknown>;
  rubricJson: Record<string, unknown>;
  constraintsJson: Record<string, unknown>;
  templateRef: string | null;
}

export interface MatchChallenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
}

export interface Match {
  id: string;
  challengeVersionId: string;
  status: MatchStatus;
  mode: MatchMode;
  createdBy: string;
  createdAt: string;
  startAt: string | null;
  endAt: string | null;
  lockAt: string | null;
  configHash: string | null;
  disputeStatus: DisputeStatus;
  challengeVersion: MatchChallengeVersion;
  challenge: MatchChallenge;
  participants: MatchParticipant[];
}

export interface MatchListItem {
  id: string;
  status: MatchStatus;
  mode: MatchMode;
  createdBy: string;
  createdAt: string;
  startAt: string | null;
  endAt: string | null;
  lockAt: string | null;
  disputeStatus: DisputeStatus;
  challengeVersion: {
    id: string;
    versionNumber: number;
  };
  challenge: {
    id: string;
    slug: string;
    title: string;
    category: ChallengeCategory;
    difficulty: ChallengeDifficulty;
  };
}

export interface MatchesResponse {
  data: MatchListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MatchFilters {
  page?: number;
  limit?: number;
  status?: MatchStatus;
  mode?: MatchMode;
}

// Display helpers
export const statusLabels: Record<MatchStatus, string> = {
  created: 'Created',
  open: 'Waiting for Opponent',
  matched: 'Ready Up',
  in_progress: 'In Progress',
  submission_locked: 'Submissions Locked',
  judging: 'Judging',
  finalized: 'Finalized',
  archived: 'Archived',
};

export const statusColors: Record<MatchStatus, string> = {
  created: 'bg-gray-500',
  open: 'bg-yellow-500',
  matched: 'bg-blue-500',
  in_progress: 'bg-green-500',
  submission_locked: 'bg-orange-500',
  judging: 'bg-purple-500',
  finalized: 'bg-gray-600',
  archived: 'bg-gray-400',
};

export const modeLabels: Record<MatchMode, string> = {
  ranked: 'Ranked',
  invite: 'Invite',
  tournament: 'Tournament',
};

export const modeColors: Record<MatchMode, string> = {
  ranked: 'bg-amber-500',
  invite: 'bg-cyan-500',
  tournament: 'bg-purple-500',
};
