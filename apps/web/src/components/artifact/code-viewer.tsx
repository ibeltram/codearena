'use client';

/**
 * CodeViewer Component
 *
 * Displays file content with syntax highlighting and line numbers.
 * Uses a simple approach without Monaco for better performance.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { FileContent, formatFileSize } from '@/types/artifact';
import { Skeleton } from '@/components/ui/skeleton';

interface CodeViewerProps {
  content: FileContent | null;
  isLoading?: boolean;
  error?: Error | null;
  className?: string;
}

export function CodeViewer({
  content,
  isLoading,
  error,
  className,
}: CodeViewerProps) {
  const lines = useMemo(() => {
    if (!content?.content) return [];
    return content.content.split('\n');
  }, [content?.content]);

  if (isLoading) {
    return (
      <div className={cn('p-4', className)}>
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4', className)}>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h4 className="text-red-800 dark:text-red-200 font-medium">
            Error loading file
          </h4>
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">
            {error.message || 'Failed to load file content'}
          </p>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className={cn('p-4 flex items-center justify-center h-full', className)}>
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-2">📄</div>
          <p>Select a file to view its contents</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {content.path.split('/').pop()}
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500">{content.language}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{content.lineCount} lines</span>
          <span>{formatFileSize(content.size)}</span>
        </div>
      </div>

      {/* Code content */}
      <div className="flex-1 overflow-auto">
        <pre className="text-sm font-mono">
          <code className={`language-${content.language}`}>
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, index) => (
                  <tr
                    key={index}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    {/* Line number */}
                    <td
                      className="px-4 py-0.5 text-right text-gray-400 dark:text-gray-600 select-none border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 w-12"
                    >
                      {index + 1}
                    </td>
                    {/* Line content */}
                    <td className="px-4 py-0.5 whitespace-pre text-gray-800 dark:text-gray-200">
                      {line || '\u00A0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </code>
        </pre>
      </div>
    </div>
  );
}

export default CodeViewer;
