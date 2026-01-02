import React from 'react';
import './LoadingState.css';

export type LoadingStateVariant = 'card' | 'list' | 'text';

export interface LoadingStateProps {
  /** Type of skeleton to display */
  variant?: LoadingStateVariant;
  /** Number of skeleton items to show */
  count?: number;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Skeleton item for card layout
 */
function CardSkeleton() {
  return (
    <div className="loading-skeleton loading-skeleton--card">
      <div className="loading-skeleton__title" />
      <div className="loading-skeleton__badges">
        <div className="loading-skeleton__badge" />
        <div className="loading-skeleton__badge" />
      </div>
      <div className="loading-skeleton__text" />
      <div className="loading-skeleton__actions">
        <div className="loading-skeleton__button" />
        <div className="loading-skeleton__button" />
      </div>
    </div>
  );
}

/**
 * Skeleton item for list layout
 */
function ListSkeleton() {
  return (
    <div className="loading-skeleton loading-skeleton--list">
      <div className="loading-skeleton__avatar" />
      <div className="loading-skeleton__content">
        <div className="loading-skeleton__title" />
        <div className="loading-skeleton__text" />
      </div>
    </div>
  );
}

/**
 * Skeleton item for text layout
 */
function TextSkeleton() {
  return (
    <div className="loading-skeleton loading-skeleton--text">
      <div className="loading-skeleton__line loading-skeleton__line--full" />
      <div className="loading-skeleton__line loading-skeleton__line--medium" />
      <div className="loading-skeleton__line loading-skeleton__line--short" />
    </div>
  );
}

/**
 * LoadingState - Skeleton loading placeholder
 *
 * Use cases:
 * - Challenge list loading
 * - Match history loading
 * - Any async data loading
 *
 * Features:
 * - Skeleton placeholders for content
 * - Shimmer animation effect
 * - Configurable number of skeleton items
 * - Match layout of actual content
 */
export function LoadingState({
  variant = 'card',
  count = 3,
  className = '',
}: LoadingStateProps) {
  const classNames = ['loading-state', className].filter(Boolean).join(' ');

  const SkeletonComponent =
    variant === 'card'
      ? CardSkeleton
      : variant === 'list'
        ? ListSkeleton
        : TextSkeleton;

  return (
    <div className={classNames} aria-busy="true" aria-label="Loading...">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonComponent key={i} />
      ))}
    </div>
  );
}

export default LoadingState;
