import React, { useState } from 'react';
import './Avatar.css';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  /** Image source URL */
  src?: string;
  /** Alt text for the image */
  alt: string;
  /** Fallback text (usually initials) shown when image fails to load */
  fallback?: string;
  /** Size of the avatar */
  size?: AvatarSize;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Get initials from a name or email
 */
function getInitials(text: string): string {
  // If it's an email, use first letter
  if (text.includes('@')) {
    return text.charAt(0).toUpperCase();
  }

  // Split by spaces and get first letter of each word
  const words = text.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  // Get first letter of first and last word
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

/**
 * Avatar - User profile image with fallback to initials
 *
 * Features:
 * - Circular image display
 * - Fallback to initials on load error
 * - Size variants (sm, md, lg)
 *
 * Sizes:
 * - sm: 24px - for compact lists
 * - md: 32px - default size
 * - lg: 48px - for prominent display
 */
export function Avatar({
  src,
  alt,
  fallback,
  size = 'md',
  className = '',
}: AvatarProps) {
  const [hasError, setHasError] = useState(false);

  const showImage = src && !hasError;
  const initials = fallback || getInitials(alt);

  const classNames = ['avatar', `avatar--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} title={alt}>
      {showImage ? (
        <img
          className="avatar__image"
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
        />
      ) : (
        <span className="avatar__fallback" aria-label={alt}>
          {initials}
        </span>
      )}
    </div>
  );
}

export default Avatar;
