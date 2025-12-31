'use client';

/**
 * DiffViewer Component
 *
 * Side-by-side diff view for comparing file contents between two artifacts.
 * Supports unified and split view modes.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CompareFile, FileDiffStatus } from '@/types/artifact';
import { formatFileSize, getLanguageFromPath } from '@/types/artifact';
import { getMockFileContent } from '@/hooks/use-artifact';

interface DiffViewerProps {
  file: CompareFile;
  viewMode: 'split' | 'unified';
  className?: string;
}

// Simple diff algorithm to find changed lines
function computeLineDiff(
  leftLines: string[],
  rightLines: string[]
): { leftDiff: DiffLine[]; rightDiff: DiffLine[] } {
  const leftDiff: DiffLine[] = [];
  const rightDiff: DiffLine[] = [];

  // Simple LCS-based diff (not optimal but good for demo)
  let i = 0;
  let j = 0;

  while (i < leftLines.length || j < rightLines.length) {
    if (i >= leftLines.length) {
      // Remaining lines only on right (added)
      rightDiff.push({ content: rightLines[j], type: 'added', lineNum: j + 1 });
      leftDiff.push({ content: '', type: 'empty', lineNum: null });
      j++;
    } else if (j >= rightLines.length) {
      // Remaining lines only on left (removed)
      leftDiff.push({ content: leftLines[i], type: 'removed', lineNum: i + 1 });
      rightDiff.push({ content: '', type: 'empty', lineNum: null });
      i++;
    } else if (leftLines[i] === rightLines[j]) {
      // Same line
      leftDiff.push({ content: leftLines[i], type: 'unchanged', lineNum: i + 1 });
      rightDiff.push({ content: rightLines[j], type: 'unchanged', lineNum: j + 1 });
      i++;
      j++;
    } else {
      // Different - try to find matching line ahead
      let foundInRight = rightLines.slice(j, j + 5).indexOf(leftLines[i]);
      let foundInLeft = leftLines.slice(i, i + 5).indexOf(rightLines[j]);

      if (foundInRight !== -1 && (foundInLeft === -1 || foundInRight <= foundInLeft)) {
        // Lines added on right before match
        for (let k = 0; k < foundInRight; k++) {
          rightDiff.push({ content: rightLines[j + k], type: 'added', lineNum: j + k + 1 });
          leftDiff.push({ content: '', type: 'empty', lineNum: null });
        }
        j += foundInRight;
      } else if (foundInLeft !== -1) {
        // Lines removed from left before match
        for (let k = 0; k < foundInLeft; k++) {
          leftDiff.push({ content: leftLines[i + k], type: 'removed', lineNum: i + k + 1 });
          rightDiff.push({ content: '', type: 'empty', lineNum: null });
        }
        i += foundInLeft;
      } else {
        // No match found - treat as modification
        leftDiff.push({ content: leftLines[i], type: 'removed', lineNum: i + 1 });
        rightDiff.push({ content: rightLines[j], type: 'added', lineNum: j + 1 });
        i++;
        j++;
      }
    }
  }

  return { leftDiff, rightDiff };
}

interface DiffLine {
  content: string;
  type: 'unchanged' | 'added' | 'removed' | 'empty';
  lineNum: number | null;
}

const statusColors: Record<FileDiffStatus, string> = {
  unchanged: 'bg-gray-100 text-gray-700',
  modified: 'bg-yellow-100 text-yellow-700',
  added: 'bg-green-100 text-green-700',
  removed: 'bg-red-100 text-red-700',
};

const statusLabels: Record<FileDiffStatus, string> = {
  unchanged: 'Unchanged',
  modified: 'Modified',
  added: 'Added',
  removed: 'Removed',
};

export function DiffViewer({ file, viewMode, className }: DiffViewerProps) {
  // Get file contents
  const leftContent = useMemo(() => {
    if (!file.leftFile) return null;
    return getMockFileContent(file.path);
  }, [file.leftFile, file.path]);

  const rightContent = useMemo(() => {
    if (!file.rightFile) return null;
    return getMockFileContent(file.path);
  }, [file.rightFile, file.path]);

  // Compute diff
  const { leftDiff, rightDiff } = useMemo(() => {
    const leftLines = leftContent?.content.split('\n') || [];
    const rightLines = rightContent?.content.split('\n') || [];

    if (file.status === 'unchanged') {
      return {
        leftDiff: leftLines.map((line, i) => ({
          content: line,
          type: 'unchanged' as const,
          lineNum: i + 1,
        })),
        rightDiff: rightLines.map((line, i) => ({
          content: line,
          type: 'unchanged' as const,
          lineNum: i + 1,
        })),
      };
    }

    if (file.status === 'added') {
      return {
        leftDiff: [],
        rightDiff: rightLines.map((line, i) => ({
          content: line,
          type: 'added' as const,
          lineNum: i + 1,
        })),
      };
    }

    if (file.status === 'removed') {
      return {
        leftDiff: leftLines.map((line, i) => ({
          content: line,
          type: 'removed' as const,
          lineNum: i + 1,
        })),
        rightDiff: [],
      };
    }

    return computeLineDiff(leftLines, rightLines);
  }, [leftContent, rightContent, file.status]);

  const language = getLanguageFromPath(file.path);
  const filename = file.path.split('/').pop() || file.path;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">
            {file.path}
          </span>
          <Badge className={statusColors[file.status]}>
            {statusLabels[file.status]}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{language}</span>
          {file.leftFile && <span>Left: {formatFileSize(file.leftFile.size)}</span>}
          {file.rightFile && <span>Right: {formatFileSize(file.rightFile.size)}</span>}
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'split' ? (
          <SplitView leftDiff={leftDiff} rightDiff={rightDiff} />
        ) : (
          <UnifiedView leftDiff={leftDiff} rightDiff={rightDiff} />
        )}
      </div>
    </div>
  );
}

interface ViewProps {
  leftDiff: DiffLine[];
  rightDiff: DiffLine[];
}

function SplitView({ leftDiff, rightDiff }: ViewProps) {
  const maxLines = Math.max(leftDiff.length, rightDiff.length);

  return (
    <div className="flex min-w-full">
      {/* Left side */}
      <div className="flex-1 border-r border-gray-300 dark:border-gray-700">
        <div className="text-xs font-medium text-gray-500 px-4 py-1 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          Left (Original)
        </div>
        <pre className="text-sm font-mono">
          <code>
            <table className="w-full border-collapse">
              <tbody>
                {Array.from({ length: maxLines }).map((_, index) => {
                  const line = leftDiff[index];
                  return (
                    <tr
                      key={`left-${index}`}
                      className={cn(
                        line?.type === 'removed' && 'bg-red-50 dark:bg-red-900/20',
                        line?.type === 'empty' && 'bg-gray-50 dark:bg-gray-900/50'
                      )}
                    >
                      <td className="px-2 py-0.5 text-right text-gray-400 dark:text-gray-600 select-none border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 w-12 text-xs">
                        {line?.lineNum || ''}
                      </td>
                      <td className="px-2 py-0.5 text-right text-gray-400 dark:text-gray-600 select-none w-6 text-xs">
                        {line?.type === 'removed' && '−'}
                      </td>
                      <td className={cn(
                        'px-4 py-0.5 whitespace-pre',
                        line?.type === 'removed' && 'text-red-700 dark:text-red-300',
                        line?.type === 'empty' && 'text-gray-300'
                      )}>
                        {line?.content || '\u00A0'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </code>
        </pre>
      </div>

      {/* Right side */}
      <div className="flex-1">
        <div className="text-xs font-medium text-gray-500 px-4 py-1 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          Right (New)
        </div>
        <pre className="text-sm font-mono">
          <code>
            <table className="w-full border-collapse">
              <tbody>
                {Array.from({ length: maxLines }).map((_, index) => {
                  const line = rightDiff[index];
                  return (
                    <tr
                      key={`right-${index}`}
                      className={cn(
                        line?.type === 'added' && 'bg-green-50 dark:bg-green-900/20',
                        line?.type === 'empty' && 'bg-gray-50 dark:bg-gray-900/50'
                      )}
                    >
                      <td className="px-2 py-0.5 text-right text-gray-400 dark:text-gray-600 select-none border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 w-12 text-xs">
                        {line?.lineNum || ''}
                      </td>
                      <td className="px-2 py-0.5 text-right text-gray-400 dark:text-gray-600 select-none w-6 text-xs">
                        {line?.type === 'added' && '+'}
                      </td>
                      <td className={cn(
                        'px-4 py-0.5 whitespace-pre',
                        line?.type === 'added' && 'text-green-700 dark:text-green-300',
                        line?.type === 'empty' && 'text-gray-300'
                      )}>
                        {line?.content || '\u00A0'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </code>
        </pre>
      </div>
    </div>
  );
}

function UnifiedView({ leftDiff, rightDiff }: ViewProps) {
  // Merge diffs into unified view
  const unifiedLines: (DiffLine & { side: 'left' | 'right' | 'both' })[] = [];

  let leftIdx = 0;
  let rightIdx = 0;

  while (leftIdx < leftDiff.length || rightIdx < rightDiff.length) {
    const left = leftDiff[leftIdx];
    const right = rightDiff[rightIdx];

    if (left?.type === 'removed') {
      unifiedLines.push({ ...left, side: 'left' });
      leftIdx++;
    } else if (right?.type === 'added') {
      unifiedLines.push({ ...right, side: 'right' });
      rightIdx++;
    } else if (left?.type === 'unchanged' || left?.type === 'empty') {
      unifiedLines.push({ ...(left || right), side: 'both' });
      leftIdx++;
      rightIdx++;
    } else {
      // Handle edge cases
      if (left) {
        unifiedLines.push({ ...left, side: 'left' });
        leftIdx++;
      }
      if (right) {
        unifiedLines.push({ ...right, side: 'right' });
        rightIdx++;
      }
    }
  }

  return (
    <pre className="text-sm font-mono">
      <code>
        <table className="w-full border-collapse">
          <tbody>
            {unifiedLines.map((line, index) => (
              <tr
                key={index}
                className={cn(
                  line.type === 'removed' && 'bg-red-50 dark:bg-red-900/20',
                  line.type === 'added' && 'bg-green-50 dark:bg-green-900/20'
                )}
              >
                <td className="px-2 py-0.5 text-right text-gray-400 dark:text-gray-600 select-none border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 w-12 text-xs">
                  {line.side === 'left' || line.side === 'both' ? line.lineNum || '' : ''}
                </td>
                <td className="px-2 py-0.5 text-right text-gray-400 dark:text-gray-600 select-none border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 w-12 text-xs">
                  {line.side === 'right' || line.side === 'both' ? line.lineNum || '' : ''}
                </td>
                <td className="px-2 py-0.5 text-center text-gray-400 dark:text-gray-600 select-none w-6 text-xs">
                  {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ''}
                </td>
                <td className={cn(
                  'px-4 py-0.5 whitespace-pre',
                  line.type === 'removed' && 'text-red-700 dark:text-red-300',
                  line.type === 'added' && 'text-green-700 dark:text-green-300',
                  line.type === 'unchanged' && 'text-gray-800 dark:text-gray-200'
                )}>
                  {line.content || '\u00A0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </code>
    </pre>
  );
}

export default DiffViewer;
