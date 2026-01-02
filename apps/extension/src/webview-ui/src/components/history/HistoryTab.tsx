import React from 'react';
import { MatchHistoryItem } from '../../types/messages';
import { useVSCodeMessaging } from '../../hooks/useVSCodeMessaging';
import { HistoryCard } from './HistoryCard';
import { StatsOverview } from './StatsOverview';
import './HistoryTab.css';

export interface HistoryTabProps {
  /** Match history items */
  history: MatchHistoryItem[];
  /** Whether history is loading */
  loading: boolean;
  /** Error message if any */
  error: string | null;
}

/**
 * Loading skeleton for history list
 */
function LoadingSkeleton() {
  return (
    <div className="history-tab__loading">
      {[1, 2, 3].map((i) => (
        <div key={i} className="history-card-skeleton">
          <div className="history-card-skeleton__result" />
          <div className="history-card-skeleton__info">
            <div className="history-card-skeleton__title" />
            <div className="history-card-skeleton__meta" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state for new users
 */
function EmptyState() {
  return (
    <div className="history-tab__empty">
      <div className="history-tab__empty-icon">&#x1F3C6;</div>
      <div className="history-tab__empty-title">No matches yet</div>
      <div className="history-tab__empty-description">
        Your match history will appear here after you complete your first match.
      </div>
    </div>
  );
}

/**
 * Error state with retry
 */
interface ErrorStateProps {
  error: string;
  onRetry: () => void;
}

function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="history-tab__error">
      <div className="history-tab__error-icon">&#x26A0;</div>
      <div className="history-tab__error-message">{error}</div>
      <button className="history-tab__retry-button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

/**
 * HistoryTab - History tab container with stats and match list
 *
 * Shows:
 * - Stats overview (wins/losses/draws)
 * - Scrollable list of history cards
 * - Loading/error/empty states
 */
export function HistoryTab({ history, loading, error }: HistoryTabProps) {
  const { refreshHistory, viewMatchDetails } = useVSCodeMessaging();

  const handleCardClick = (matchId: string) => {
    viewMatchDetails(matchId);
  };

  // Loading state
  if (loading && history.length === 0) {
    return (
      <div className="history-tab">
        <LoadingSkeleton />
      </div>
    );
  }

  // Error state
  if (error && history.length === 0) {
    return (
      <div className="history-tab">
        <ErrorState error={error} onRetry={refreshHistory} />
      </div>
    );
  }

  // Empty state
  if (!loading && history.length === 0) {
    return (
      <div className="history-tab">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="history-tab">
      <StatsOverview matches={history} />

      <div className="history-tab__list">
        {history.map((match) => (
          <HistoryCard key={match.id} match={match} onClick={handleCardClick} />
        ))}
      </div>

      {loading && (
        <div className="history-tab__loading-indicator">Loading...</div>
      )}
    </div>
  );
}

export default HistoryTab;
