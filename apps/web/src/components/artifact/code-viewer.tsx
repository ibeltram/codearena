'use client';

/**
 * CodeViewer Component
 *
 * Displays file content with line numbers and basic syntax styling.
 * Uses CSS-based styling for code display without external syntax highlighting libraries.
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

/**
 * Get language label for display
 */
function getLanguageLabel(language: string): string {
  const labels: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    jsx: 'JSX',
    tsx: 'TSX',
    json: 'JSON',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    python: 'Python',
    ruby: 'Ruby',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    kotlin: 'Kotlin',
    csharp: 'C#',
    cpp: 'C++',
    c: 'C',
    php: 'PHP',
    swift: 'Swift',
    sql: 'SQL',
    yaml: 'YAML',
    yml: 'YAML',
    xml: 'XML',
    markdown: 'Markdown',
    md: 'Markdown',
    shell: 'Shell',
    bash: 'Bash',
    dockerfile: 'Dockerfile',
    plaintext: 'Plain Text',
  };

  return labels[language.toLowerCase()] || language;
}

export function CodeViewer({
  content,
  isLoading,
  error,
  className,
}: CodeViewerProps) {
  // Split content into lines for line numbers
  const lines = useMemo(() => {
    if (!content?.content) return [];
    return content.content.split('\n');
  }, [content?.content]);

  // Calculate the width needed for line numbers
  const lineNumberWidth = useMemo(() => {
    const digits = String(lines.length).length;
    return Math.max(digits * 0.6 + 1.5, 3); // em units
  }, [lines.length]);

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
          <span className="text-gray-500">{getLanguageLabel(content.language)}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{content.lineCount} lines</span>
          <span>{formatFileSize(content.size)}</span>
        </div>
      </div>

      {/* Code content */}
      <div className="flex-1 overflow-auto bg-[#1e1e1e]">
        <div className="flex min-h-full">
          {/* Line numbers column */}
          <div
            className="flex-shrink-0 text-right select-none bg-[#1e1e1e] border-r border-gray-700 py-3 pr-3"
            style={{ width: `${lineNumberWidth}em` }}
          >
            {lines.map((_, index) => (
              <div
                key={index}
                className="text-gray-500 text-[13px] leading-[1.5] font-mono px-2"
              >
                {index + 1}
              </div>
            ))}
          </div>

          {/* Code content column */}
          <div className="flex-1 overflow-x-auto">
            <pre className="py-3 px-4 m-0">
              <code className="text-[13px] leading-[1.5] font-mono text-gray-200">
                {lines.map((line, index) => (
                  <div
                    key={index}
                    className="hover:bg-gray-800/50 min-h-[1.5em]"
                  >
                    {line || ' '}
                  </div>
                ))}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CodeViewer;
