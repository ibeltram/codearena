import React from 'react';
import './Spinner.css';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Accessible label for screen readers */
  label?: string;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Spinner - Loading indicator with smooth animation
 *
 * Features:
 * - CSS animation for smooth rotation
 * - Size variants
 * - Color inherits from text color
 * - Accessible label for screen readers
 *
 * Sizes:
 * - sm: 14px - inline with text
 * - md: 20px - default size
 * - lg: 32px - prominent loading states
 */
export function Spinner({
  size = 'md',
  label = 'Loading...',
  className = '',
}: SpinnerProps) {
  const classNames = ['spinner', `spinner--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classNames} role="status" aria-label={label}>
      <span className="spinner__circle" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default Spinner;
