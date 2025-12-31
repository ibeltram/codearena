import { ChallengeCategory, ChallengeDifficulty } from './challenge';
import { MatchMode, MatchStatus, DisputeStatus } from './match';

// Dispute status type
export type DisputeTableStatus = 'open' | 'in_review' | 'resolved';

// Resolution type
export type DisputeResolution = 'upheld' | 'rejected' | 'partial';

// New outcome type
export type DisputeNewOutcome = 'winner_a' | 'winner_b' | 'tie' | 'no_change';

// Dispute user info
export interface DisputeUser {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string | null;
}

// Dispute match info (list view)
export interface DisputeMatchSummary {
  id: string;
  status: MatchStatus;
  mode: MatchMode;
  disputeStatus: DisputeStatus;
}

// Dispute list item
export interface DisputeListItem {
  id: string;
  matchId: string;
  status: DisputeTableStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
  openedBy: DisputeUser;
  match: DisputeMatchSummary;
}

// Dispute evidence
export interface DisputeEvidence {
  description?: string;
  attachments?: Array<{
    type: 'image' | 'log' | 'screenshot' | 'other';
    url: string;
    name: string;
  }>;
  submissionRef?: string;
  [key: string]: unknown;
}

// Dispute resolution data
export interface DisputeResolutionData {
  resolution: DisputeResolution;
  reason: string;
  newOutcome: DisputeNewOutcome;
  adjustments?: {
    scoreAdjustmentA?: number;
    scoreAdjustmentB?: number;
    creditRefundA?: number;
    creditRefundB?: number;
  };
  internalNotes?: string;
  resolvedBy: string;
  resolvedAt: string;
}

// Dispute detail
export interface DisputeDetail {
  id: string;
  matchId: string;
  status: DisputeTableStatus;
  reason: string;
  evidenceJson: DisputeEvidence;
  resolutionJson: DisputeResolutionData | null;
  createdAt: string;
  updatedAt: string;
  openedBy: DisputeUser;
}

// Match challenge info for dispute detail
export interface DisputeMatchChallenge {
  id: string;
  title: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
}

// Full match info for dispute detail
export interface DisputeMatch {
  id: string;
  status: MatchStatus;
  mode: MatchMode;
  disputeStatus: DisputeStatus;
  createdAt: string;
  startAt: string | null;
  endAt: string | null;
  challenge: DisputeMatchChallenge;
}

// Match participant for dispute detail
export interface DisputeParticipant {
  id: string;
  seat: 'A' | 'B';
  joinedAt: string;
  forfeitAt: string | null;
  user: DisputeUser;
}

// Score for dispute detail
export interface DisputeScore {
  id: string;
  matchId: string;
  submissionId: string;
  userId: string;
  judgeType: 'deterministic' | 'ai' | 'manual';
  rawScoreJson: Record<string, unknown>;
  totalPoints: number;
  maxPoints: number;
  createdAt: string;
}

// Other dispute on same match
export interface DisputeRelated {
  id: string;
  status: DisputeTableStatus;
  reason: string;
  createdAt: string;
  openedBy: Pick<DisputeUser, 'id' | 'displayName'>;
}

// Audit history item
export interface DisputeAuditItem {
  id: string;
  eventType: string;
  payloadJson: Record<string, unknown>;
  createdAt: string;
  actor: Pick<DisputeUser, 'id' | 'displayName'> | null;
}

// Full dispute detail response
export interface DisputeDetailResponse {
  dispute: DisputeDetail;
  match: DisputeMatch;
  participants: DisputeParticipant[];
  scores: DisputeScore[];
  otherDisputes: DisputeRelated[];
  auditHistory: DisputeAuditItem[];
}

// List disputes response
export interface DisputesResponse {
  data: DisputeListItem[];
  summary: {
    open: number;
    inReview: number;
    total: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Filters
export interface DisputeFilters {
  page?: number;
  limit?: number;
  status?: DisputeTableStatus;
}

// Resolve dispute input
export interface ResolveDisputeInput {
  resolution: DisputeResolution;
  reason: string;
  newOutcome?: DisputeNewOutcome;
  adjustments?: {
    scoreAdjustmentA?: number;
    scoreAdjustmentB?: number;
    creditRefundA?: number;
    creditRefundB?: number;
  };
  internalNotes?: string;
}

// Resolve dispute response
export interface ResolveDisputeResponse {
  id: string;
  status: DisputeTableStatus;
  resolution: DisputeResolutionData;
  settlementResult: {
    intendedOutcome?: string;
    note?: string;
  } | null;
  matchDisputeStatus: DisputeStatus;
  message: string;
}

// Review dispute response
export interface ReviewDisputeResponse {
  id: string;
  status: DisputeTableStatus;
  message: string;
}

// Rejudge response
export interface RejudgeDisputeResponse {
  disputeId: string;
  matchId: string;
  status: string;
  message: string;
}

// Display helpers
export const statusLabels: Record<DisputeTableStatus, string> = {
  open: 'Open',
  in_review: 'In Review',
  resolved: 'Resolved',
};

export const statusColors: Record<DisputeTableStatus, string> = {
  open: 'bg-yellow-500',
  in_review: 'bg-blue-500',
  resolved: 'bg-green-500',
};

export const resolutionLabels: Record<DisputeResolution, string> = {
  upheld: 'Upheld',
  rejected: 'Rejected',
  partial: 'Partially Upheld',
};

export const resolutionColors: Record<DisputeResolution, string> = {
  upheld: 'bg-green-500',
  rejected: 'bg-red-500',
  partial: 'bg-orange-500',
};

export const outcomeLabels: Record<DisputeNewOutcome, string> = {
  winner_a: 'Player A Wins',
  winner_b: 'Player B Wins',
  tie: 'Tie',
  no_change: 'No Change',
};
