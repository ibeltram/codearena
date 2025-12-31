export type ChallengeCategory = 'frontend' | 'backend' | 'fullstack' | 'algorithm' | 'devops';
export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type ChallengeSortOption = 'newest' | 'oldest' | 'popular' | 'title';

export interface ChallengeVersion {
  id: string;
  versionNumber: number;
  templateRef: string | null;
  publishedAt: string | null;
}

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  latestVersion?: ChallengeVersion;
}

export interface ChallengesResponse {
  data: Challenge[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ChallengeFilters {
  page?: number;
  limit?: number;
  category?: ChallengeCategory;
  difficulty?: ChallengeDifficulty;
  search?: string;
  sort?: ChallengeSortOption;
}

// Detailed challenge response from /api/challenges/slug/:slug
export interface ChallengeDetailVersion {
  id: string;
  challengeId: string;
  versionNumber: number;
  requirementsJson: ChallengeRequirement[] | null;
  rubricJson: RubricCriterion[] | null;
  constraintsJson: ChallengeConstraints | null;
  templateRef: string | null;
  judgeImageRef: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface ChallengeDetail extends Challenge {
  latestVersion: ChallengeDetailVersion | null;
  versionCount: number;
}

// Display helpers
export const categoryLabels: Record<ChallengeCategory, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Full Stack',
  algorithm: 'Algorithm',
  devops: 'DevOps',
};

export const categoryColors: Record<ChallengeCategory, string> = {
  frontend: 'bg-blue-500',
  backend: 'bg-green-500',
  fullstack: 'bg-purple-500',
  algorithm: 'bg-orange-500',
  devops: 'bg-cyan-500',
};

export const difficultyLabels: Record<ChallengeDifficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

export const difficultyColors: Record<ChallengeDifficulty, string> = {
  beginner: 'bg-green-500',
  intermediate: 'bg-yellow-500',
  advanced: 'bg-orange-500',
  expert: 'bg-red-500',
};

// ============================================================================
// Admin Challenge Builder Types
// ============================================================================

/**
 * Evidence type for rubric criteria
 */
export type EvidenceType =
  | 'code_analysis'
  | 'test_pass'
  | 'file_exists'
  | 'output_match'
  | 'manual_review'
  | 'ai_review';

/**
 * A single requirement for a challenge
 */
export interface ChallengeRequirement {
  id: string;
  title: string;
  description: string;
  weight: number;
  order: number;
}

/**
 * A single rubric criterion for scoring
 */
export interface RubricCriterion {
  id: string;
  requirementId: string;
  title: string;
  description: string;
  maxPoints: number;
  evidenceType: EvidenceType;
  evidenceConfig?: Record<string, unknown>;
}

/**
 * Challenge constraints (time, file limits, etc.)
 */
export interface ChallengeConstraints {
  maxDurationMinutes?: number;
  maxFileSize?: number;
  maxFiles?: number;
  allowedLanguages?: string[];
  requiredFiles?: string[];
  forbiddenPatterns?: string[];
}

/**
 * Full challenge version with all JSON fields
 */
export interface ChallengeVersionFull {
  id: string;
  challengeId: string;
  versionNumber: number;
  requirementsJson: ChallengeRequirement[];
  rubricJson: RubricCriterion[];
  constraintsJson: ChallengeConstraints;
  templateRef: string | null;
  judgeImageRef: string | null;
  createdAt: string;
  publishedAt: string | null;
}

/**
 * Challenge with full details for admin editing
 */
export interface AdminChallenge extends Challenge {
  versions: ChallengeVersionFull[];
  createdBy: string;
}

/**
 * Form data for creating a new challenge
 */
export interface CreateChallengeInput {
  slug: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
}

/**
 * Form data for updating a challenge
 */
export interface UpdateChallengeInput {
  slug?: string;
  title?: string;
  description?: string;
  category?: ChallengeCategory;
  difficulty?: ChallengeDifficulty;
}

/**
 * Form data for creating a challenge version
 */
export interface CreateVersionInput {
  requirementsJson: ChallengeRequirement[];
  rubricJson: RubricCriterion[];
  constraintsJson: ChallengeConstraints;
  templateRef?: string;
  judgeImageRef?: string;
}

/**
 * API responses for admin operations
 */
export interface AdminChallengeResponse {
  message: string;
  challenge: AdminChallenge;
}

export interface AdminVersionResponse {
  message: string;
  version: ChallengeVersionFull;
}

/**
 * Evidence type display helpers
 */
export const evidenceTypeLabels: Record<EvidenceType, string> = {
  code_analysis: 'Code Analysis',
  test_pass: 'Test Pass',
  file_exists: 'File Exists',
  output_match: 'Output Match',
  manual_review: 'Manual Review',
  ai_review: 'AI Review',
};

export const evidenceTypeDescriptions: Record<EvidenceType, string> = {
  code_analysis: 'Analyze code patterns, structure, or quality',
  test_pass: 'Verify tests pass successfully',
  file_exists: 'Check if required files exist',
  output_match: 'Compare output against expected result',
  manual_review: 'Requires manual human review',
  ai_review: 'AI-powered evaluation of submission',
};

/**
 * Helper to generate a unique ID for requirements/criteria
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Helper to calculate total weight of requirements
 */
export function calculateTotalWeight(requirements: ChallengeRequirement[]): number {
  return requirements.reduce((sum, req) => sum + req.weight, 0);
}

/**
 * Helper to calculate total max points of rubric
 */
export function calculateTotalPoints(rubric: RubricCriterion[]): number {
  return rubric.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
}

/**
 * Validate that requirements sum to 100% weight
 */
export function validateRequirementWeights(requirements: ChallengeRequirement[]): boolean {
  return calculateTotalWeight(requirements) === 100;
}
