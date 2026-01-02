import React from 'react';
import { MatchParticipant } from '../../types/messages';
import './ParticipantCard.css';

export interface ParticipantCardProps {
  /** The participant data */
  participant: MatchParticipant;
  /** Whether this is the current user */
  isCurrentUser: boolean;
}

/**
 * Get initials from username for avatar fallback
 */
function getInitials(username: string): string {
  return username
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * ParticipantCard - Displays participant info and status
 *
 * Shows:
 * - Avatar with user image or initials fallback
 * - Display name with "You" indicator if current user
 * - Ready status indicator
 * - Submission status indicator (submitted/locked)
 */
export function ParticipantCard({
  participant,
  isCurrentUser,
}: ParticipantCardProps) {
  const { username, avatarUrl, readyAt, hasSubmitted, hasLocked } = participant;

  // Determine status states
  const isReady = !!readyAt;

  return (
    <div
      className={`participant-card ${isCurrentUser ? 'participant-card--current' : ''}`}
    >
      {/* Avatar */}
      <div className="participant-card__avatar">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={username}
            className="participant-card__avatar-image"
          />
        ) : (
          <div className="participant-card__avatar-fallback">
            {getInitials(username)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="participant-card__info">
        <div className="participant-card__name">
          {username}
          {isCurrentUser && (
            <span className="participant-card__you-badge">You</span>
          )}
        </div>

        {/* Status indicators */}
        <div className="participant-card__statuses">
          {/* Ready status */}
          <StatusBadge
            type={isReady ? 'ready' : 'not-ready'}
            label={isReady ? 'Ready' : 'Not Ready'}
          />

          {/* Submission status */}
          {hasLocked && <StatusBadge type="locked" label="Locked" />}
          {hasSubmitted && !hasLocked && (
            <StatusBadge type="submitted" label="Submitted" />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Status badge sub-component
 */
interface StatusBadgeProps {
  type: 'ready' | 'not-ready' | 'submitted' | 'locked';
  label: string;
}

function StatusBadge({ type, label }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${type}`}>{label}</span>;
}

export default ParticipantCard;
