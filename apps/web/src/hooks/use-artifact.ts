/**
 * Artifact Hooks
 *
 * React Query hooks for fetching artifact data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Artifact,
  FileContent,
  MatchComparison,
  CompareFile,
} from '@/types/artifact';
import { compareArtifacts } from '@/types/artifact';

// Helper to generate mock artifact for development
export function getMockArtifact(artifactId: string): Artifact {
  return {
    id: artifactId,
    contentHash: 'sha256-mock-' + artifactId.slice(0, 8),
    storageKey: 's3://artifacts/mock/' + artifactId,
    sizeBytes: 45678,
    createdAt: new Date().toISOString(),
    secretScanStatus: 'clean',
    isPublicBlocked: false,
    manifestJson: {
      version: 1,
      contentHash: 'sha256-mock-' + artifactId.slice(0, 8),
      totalSize: 45678,
      fileCount: 8,
      files: [
        { path: 'src/index.ts', size: 1200, hash: 'hash1', isText: true, isBinary: false },
        { path: 'src/components/App.tsx', size: 2400, hash: 'hash2', isText: true, isBinary: false },
        { path: 'src/components/Header.tsx', size: 1800, hash: 'hash3', isText: true, isBinary: false },
        { path: 'src/utils/helpers.ts', size: 900, hash: 'hash4', isText: true, isBinary: false },
        { path: 'package.json', size: 450, hash: 'hash5', isText: true, isBinary: false },
        { path: 'README.md', size: 800, hash: 'hash6', isText: true, isBinary: false },
        { path: 'tsconfig.json', size: 320, hash: 'hash7', isText: true, isBinary: false },
        { path: 'assets/logo.png', size: 15000, hash: 'hash8', isText: false, isBinary: true, mimeType: 'image/png' },
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        sourceType: 'zip',
        originalFilename: 'submission.zip',
        clientType: 'extension',
        clientVersion: '1.0.0',
      },
    },
  };
}

// Fetch single artifact by ID
export function useArtifact(artifactId: string | undefined) {
  return useQuery({
    queryKey: ['artifact', artifactId],
    queryFn: async () => {
      if (!artifactId) throw new Error('Artifact ID required');
      try {
        const response = await api.get(`/artifacts/${artifactId}`);
        return response as Artifact;
      } catch (error) {
        // Fall back to mock data in development if API not available
        console.warn('Artifact API not available, using mock data:', error);
        return getMockArtifact(artifactId);
      }
    },
    enabled: !!artifactId,
    staleTime: 5 * 60 * 1000, // 5 minutes - artifacts are immutable
  });
}

// Fetch file content from artifact
export function useArtifactFile(
  artifactId: string | undefined,
  filePath: string | undefined
) {
  return useQuery({
    queryKey: ['artifact', artifactId, 'file', filePath],
    queryFn: async () => {
      if (!artifactId || !filePath) throw new Error('Artifact ID and file path required');

      // In production, this would fetch from the API
      // For now, return mock content based on file path
      const response = await api.get(
        `/artifacts/${artifactId}/files/${encodeURIComponent(filePath)}`
      );
      return response as FileContent;
    },
    enabled: !!artifactId && !!filePath,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// Download artifact as zip
export function useDownloadArtifact() {
  return useMutation({
    mutationFn: async (artifactId: string) => {
      const response = await api.get<{ downloadUrl: string }>(`/artifacts/${artifactId}/download`);
      return response;
    },
  });
}

// Trigger artifact scan (admin)
export function useScanArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (artifactId: string) => {
      const response = await api.post(`/artifacts/${artifactId}/scan`);
      return response;
    },
    onSuccess: (_, artifactId) => {
      queryClient.invalidateQueries({ queryKey: ['artifact', artifactId] });
    },
  });
}

// Helper to generate mock file content for development
export function getMockFileContent(filePath: string): FileContent {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const filename = filePath.split('/').pop() || filePath;

  let content = '';
  let language = 'plaintext';

  switch (ext) {
    case 'ts':
    case 'tsx':
      language = 'typescript';
      content = `// ${filename}
import React from 'react';

interface Props {
  title: string;
  children: React.ReactNode;
}

export function Component({ title, children }: Props) {
  return (
    <div className="container">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export default Component;
`;
      break;

    case 'js':
    case 'jsx':
      language = 'javascript';
      content = `// ${filename}
import React from 'react';

export function Component({ title, children }) {
  return (
    <div className="container">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export default Component;
`;
      break;

    case 'json':
      language = 'json';
      content = `{
  "name": "${filename.replace('.json', '')}",
  "version": "1.0.0",
  "description": "Sample configuration file",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "build": "tsc",
    "test": "jest"
  }
}
`;
      break;

    case 'md':
      language = 'markdown';
      content = `# ${filename.replace('.md', '')}

This is a sample README file.

## Getting Started

1. Install dependencies: \`npm install\`
2. Run the development server: \`npm run dev\`
3. Open [http://localhost:3000](http://localhost:3000)

## Features

- Feature one
- Feature two
- Feature three

## License

MIT
`;
      break;

    case 'css':
      language = 'css';
      content = `/* ${filename} */

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid #e5e7eb;
}

.button {
  background-color: #3b82f6;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 500;
  transition: background-color 0.2s;
}

