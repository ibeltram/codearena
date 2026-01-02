import React from 'react';
import { Challenge, ChallengeCategory, ChallengeDifficulty } from '../../types/messages';
import { Card } from '../ui';
import './ChallengeCard.css';

export interface ChallengeCardProps {
  /** Challenge data */
  challenge: Challenge;
  /** Callback when Join button is clicked */
  onJoin: (challengeId: string) => void;
  /** Callback when View button is clicked */
  onView: (challengeSlug: string) => void;
}

/**
 * Get color class for category badge
 */
function getCategoryClass(category: ChallengeCategory): string {
  switch (category) {
    case 'frontend':
      return 'challenge-card__badge--frontend';
    case 'backend':
      return 'challenge-card__badge--backend';
    case 'fullstack':
      return 'challenge-card__badge--fullstack';
    case 'algorithm':
      return 'challenge-card__badge--algorithm';
    case 'devops':
      return 'challenge-card__badge--devops';
    default:
      return '';
  }
}

/**
 * Get color class for difficulty badge
 */
function getDifficultyClass(difficulty: ChallengeDifficulty): string {
  switch (difficulty) {
    case 'easy':
      return 'challenge-card__badge--easy';
    case 'medium':
      return 'challenge-card__badge--medium';
    case 'hard':
      return 'challenge-card__badge--hard';
    case 'expert':
      return 'challenge-card__badge--expert';
    default:
      return '';
  }
}

/**
 * Format time limit for display
 */
function formatTimeLimit(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${minutes} min`;
}

/**
 * ChallengeCard - Individual challenge display card
 *
 * Shows challenge details with category/difficulty badges
 * and Join/View action buttons.
 */
export function ChallengeCard({ challenge, onJoin, onView }: ChallengeCardProps) {
  const { id, slug, title, category, difficulty, timeLimit, stakeAmount } = challenge;

  return (
    <Card className="challenge-card" interactive>
      {/* Header with title and badges */}
      <div className="challenge-card__header">
        <h3 className="challenge-card__title" title={title}>
          {title}
        </h3>
        <div className="challenge-card__badges">
          <span className={`challenge-card__badge ${getCategoryClass(category)}`}>
            {category}
          </span>
          <span className={`challenge-card__badge ${getDifficultyClass(difficulty)}`}>
            {difficulty}
          </span>
        </div>
      </div>

      {/* Info row */}
      <div className="challenge-card__info">
        <div className="challenge-card__info-item">
          <span className="challenge-card__info-icon">&#x23F1;</span>
          <span className="challenge-card__info-text">{formatTimeLimit(timeLimit)}</span>
        </div>
        <div className="challenge-card__info-item">
          <span className="challenge-card__info-icon">&#x2B50;</span>
          <span className="challenge-card__info-text">{stakeAmount} credits</span>
        </div>
      </div>

      {/* Actions */}
      <div className="challenge-card__actions">
        <button
          className="challenge-card__button challenge-card__button--primary"
          onClick={(e) => {
            e.stopPropagation();
            onJoin(id);
          }}
        >
          Join
        </button>
        <button
          className="challenge-card__button challenge-card__button--secondary"
          onClick={(e) => {
            e.stopPropagation();
            onView(slug);
          }}
        >
          View
        </button>
      </div>
    </Card>
  );
}

export default ChallengeCard;
