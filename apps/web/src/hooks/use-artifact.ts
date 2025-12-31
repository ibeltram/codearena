/**
 * Artifact Hooks
 *
 * React Query hooks for fetching artifact data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Artifact, FileContent } from '@/types/artifact';

// Fetch single artifact by ID
export function useArtifact(artifactId: string | undefined) {
  return useQuery({
    queryKey: ['artifact', artifactId],
    queryFn: async () => {
      if (!artifactId) throw new Error('Artifact ID required');
      const response = await api.get(`/artifacts/${artifactId}`);
      return response as Artifact;
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
