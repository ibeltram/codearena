'use client';

/**
 * Artifact Viewer Page
 *
 * Displays artifact contents with file browser, code viewer, and README rendering.
 */

import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { ArtifactViewer } from '@/components/artifact';
import { Button } from '@/components/ui/button';
import { useArtifact, useDownloadArtifact } from '@/hooks/use-artifact';

export default function ArtifactPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const artifactId = params.id as string;
  // Future: use initialFile for deep-linking to specific file
  const initialFile = searchParams.get('file') || '';

  // Use real artifact hook
  const { data: artifact, isLoading, error } = useArtifact(artifactId);
  const downloadMutation = useDownloadArtifact();

  // Log initialFile for development (will be used for file deep-linking)
  useEffect(() => {
    if (initialFile) {
      console.log('Deep-link to file:', initialFile);
    }
  }, [initialFile]);

  // Handle download
  const handleDownload = async () => {
    try {
      const result = await downloadMutation.mutateAsync(artifactId);
      if (result.downloadUrl) {
        // Open download URL in new tab or trigger download
        window.open(result.downloadUrl, '_blank');
      }
    } catch (err) {
      console.error('Failed to download artifact:', err);
    }
  };

  return (
    <MainLayout>
      <div className="h-[calc(100vh-4rem)]">
        {/* Back navigation */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <Link href="/matches">
              <Button variant="ghost" size="sm">
                ← Back to Matches
              </Button>
            </Link>
            {artifact && (
              <span className="text-sm text-gray-500">
                Artifact: {artifact.contentHash.slice(0, 12)}...
              </span>
            )}
          </div>
        </div>

        {/* Artifact viewer */}
        <div className="h-[calc(100%-3rem)]">
          <ArtifactViewer
            artifact={artifact}
            isLoading={isLoading}
            error={error}
            onDownload={handleDownload}
          />
        </div>
      </div>
    </MainLayout>
  );
}
