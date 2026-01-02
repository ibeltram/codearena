import React from 'react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant of the button */
  variant?: ButtonVariant;
  /** Size of the button */
  size?: ButtonSize;
  /** Whether the button is in a loading state */
  loading?: boolean;
  /** Icon to display before the button text */
  icon?: React.ReactNode;
  /** Additional CSS class names */
  className?: string;
  /** Button contents */
  children: React.ReactNode;
}

/**
 * Button - Reusable button component with multiple variants
 *
 * Variants:
 * - primary: Main action buttons (--vscode-button-background)
 * - secondary: Secondary actions (--vscode-button-secondaryBackground)
 * - ghost: Minimal style with hover state
 * - destructive: Dangerous actions (red color)
 *
 * Sizes:
 * - sm: Compact buttons for tight spaces
 * - md: Default size (recommended)
 * - lg: Prominent buttons for main actions
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const classNames = [
    'button',
    `button--${variant}`,
    `button--${size}`,
    loading && 'button--loading',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classNames} disabled={isDisabled} {...props}>
      {loading && <span className="button__spinner" aria-hidden="true" />}
      {icon && !loading && <span className="button__icon">{icon}</span>}
      <span className="button__text">{children}</span>
    </button>
  );
}

export default Button;
