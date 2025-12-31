'use client';

/**
 * Breadcrumb Component
 *
 * Displays file path as clickable breadcrumb navigation.
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface BreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
  className?: string;
}

export function Breadcrumb({ path, onNavigate, className }: BreadcrumbProps) {
  const parts = path.split('/').filter(Boolean);

  return (
    <nav
      className={cn('flex items-center gap-1 text-sm overflow-x-auto', className)}
      aria-label="File path"
    >
      {/* Root */}
      <button
        onClick={() => onNavigate('')}
        className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex-shrink-0"
      >
        📁
      </button>

      {parts.map((part, index) => {
        const currentPath = parts.slice(0, index + 1).join('/');
        const isLast = index === parts.length - 1;

        return (
          <React.Fragment key={currentPath}>
            <span className="text-gray-400 flex-shrink-0">/</span>
            {isLast ? (
              <span className="text-gray-900 dark:text-gray-100 font-medium truncate">
                {part}
              </span>
            ) : (
              <button
                onClick={() => onNavigate(currentPath)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors truncate"
              >
                {part}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;
