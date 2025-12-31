'use client';

/**
 * Artifact Viewer Page
 *
 * Displays artifact contents with file browser, code viewer, and README rendering.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { ArtifactViewer } from '@/components/artifact';
import { Button } from '@/components/ui/button';
// Note: useArtifact hook available for production use
// import { useArtifact } from '@/hooks/use-artifact';
import type { Artifact, ManifestFile } from '@/types/artifact';

// Mock artifact for development
const mockArtifact: Artifact = {
  id: 'mock-artifact-id',
  contentHash: 'abc123def456',
  storageKey: 'artifacts/ab/abc123def456',
  sizeBytes: 125430,
  createdAt: new Date().toISOString(),
  secretScanStatus: 'clean',
  isPublicBlocked: false,
  manifestJson: {
    version: 1,
    contentHash: 'abc123def456',
    totalSize: 125430,
    fileCount: 15,
    files: [
      { path: 'README.md', size: 1024, hash: 'hash1', isText: true, isBinary: false, mimeType: 'text/markdown' },
      { path: 'package.json', size: 512, hash: 'hash2', isText: true, isBinary: false, mimeType: 'application/json' },
      { path: 'tsconfig.json', size: 256, hash: 'hash3', isText: true, isBinary: false, mimeType: 'application/json' },
      { path: 'src/index.ts', size: 2048, hash: 'hash4', isText: true, isBinary: false, mimeType: 'application/typescript' },
      { path: 'src/App.tsx', size: 3072, hash: 'hash5', isText: true, isBinary: false, mimeType: 'text/tsx' },
      { path: 'src/components/Button.tsx', size: 1536, hash: 'hash6', isText: true, isBinary: false, mimeType: 'text/tsx' },
      { path: 'src/components/Card.tsx', size: 1280, hash: 'hash7', isText: true, isBinary: false, mimeType: 'text/tsx' },
      { path: 'src/components/index.ts', size: 256, hash: 'hash8', isText: true, isBinary: false, mimeType: 'application/typescript' },
      { path: 'src/hooks/useAuth.ts', size: 1792, hash: 'hash9', isText: true, isBinary: false, mimeType: 'application/typescript' },
      { path: 'src/hooks/index.ts', size: 128, hash: 'hash10', isText: true, isBinary: false, mimeType: 'application/typescript' },
      { path: 'src/styles/globals.css', size: 2560, hash: 'hash11', isText: true, isBinary: false, mimeType: 'text/css' },
      { path: 'src/lib/utils.ts', size: 1024, hash: 'hash12', isText: true, isBinary: false, mimeType: 'application/typescript' },
      { path: 'public/favicon.ico', size: 4096, hash: 'hash13', isText: false, isBinary: true, mimeType: 'image/x-icon' },
      { path: 'public/logo.png', size: 8192, hash: 'hash14', isText: false, isBinary: true, mimeType: 'image/png' },
      { path: '.gitignore', size: 128, hash: 'hash15', isText: true, isBinary: false, mimeType: 'text/plain' },
    ] as ManifestFile[],
    metadata: {
      createdAt: new Date().toISOString(),
      sourceType: 'zip',
      originalFilename: 'submission.zip',
      clientType: 'vscode-extension',
      clientVersion: '1.0.0',
    },
  },
};

export default function ArtifactPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const artifactId = params.id as string;
  // Future: use initialFile for deep-linking to specific file
  const initialFile = searchParams.get('file') || '';

  // In production, use the real hook
  // const { data: artifact, isLoading, error } = useArtifact(artifactId);

  // For development, use mock data
  const [isLoading, setIsLoading] = useState(true);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Log initialFile for development (will be used for file deep-linking)
  useEffect(() => {
    if (initialFile) {
      console.log('Deep-link to file:', initialFile);
    }
  }, [initialFile]);

  useEffect(() => {
    // Simulate loading (in production, this would be handled by useArtifact hook)
    setIsLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      // Mock: always succeed with mock data
      // In production, errors would come from the useArtifact hook
      setArtifact(mockArtifact);
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [artifactId]);

  // Handle download
  const handleDownload = () => {
    // In production, trigger download via API
    console.log('Downloading artifact:', artifactId);
    alert('Download would start here. In production, this would download the artifact zip.');
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
