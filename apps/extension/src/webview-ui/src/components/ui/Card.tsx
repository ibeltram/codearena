import React from 'react';
import './Card.css';

export interface CardProps {
  /** Enable hover effects for interactive cards */
  interactive?: boolean;
  /** Optional click handler (implies interactive) */
  onClick?: () => void;
  /** Additional CSS class names */
  className?: string;
  /** Card content */
  children: React.ReactNode;
}

/**
 * Card - Container component with optional hover states
 *
 * Uses VS Code theme variables for consistent appearance.
 * Interactive cards show hover effects and can be clicked.
 */
export function Card({
  interactive = false,
  onClick,
  className = '',
  children,
}: CardProps) {
  const isInteractive = interactive || !!onClick;
  const classNames = [
    'card',
    isInteractive ? 'card--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (isInteractive) {
    return (
      <div
        className={classNames}
        onClick={onClick}
        onKeyDown={(e) => {
          if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
          }
        }}
        tabIndex={0}
        role="button"
      >
        {children}
      </div>
    );
  }

  return <div className={classNames}>{children}</div>;
}

export default Card;
