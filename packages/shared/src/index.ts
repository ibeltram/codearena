// Re-export all types
export * from './types';

// Constants
export const MATCH_STATUS_TRANSITIONS: Record<string, string[]> = {
  created: ['open'],
  open: ['matched'],
  matched: ['in_progress'],
  in_progress: ['submission_locked'],
  submission_locked: ['judging'],
  judging: ['finalized'],
  finalized: ['archived'],
  archived: [],
};

export const CHALLENGE_CATEGORIES = [
  'frontend',
  'backend',
  'fullstack',
  'algorithm',
  'devops',
] as const;

export const CHALLENGE_DIFFICULTIES = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
] as const;

export const USER_ROLES = ['user', 'admin', 'moderator'] as const;

// Utility functions
export function isValidMatchTransition(from: string, to: string): boolean {
  return MATCH_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function formatCredits(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
