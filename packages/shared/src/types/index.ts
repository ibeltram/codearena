// User Types
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: Date;
  lastLoginAt?: Date;
  roles: UserRole[];
  flags: UserFlags;
  preferences: UserPreferences;
}

export type UserRole = 'user' | 'admin' | 'moderator';

export interface UserFlags {
  isBanned: boolean;
  isVerified: boolean;
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  notifications?: boolean;
  publicProfile?: boolean;
}

// Challenge Types
export interface Challenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  isPublished: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ChallengeCategory = 'frontend' | 'backend' | 'fullstack' | 'algorithm' | 'devops';
export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface ChallengeVersion {
  id: string;
  challengeId: string;
  versionNumber: number;
  requirementsJson: RequirementsSchema;
  rubricJson: RubricSchema;
  constraintsJson: ConstraintsSchema;
  templateRef?: string;
  judgeImageRef?: string;
  createdAt: Date;
  publishedAt?: Date;
}

export interface RequirementsSchema {
  requirements: Requirement[];
  tieBreakers: string[];
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  weight: number;
  evidence: string[];
  tests: string[];
}

export interface RubricSchema {
  criteria: RubricCriteria[];
}

export interface RubricCriteria {
  id: string;
  name: string;
  maxScore: number;
  description: string;
}

export interface ConstraintsSchema {
  maxDurationMinutes: number;
  maxFileSizeBytes: number;
  allowedFileTypes: string[];
  forbiddenPatterns: string[];
}

// Match Types
export interface Match {
  id: string;
  challengeVersionId: string;
  status: MatchStatus;
  mode: MatchMode;
  createdBy: string;
  createdAt: Date;
  startAt?: Date;
  endAt?: Date;
  lockAt?: Date;
  configHash?: string;
  disputeStatus?: DisputeStatus;
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
export type DisputeStatus = 'none' | 'open' | 'in_review' | 'resolved';

export interface MatchParticipant {
  id: string;
  matchId: string;
  userId: string;
  seat: 'A' | 'B';
  joinedAt: Date;
  readyAt?: Date;
  submissionId?: string;
  forfeitAt?: Date;
}

// Submission Types
export interface Submission {
  id: string;
  matchId: string;
  userId: string;
  method: SubmissionMethod;
  artifactId: string;
  submittedAt: Date;
  lockedAt?: Date;
  clientType?: string;
  clientVersion?: string;
  sourceRef?: string;
}

export type SubmissionMethod = 'zip' | 'github_repo';

export interface Artifact {
  id: string;
  contentHash: string;
  storageKey: string;
  sizeBytes: number;
  createdAt: Date;
  manifestJson: ArtifactManifest;
  secretScanStatus: SecretScanStatus;
}

export interface ArtifactManifest {
  files: ArtifactFile[];
  totalSize: number;
  fileCount: number;
}

export interface ArtifactFile {
  path: string;
  size: number;
  hash: string;
}

export type SecretScanStatus = 'pending' | 'clean' | 'flagged';

// Judging Types
export interface JudgementRun {
  id: string;
  matchId: string;
  startedAt: Date;
  completedAt?: Date;
  status: JudgementStatus;
  judgeVersion: string;
  logsKey?: string;
  environmentRef?: string;
}

export type JudgementStatus = 'queued' | 'running' | 'success' | 'failed';

export interface Score {
  id: string;
  judgementRunId: string;
  matchId: string;
  userId: string;
  totalScore: number;
  breakdownJson: ScoreBreakdown;
  automatedResultsJson: AutomatedResults;
  aiJudgeResultsJson?: AiJudgeResults;
  createdAt: Date;
}

export interface ScoreBreakdown {
  requirements: RequirementScore[];
}

export interface RequirementScore {
  requirementId: string;
  score: number;
  maxScore: number;
  evidence: string[];
}

export interface AutomatedResults {
  buildPassed: boolean;
  testsPassed: number;
  testsTotal: number;
  lintPassed: boolean;
  lintErrors: number;
}

export interface AiJudgeResults {
  overallScore: number;
  feedback: string;
  criteriaScores: Record<string, number>;
}

// Credits Types
export interface CreditAccount {
  id: string;
  userId: string;
  balanceAvailable: number;
  balanceReserved: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditHold {
  id: string;
  accountId: string;
  matchId: string;
  amountReserved: number;
  status: CreditHoldStatus;
  createdAt: Date;
  releasedAt?: Date;
}

export type CreditHoldStatus = 'active' | 'released' | 'consumed';

export interface CreditLedgerEntry {
  id: string;
  idempotencyKey: string;
  accountId: string;
  counterpartyAccountId?: string;
  type: CreditTransactionType;
  amount: number;
  matchId?: string;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
}

export type CreditTransactionType =
  | 'purchase'
  | 'earn'
  | 'stake_hold'
  | 'stake_release'
  | 'transfer'
  | 'fee'
  | 'refund'
  | 'redemption';

// Rankings Types
export interface Ranking {
  id: string;
  userId: string;
  seasonId: string;
  rating: number;
  deviation: number;
  volatility: number;
  updatedAt: Date;
}

export interface Season {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  rulesJson: SeasonRules;
}

export interface SeasonRules {
  initialRating: number;
  initialDeviation: number;
  initialVolatility: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
