import React, { useMemo } from 'react';
import { useExtension } from '../../context';
import { MatchTimer } from './MatchTimer';
import { ParticipantCard } from './ParticipantCard';
import { MatchActions } from './MatchActions';
import { ConnectionStatus } from './ConnectionStatus';
import { MatchStatusBadge } from './MatchStatusBadge';
import type { MatchStatus } from './MatchStatusBadge';
import './ActiveMatchTab.css';

/**
 * ActiveMatchTab - Container for displaying active match state
 *
 * Shows:
 * - Empty state when no match
 * - Full match display with timer, participants, and actions
 */
export function ActiveMatchTab() {
  const { state, dispatch } = useExtension();
  const { match, timeRemaining, connectionState, user } = state;

  // Find current user's participant info
  const currentUserParticipant = useMemo(() => {
    if (!match || !user) return null;
    return match.participants.find((p) => p.userId === user.id) || null;
  }, [match, user]);

  // Find opponent's participant info
  const opponentParticipant = useMemo(() => {
    if (!match || !user) return null;
    return match.participants.find((p) => p.userId !== user.id) || null;
  }, [match, user]);

  // Switch to challenges tab
  const goToChallenges = () => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: { tab: 'challenges' } });
  };

  // Empty state when no active match
  if (!match) {
    return (
      <div className="active-match-tab">
        <div className="active-match-tab__empty">
          <div className="active-match-tab__empty-icon">&#x1F3AE;</div>
          <div className="active-match-tab__empty-title">No active match</div>
          <div className="active-match-tab__empty-message">
            Join a challenge to start competing!
          </div>
          <button className="active-match-tab__empty-button" onClick={goToChallenges}>
            Browse Challenges
          </button>
        </div>
      </div>
    );
  }

  // Determine user states for actions
  const isReady = !!currentUserParticipant?.readyAt;
  const hasSubmission = !!match.mySubmission;
  const isLocked = !!match.mySubmission?.lockedAt;

  return (
    <div className="active-match-tab">
      {/* Header with challenge info */}
      <div className="active-match-tab__header">
        <h2 className="active-match-tab__title">{match.challengeTitle}</h2>
        <div className="active-match-tab__meta">
          <MatchStatusBadge status={match.status as MatchStatus} />
          <ConnectionStatus state={connectionState} />
        </div>
      </div>

      {/* Timer - prominent display */}
      {(match.status === 'in_progress' || match.status === 'matched') && (
        <div className="active-match-tab__timer">
          <MatchTimer timeRemaining={timeRemaining} />
        </div>
      )}

      {/* Participants */}
      <div className="active-match-tab__participants">
        {currentUserParticipant && (
          <ParticipantCard participant={currentUserParticipant} isCurrentUser={true} />
        )}
        {opponentParticipant && (
          <ParticipantCard participant={opponentParticipant} isCurrentUser={false} />
        )}
        {!opponentParticipant && match.status === 'open' && (
          <div className="active-match-tab__waiting">
            <div className="active-match-tab__waiting-spinner" />
            <span>Waiting for opponent...</span>
          </div>
        )}
      </div>

      {/* Stakes info */}
      <div className="active-match-tab__stakes">
        <span className="active-match-tab__stakes-label">Stakes:</span>
        <span className="active-match-tab__stakes-value">{match.stakeAmount} credits</span>
      </div>

      {/* Actions */}
      <div className="active-match-tab__actions">
        <MatchActions
          matchStatus={match.status}
          isReady={isReady}
          hasSubmission={hasSubmission}
          isLocked={isLocked}
        />
      </div>
    </div>
  );
}

export default ActiveMatchTab;
