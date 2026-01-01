'use client';

/**
 * Match Compare Page
 *
 * Side-by-side comparison of two match submissions with diff view.
 */

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMatchComparison } from '@/hooks/use-artifact';
import { CompareHeader, FileCompareList, DiffViewer } from '@/components/compare';

export default function MatchComparePage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [showUnchanged, setShowUnchanged] = useState(false);

  const { data: comparison, isLoading, error } = useMatchComparison(matchId);

  // Auto-select first changed file when data loads
  React.useEffect(() => {
    if (comparison && !selectedFile) {
      const firstChanged = comparison.comparison.files.find(
        (f) => f.status !== 'unchanged'
      );
      if (firstChanged) {
        setSelectedFile(firstChanged.path);
      }
    }
  }, [comparison, selectedFile]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="container mx-auto px-4 py-4">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <div className="text-center">
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-xl font-semibold text-red-600 mb-2">
              Error Loading Comparison
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {error.message || 'Failed to load match comparison. Please try again.'}
            </p>
            <Button onClick={() => router.back()}>Go Back</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <div className="text-center">
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-xl font-semibold mb-2">No Comparison Available</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              This match does not have submissions to compare yet.
            </p>
            <Button onClick={() => router.back()}>Go Back</Button>
          </div>
        </Card>
      </div>
    );
  }

  const selectedFileData = selectedFile
    ? comparison.comparison.files.find((f) => f.path === selectedFile)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Page Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Link
                  href={`/matches/${matchId}`}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ← Back to Match
                </Link>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Submission Comparison
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                Compare code submissions side-by-side
              </p>
            </div>

            {/* Download buttons */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                ⬇️ Download Left
              </Button>
              <Button variant="outline" size="sm">
                ⬇️ Download Right
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Score Comparison Header */}
      <div className="container mx-auto px-4 py-6">
        <CompareHeader comparison={comparison} />
      </div>

      {/* Diff Controls */}
      <div className="border-y border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* View mode toggle */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('split')}
                  className={cn(
                    'px-3 py-1 text-sm rounded-md transition-colors',
                    viewMode === 'split'
                      ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  )}
                >
                  Split
                </button>
                <button
                  onClick={() => setViewMode('unified')}
                  className={cn(
                    'px-3 py-1 text-sm rounded-md transition-colors',
                    viewMode === 'unified'
                      ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  )}
                >
                  Unified
                </button>
              </div>

              {/* Show unchanged toggle */}
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnchanged}
                  onChange={(e) => setShowUnchanged(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Show unchanged files
              </label>
            </div>

            {/* Summary stats */}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                {comparison.comparison.summary.modified} modified
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {comparison.comparison.summary.added} added
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {comparison.comparison.summary.removed} removed
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - File List + Diff Viewer */}
      <div className="flex-1 flex overflow-hidden">
        {/* File List Sidebar */}
        <div className="w-72 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
          <FileCompareList
            comparison={comparison.comparison}
            selectedPath={selectedFile}
            onSelectFile={setSelectedFile}
            showUnchanged={showUnchanged}
            className="h-full"
          />
        </div>

        {/* Diff Viewer */}
        <div className="flex-1 bg-white dark:bg-gray-900 overflow-hidden">
          {selectedFileData ? (
            <DiffViewer
              file={selectedFileData}
              viewMode={viewMode}
              leftArtifactId={comparison.comparison.leftArtifact?.id}
              rightArtifactId={comparison.comparison.rightArtifact?.id}
              className="h-full"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-5xl mb-4">📄</div>
                <h3 className="text-lg font-medium mb-2">Select a file to compare</h3>
                <p className="text-sm">
                  Choose a file from the list on the left to view differences.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
