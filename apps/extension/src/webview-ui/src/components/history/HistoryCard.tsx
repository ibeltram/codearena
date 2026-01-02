import React from 'react';
import { MatchHistoryItem } from '../../types/messages';
import './HistoryCard.css';

export interface HistoryCardProps {
  /** The match history item */
  match: MatchHistoryItem;
  /** Callback when card is clicked */
  onClick: (matchId: string) => void;
}

/**
 * Format a date string to a short display format
 */
function formatDate(dateString?: string): string {
  if (!dateString) return 'In progress';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get result display text and icon
 */
function getResultInfo(result: MatchHistoryItem['result']): {
  icon: string;
  text: string;
} {
  switch (result) {
    case 'win':
      return { icon: '\u2713', text: 'Win' };
    case 'loss':
      return { icon: '\u2717', text: 'Loss' };
    case 'draw':
      return { icon: '\u2501', text: 'Draw' };
    case 'in_progress':
      return { icon: '\u23F1', text: 'In Progress' };
    default:
      return { icon: '?', text: 'Unknown' };
  }
}

/**
 * HistoryCard - Individual match history card
 *
 * Displays match result with color-coded indicator:
 * - Win: green
 * - Loss: red
 * - Draw: yellow
 * - In Progress: blue
 */
export function HistoryCard({ match, onClick }: HistoryCardProps) {
  const { id, challengeTitle, opponentUsername, result, score, opponentScore, completedAt } =
    match;

  const resultInfo = getResultInfo(result);

  const handleClick = () => {
    onClick(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(id);
    }
  };

  return (
    <div
      className={`history-card history-card--${result}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${challengeTitle} - ${resultInfo.text} against ${opponentUsername}`}
    >
      {/* Result indicator */}
      <div className={`history-card__result history-card__result--${result}`}>
        <span className="history-card__result-icon">{resultInfo.icon}</span>
        <span className="history-card__result-text">{resultInfo.text}</span>
      </div>

      {/* Match info */}
      <div className="history-card__info">
        <div className="history-card__challenge">{challengeTitle}</div>
        <div className="history-card__meta">
          <span className="history-card__opponent">vs {opponentUsername}</span>
          {score !== undefined && opponentScore !== undefined && (
            <span className="history-card__score">
              {score} - {opponentScore}
            </span>
          )}
        </div>
      </div>

      {/* Date */}
      <div className="history-card__date">{formatDate(completedAt)}</div>
    </div>
  );
}

export default HistoryCard;
