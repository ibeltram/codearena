import React from 'react';
import './ErrorState.css';

export interface ErrorStateProps {
  /** Error message to display */
  message: string;
  /** Optional detailed error info */
  details?: string;
  /** Retry callback */
  onRetry?: () => void;
  /** Additional CSS class names */
  className?: string;
}

/**
 * ErrorState - Displayed when an error occurs
 *
 * Use cases:
 * - Network errors
 * - API failures
 * - Data loading errors
 *
 * Features:
 * - Error icon
 * - Error message display
 * - Optional detailed error info
 * - "Try Again" button for retry
 */
export function ErrorState({
  message,
  details,
  onRetry,
  className = '',
}: ErrorStateProps) {
  const classNames = ['error-state', className].filter(Boolean).join(' ');

  return (
    <div className={classNames}>
      <div className="error-state__icon" aria-hidden="true">
        &#x26A0;
      </div>
      <h3 className="error-state__title">Something went wrong</h3>
      <p className="error-state__message">{message}</p>
      {details && <p className="error-state__details">{details}</p>}
      {onRetry && (
        <button className="error-state__retry" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}

export default ErrorState;