.button:hover {
  background-color: #2563eb;
}
`;
      break;

    case 'html':
      language = 'html';
      content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="root"></div>
  <script src="main.js"></script>
</body>
</html>
`;
      break;

    default:
      content = `// Contents of ${filePath}\n// This is a preview of the file.`;
  }

  const lines = content.split('\n');

  return {
    path: filePath,
    content,
    language,
    size: content.length,
    lineCount: lines.length,
  };
}

// Fetch match comparison data
export function useMatchComparison(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match-comparison', matchId],
    queryFn: async () => {
      if (!matchId) throw new Error('Match ID required');

      try {
        // Fetch from real API endpoint
        const response = await api.get(`/matches/${matchId}/compare`);
        return response as MatchComparison;
      } catch (error) {
        // Fall back to mock data in development if API not available
        console.warn('Match comparison API not available, using mock data:', error);
        return getMockMatchComparison(matchId);
      }
    },
    enabled: !!matchId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Helper to generate mock match comparison for development
export function getMockMatchComparison(matchId: string): MatchComparison {
  const leftArtifact: Artifact = {
    id: 'artifact-left-' + matchId,
    contentHash: 'sha256-left-abc123',
    storageKey: 's3://artifacts/left',
    sizeBytes: 45678,
    createdAt: new Date().toISOString(),
    secretScanStatus: 'clean',
    isPublicBlocked: false,
    manifestJson: {
      version: 1,
      contentHash: 'sha256-left-abc123',
      totalSize: 45678,
      fileCount: 8,
      files: [
        { path: 'src/index.ts', size: 1200, hash: 'hash1', isText: true, isBinary: false },
        { path: 'src/components/App.tsx', size: 2400, hash: 'hash2', isText: true, isBinary: false },
        { path: 'src/components/Header.tsx', size: 1800, hash: 'hash3', isText: true, isBinary: false },
        { path: 'src/utils/helpers.ts', size: 900, hash: 'hash4', isText: true, isBinary: false },
        { path: 'package.json', size: 450, hash: 'hash5', isText: true, isBinary: false },
        { path: 'README.md', size: 800, hash: 'hash6', isText: true, isBinary: false },
        { path: 'tsconfig.json', size: 320, hash: 'hash7', isText: true, isBinary: false },
        { path: '.gitignore', size: 120, hash: 'hash8', isText: true, isBinary: false },
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        sourceType: 'zip',
        originalFilename: 'submission-left.zip',
        clientType: 'extension',
        clientVersion: '1.0.0',
      },
    },
  };

  const rightArtifact: Artifact = {
    id: 'artifact-right-' + matchId,
    contentHash: 'sha256-right-def456',
    storageKey: 's3://artifacts/right',
    sizeBytes: 52340,
    createdAt: new Date().toISOString(),
    secretScanStatus: 'clean',
    isPublicBlocked: false,
    manifestJson: {
      version: 1,
      contentHash: 'sha256-right-def456',
      totalSize: 52340,
      fileCount: 9,
      files: [
        { path: 'src/index.ts', size: 1250, hash: 'hash1-mod', isText: true, isBinary: false }, // modified
        { path: 'src/components/App.tsx', size: 2400, hash: 'hash2', isText: true, isBinary: false }, // same
        { path: 'src/components/Header.tsx', size: 2100, hash: 'hash3-mod', isText: true, isBinary: false }, // modified
        { path: 'src/components/Footer.tsx', size: 1500, hash: 'hash-new', isText: true, isBinary: false }, // added
        { path: 'src/utils/helpers.ts', size: 900, hash: 'hash4', isText: true, isBinary: false }, // same
        { path: 'package.json', size: 480, hash: 'hash5-mod', isText: true, isBinary: false }, // modified
        { path: 'README.md', size: 800, hash: 'hash6', isText: true, isBinary: false }, // same
        { path: 'tsconfig.json', size: 320, hash: 'hash7', isText: true, isBinary: false }, // same
        // .gitignore removed
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        sourceType: 'zip',
        originalFilename: 'submission-right.zip',
        clientType: 'extension',
        clientVersion: '1.0.0',
      },
    },
  };

  const comparison = compareArtifacts(leftArtifact, rightArtifact);

  return {
    matchId,
    leftParticipant: {
      userId: 'user-1',
      displayName: 'alice_dev',
      avatarUrl: null,
      seat: 'A' as const,
      artifact: leftArtifact,
      score: {
        totalScore: 78,
        breakdown: [
          { requirementId: 'R1', title: 'Dashboard Layout', score: 22, maxScore: 25 },
          { requirementId: 'R2', title: 'Data Visualization', score: 18, maxScore: 25 },
          { requirementId: 'R3', title: 'Filtering & State', score: 20, maxScore: 25 },
          { requirementId: 'R4', title: 'Quality', score: 18, maxScore: 25 },
        ],
      },
      isWinner: false,
    },
    rightParticipant: {
      userId: 'user-2',
      displayName: 'bob_coder',
      avatarUrl: null,
      seat: 'B' as const,
      artifact: rightArtifact,
      score: {
        totalScore: 85,
        breakdown: [
          { requirementId: 'R1', title: 'Dashboard Layout', score: 24, maxScore: 25 },
          { requirementId: 'R2', title: 'Data Visualization', score: 21, maxScore: 25 },
          { requirementId: 'R3', title: 'Filtering & State', score: 22, maxScore: 25 },
          { requirementId: 'R4', title: 'Quality', score: 18, maxScore: 25 },
        ],
      },
      isWinner: true,
    },
    comparison,
  };
}
