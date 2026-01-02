import React from 'react';
import './EmptyState.css';

export interface EmptyStateProps {
  /** Icon or emoji to display */
  icon?: React.ReactNode;
  /** Main title message */
  title: string;
  /** Secondary description text */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Additional CSS class names */
  className?: string;
}

/**
 * EmptyState - Displayed when there's no data to show
 *
 * Use cases:
 * - No challenges available
 * - No match history
 * - Empty search results
 * - First-time user experience
 *
 * Features:
 * - Centered layout
 * - Optional icon/illustration
 * - Title and description
 * - Optional call-to-action button
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  const classNames = ['empty-state', className].filter(Boolean).join(' ');

  return (
    <div className={classNames}>
      {icon && <div className="empty-state__icon">{icon}</div>}
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__description">{description}</p>}
      {action && (
        <button className="empty-state__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
