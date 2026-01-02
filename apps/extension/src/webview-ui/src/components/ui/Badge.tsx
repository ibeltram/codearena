import React from 'react';
import './Badge.css';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'muted';

export interface BadgeProps {
  /** Visual variant of the badge */
  variant?: BadgeVariant;
  /** Additional CSS class names */
  className?: string;
  /** Badge contents */
  children: React.ReactNode;
}

/**
 * Badge - Status indicators and labels
 *
 * Use cases:
 * - Category badges (colored by category)
 * - Difficulty badges (Easy/Medium/Hard)
 * - Status badges (Ready, Submitted, etc.)
 * - Result badges (Win/Loss/Draw)
 *
 * Variants:
 * - default: Neutral gray
 * - success: Green for wins, ready, completed
 * - warning: Yellow for pending, in progress
 * - error: Red for losses, errors
 * - info: Blue for informational
 * - muted: Subtle gray for secondary info
 */
export function Badge({
  variant = 'default',
  className = '',
  children,
}: BadgeProps) {
  const classNames = ['badge', `badge--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return <span className={classNames}>{children}</span>;
}

// Pre-styled category badge
export type CategoryBadgeProps = {
  category: 'frontend' | 'backend' | 'fullstack' | 'algorithm' | 'devops';
  className?: string;
};

const categoryLabels: Record<CategoryBadgeProps['category'], string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Full Stack',
  algorithm: 'Algorithm',
  devops: 'DevOps',
};

export function CategoryBadge({ category, className = '' }: CategoryBadgeProps) {
  return (
    <span className={`badge badge--category badge--category-${category} ${className}`}>
      {categoryLabels[category]}
    </span>
  );
}

// Pre-styled difficulty badge
export type DifficultyBadgeProps = {
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  className?: string;
};

const difficultyLabels: Record<DifficultyBadgeProps['difficulty'], string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

export function DifficultyBadge({ difficulty, className = '' }: DifficultyBadgeProps) {
  return (
    <span className={`badge badge--difficulty badge--difficulty-${difficulty} ${className}`}>
      {difficultyLabels[difficulty]}
    </span>
  );
}

// Pre-styled result badge
export type ResultBadgeProps = {
  result: 'win' | 'loss' | 'draw' | 'in_progress';
  className?: string;
};

const resultLabels: Record<ResultBadgeProps['result'], string> = {
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
  in_progress: 'In Progress',
};

export function ResultBadge({ result, className = '' }: ResultBadgeProps) {
  return (
    <span className={`badge badge--result badge--result-${result} ${className}`}>
      {resultLabels[result]}
    </span>
  );
}

export default Badge;
