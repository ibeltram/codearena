'use client';

/**
 * ArtifactViewer Component
 *
 * Main component for viewing artifact contents with file browser.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Artifact,
  buildFileTree,
  formatFileSize,
} from '@/types/artifact';
import { getMockFileContent } from '@/hooks/use-artifact';
import { FileTree } from './file-tree';
import { CodeViewer } from './code-viewer';
import { MarkdownViewer } from './markdown-viewer';
import { ImageViewer } from './image-viewer';
import { Breadcrumb } from './breadcrumb';

/**
 * Image file extensions that can be previewed
 */
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp',
]);

/**
 * Check if a file path is an image
 */
function isImageFile(path: string): boolean {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

interface ArtifactViewerProps {
  artifact: Artifact | null | undefined;
  isLoading?: boolean;
  error?: Error | null;
  onDownload?: () => void;
  className?: string;
}

export function ArtifactViewer({
  artifact,
  isLoading,
  error,
  onDownload,
  className,
}: ArtifactViewerProps) {
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Build file tree from manifest
  const fileTree = useMemo(() => {
    if (!artifact?.manifestJson?.files) return [];
    return buildFileTree(artifact.manifestJson.files);
  }, [artifact?.manifestJson?.files]);

  // Get file content (mock for now)
  const fileContent = useMemo(() => {
    if (!selectedPath) return null;
    return getMockFileContent(selectedPath);
  }, [selectedPath]);

  // Handle file selection
  const handleSelectFile = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  // Handle breadcrumb navigation
  const handleBreadcrumbNavigate = useCallback((_path: string) => {
    // Navigate to directory - clear selection or select first file
    setSelectedPath('');
  }, []);

  // Copy shareable link
  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/artifacts/${artifact?.id}${selectedPath ? `?file=${encodeURIComponent(selectedPath)}` : ''}`;
    navigator.clipboard.writeText(url);
    // Would show toast notification here
  }, [artifact?.id, selectedPath]);

  // Determine if selected file is markdown
  const isMarkdown = selectedPath.toLowerCase().endsWith('.md');

  // Determine if file is binary
  const selectedFile = useMemo(() => {
    if (!artifact?.manifestJson?.files || !selectedPath) return null;
    return artifact.manifestJson.files.find((f) => f.path === selectedPath);
  }, [artifact?.manifestJson?.files, selectedPath]);

  const isBinary = selectedFile?.isBinary;

  if (isLoading) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="flex items-center justify-between p-4 border-b">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="flex-1 flex">
          <div className="w-64 border-r p-4">
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-4 w-5/6 mb-2" />
          </div>
          <div className="flex-1 p-4">
            <Skeleton className="h-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <Card className="p-6 max-w-md">
          <div className="text-center">
            <div className="text-4xl mb-4">❌</div>
            <h3 className="text-lg font-semibold text-red-600 mb-2">
              Error Loading Artifact
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {error.message || 'Failed to load artifact. Please try again.'}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <Card className="p-6 max-w-md">
          <div className="text-center">
            <div className="text-4xl mb-4">📦</div>
            <h3 className="text-lg font-semibold mb-2">No Artifact Selected</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Select an artifact to view its contents.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-gray-950', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-4">
          {/* Artifact info */}
          <div className="flex items-center gap-2">
            <span className="text-2xl">📦</span>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">
                Artifact
              </div>
              <div className="text-xs text-gray-500">
                {artifact.manifestJson.fileCount} files • {formatFileSize(artifact.sizeBytes)}
              </div>
            </div>
          </div>

          {/* Security status */}
          <Badge
            variant={artifact.secretScanStatus === 'flagged' ? 'destructive' : 'secondary'}
          >
            {artifact.secretScanStatus === 'flagged' ? '⚠️ Secrets Detected' : '✓ Clean'}
          </Badge>

          {artifact.isPublicBlocked && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
              🔒 Private
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyLink}>
            📋 Copy Link
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload}>
            ⬇️ Download
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File tree sidebar */}
        <div
          className={cn(
            'border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 overflow-y-auto transition-all',
            sidebarCollapsed ? 'w-10' : 'w-64'
          )}
        >
          {!sidebarCollapsed && (
            <>
              {/* Sidebar header */}
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Files
                </span>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Collapse sidebar"
                >
                  ◀
                </button>
              </div>

              {/* File tree */}
              <FileTree
                nodes={fileTree}
                selectedPath={selectedPath}
                onSelectFile={handleSelectFile}
                className="py-2"
              />
            </>
          )}

          {sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="w-full h-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Expand sidebar"
            >
              ▶
            </button>
          )}
        </div>

        {/* File content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Breadcrumb */}
          {selectedPath && (
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30">
              <Breadcrumb
                path={selectedPath}
                onNavigate={handleBreadcrumbNavigate}
              />
            </div>
          )}

          {/* Content viewer */}
          <div className="flex-1 overflow-auto">
            {selectedPath && isImageFile(selectedPath) ? (
              <ImageViewer
                path={selectedPath}
                artifactId={artifact.id}
                mimeType={selectedFile?.mimeType}
                size={selectedFile?.size}
              />
            ) : isBinary ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center p-8">
                  <div className="text-4xl mb-4">🔒</div>
                  <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Binary File
                  </h3>
                  <p className="text-gray-500 text-sm mb-4">
                    This file cannot be previewed. Download the artifact to view it.
                  </p>
                  <div className="text-xs text-gray-400">
                    {selectedFile?.mimeType || 'application/octet-stream'} • {formatFileSize(selectedFile?.size || 0)}
                  </div>
                </div>
              </div>
            ) : isMarkdown && fileContent ? (
              <MarkdownViewer content={fileContent.content} />
            ) : (
              <CodeViewer content={fileContent} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ArtifactViewer;
