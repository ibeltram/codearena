import React, { useMemo } from 'react';
import './MatchTimer.css';

export interface MatchTimerProps {
  /** Time remaining in seconds */
  timeRemaining: number;
  /** Threshold in seconds for warning state (default: 300 = 5 min) */
  warningThreshold?: number;
  /** Threshold in seconds for critical state (default: 60 = 1 min) */
  criticalThreshold?: number;
}

/**
 * Format seconds into HH:MM:SS or MM:SS
 */
function formatTime(seconds: number): string {
  if (seconds < 0) seconds = 0;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
}

/**
 * MatchTimer - Countdown timer with warning states
 *
 * Displays the remaining time in a match with visual indicators:
 * - Normal: default text color
 * - Warning (< 5 min): yellow/warning color
 * - Critical (< 1 min): red/error color with pulsing animation
 */
export function MatchTimer({
  timeRemaining,
  warningThreshold = 300,
  criticalThreshold = 60,
}: MatchTimerProps) {
  // Determine the timer state
  const timerState = useMemo(() => {
    if (timeRemaining <= 0) return 'expired';
    if (timeRemaining <= criticalThreshold) return 'critical';
    if (timeRemaining <= warningThreshold) return 'warning';
    return 'normal';
  }, [timeRemaining, warningThreshold, criticalThreshold]);

  // Format the time string
  const timeString = formatTime(timeRemaining);

  return (
    <div className={`match-timer match-timer--${timerState}`}>
      <div className="match-timer__label">Time Remaining</div>
      <div className="match-timer__time">{timeString}</div>
      {timerState === 'critical' && (
        <div className="match-timer__warning-text">Less than 1 minute!</div>
      )}
      {timerState === 'warning' && (
        <div className="match-timer__warning-text">Less than 5 minutes</div>
      )}
      {timerState === 'expired' && (
        <div className="match-timer__warning-text">Time's up!</div>
      )}
    </div>
  );
}

export default MatchTimer;
