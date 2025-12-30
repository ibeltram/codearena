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
