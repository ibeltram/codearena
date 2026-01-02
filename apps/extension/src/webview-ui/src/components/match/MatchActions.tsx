import React from 'react';
import { MatchStatus } from '../../types/messages';
import { useVSCodeMessaging } from '../../hooks/useVSCodeMessaging';
import './MatchActions.css';

export interface MatchActionsProps {
  /** Current match status */
  matchStatus: MatchStatus;
  /** Whether the current user is ready */
  isReady: boolean;
  /** Whether the current user has submitted */
  hasSubmission: boolean;
  /** Whether the submission is locked */
  isLocked: boolean;
}

/**
 * MatchActions - Action buttons based on current match state
 *
 * Shows different buttons depending on match state:
 * - Ready: shown in matched state when not ready
 * - Submit: shown when in_progress
 * - Lock: shown when submitted but not locked
 * - Forfeit: always shown (destructive)
 * - Open in Web: always shown (secondary)
 */
export function MatchActions({
  matchStatus,
  isReady,
  hasSubmission,
  isLocked,
}: MatchActionsProps) {
  const { setReady, submit, lockSubmission, forfeit, openMatchInWeb } =
    useVSCodeMessaging();

  // Determine which buttons to show
  const showReady = matchStatus === 'matched' && !isReady;
  const showSubmit = matchStatus === 'in_progress' && !isLocked;
  const showLock = matchStatus === 'in_progress' && hasSubmission && !isLocked;
  const showForfeit =
    matchStatus === 'open' ||
    matchStatus === 'matched' ||
    matchStatus === 'in_progress';

  return (
    <div className="match-actions">
      {/* Primary actions */}
      <div className="match-actions__primary">
        {showReady && (
          <button
            className="match-actions__button match-actions__button--primary"
            onClick={setReady}
          >
            <span className="match-actions__button-icon">&#x2713;</span>
            Ready
          </button>
        )}

        {showSubmit && (
          <button
            className="match-actions__button match-actions__button--primary"
            onClick={submit}
          >
            <span className="match-actions__button-icon">&#x2191;</span>
            Submit
          </button>
        )}

        {showLock && (
          <button
            className="match-actions__button match-actions__button--warning"
            onClick={lockSubmission}
          >
            <span className="match-actions__button-icon">&#x1F512;</span>
            Lock Submission
          </button>
        )}
      </div>

      {/* Secondary actions */}
      <div className="match-actions__secondary">
        <button
          className="match-actions__button match-actions__button--secondary"
          onClick={openMatchInWeb}
        >
          <span className="match-actions__button-icon">&#x1F517;</span>
          Open in Web
        </button>

        {showForfeit && (
          <button
            className="match-actions__button match-actions__button--destructive"
            onClick={forfeit}
          >
            <span className="match-actions__button-icon">&#x2715;</span>
            Forfeit
          </button>
        )}
      </div>

      {/* Status messages */}
      {isLocked && (
        <div className="match-actions__status match-actions__status--locked">
          &#x1F512; Submission locked - waiting for results
        </div>
      )}

      {matchStatus === 'judging' && (
        <div className="match-actions__status match-actions__status--judging">
          &#x2699; Judging in progress...
        </div>
      )}

      {matchStatus === 'finalized' && (
        <div className="match-actions__status match-actions__status--finalized">
          &#x2713; Match complete
        </div>
      )}
    </div>
  );
}

export default MatchActions;
