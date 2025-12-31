'use client';

/**
 * FileCompareList Component
 *
 * Lists files with diff status indicators for navigation.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { CompareFile, FileDiffStatus, ArtifactComparison } from '@/types/artifact';
import { formatFileSize } from '@/types/artifact';

interface FileCompareListProps {
  comparison: ArtifactComparison;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  showUnchanged: boolean;
  className?: string;
}

const statusIcons: Record<FileDiffStatus, string> = {
  unchanged: '○',
  modified: '●',
  added: '+',
  removed: '−',
};

const statusColors: Record<FileDiffStatus, string> = {
  unchanged: 'text-gray-400',
  modified: 'text-yellow-500',
  added: 'text-green-500',
  removed: 'text-red-500',
};

const statusBgColors: Record<FileDiffStatus, string> = {
  unchanged: 'hover:bg-gray-50 dark:hover:bg-gray-800',
  modified: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20',
  added: 'hover:bg-green-50 dark:hover:bg-green-900/20',
  removed: 'hover:bg-red-50 dark:hover:bg-red-900/20',
};

export function FileCompareList({
  comparison,
  selectedPath,
  onSelectFile,
  showUnchanged,
  className,
}: FileCompareListProps) {
  const files = showUnchanged
    ? comparison.files
    : comparison.files.filter((f) => f.status !== 'unchanged');

  // Group files by directory
  const filesByDir = new Map<string, CompareFile[]>();

  for (const file of files) {
    const parts = file.path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    const existing = filesByDir.get(dir) || [];
    filesByDir.set(dir, [...existing, file]);
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Summary Header */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Changed Files
          </span>
          <div className="flex items-center gap-2">
            {comparison.summary.modified > 0 && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-300 text-xs py-0 px-1.5">
                {comparison.summary.modified} modified
              </Badge>
            )}
            {comparison.summary.added > 0 && (
              <Badge variant="outline" className="text-green-600 border-green-300 text-xs py-0 px-1.5">
                {comparison.summary.added} added
              </Badge>
            )}
            {comparison.summary.removed > 0 && (
              <Badge variant="outline" className="text-red-600 border-red-300 text-xs py-0 px-1.5">
                {comparison.summary.removed} removed
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            <div className="text-center">
              <div className="text-2xl mb-2">✓</div>
              <p>No differences found</p>
            </div>
          </div>
        ) : (
          <div className="py-1">
            {Array.from(filesByDir.entries()).map(([dir, dirFiles]) => (
              <div key={dir || 'root'}>
                {/* Directory header */}
                {dir && (
                  <div className="px-3 py-1 text-xs text-gray-500 bg-gray-50/50 dark:bg-gray-800/50 font-mono">
                    {dir}/
                  </div>
                )}

                {/* Files in directory */}
                {dirFiles.map((file) => {
                  const filename = file.path.split('/').pop() || file.path;
                  const isSelected = selectedPath === file.path;

                  return (
                    <button
                      key={file.path}
                      onClick={() => onSelectFile(file.path)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                        statusBgColors[file.status],
                        isSelected && 'bg-blue-50 dark:bg-blue-900/30'
                      )}
                    >
                      {/* Status indicator */}
                      <span className={cn('w-4 text-center font-bold', statusColors[file.status])}>
                        {statusIcons[file.status]}
                      </span>

                      {/* Filename */}
                      <span className={cn(
                        'flex-1 truncate font-mono text-xs',
                        isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300',
                        file.status === 'removed' && 'line-through opacity-60'
                      )}>
                        {filename}
                      </span>

                      {/* Size change indicator */}
                      {file.status === 'modified' && file.leftFile && file.rightFile && (
                        <SizeChange left={file.leftFile.size} right={file.rightFile.size} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with total stats */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
        <div className="flex justify-between">
          <span>
            {comparison.leftArtifact.manifestJson.fileCount} → {comparison.rightArtifact.manifestJson.fileCount} files
          </span>
          <span>
            {formatFileSize(comparison.leftArtifact.sizeBytes)} → {formatFileSize(comparison.rightArtifact.sizeBytes)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface SizeChangeProps {
  left: number;
  right: number;
}

function SizeChange({ left, right }: SizeChangeProps) {
  const diff = right - left;
  const percent = left > 0 ? Math.round((diff / left) * 100) : 100;

  if (diff === 0) return null;

  return (
    <span className={cn(
      'text-xs whitespace-nowrap',
      diff > 0 ? 'text-green-600' : 'text-red-600'
    )}>
      {diff > 0 ? '+' : ''}{formatFileSize(Math.abs(diff))}
      <span className="opacity-60 ml-0.5">
        ({diff > 0 ? '+' : ''}{percent}%)
      </span>
    </span>
  );
}

export default FileCompareList;
