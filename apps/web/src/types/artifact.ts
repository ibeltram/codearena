/**
 * Artifact Types
 *
 * Types for artifact viewing and file browsing.
 */

export interface ManifestFile {
  path: string;
  size: number;
  hash: string;
  mimeType?: string;
  isText: boolean;
  isBinary: boolean;
}

export interface ArtifactManifest {
  version: number;
  contentHash: string;
  totalSize: number;
  fileCount: number;
  files: ManifestFile[];
  metadata: {
    createdAt: string;
    sourceType: 'zip' | 'github_repo';
    originalFilename?: string;
    clientType?: string;
    clientVersion?: string;
  };
}

export interface Artifact {
  id: string;
  contentHash: string;
  storageKey: string;
  sizeBytes: number;
  createdAt: string;
  secretScanStatus: 'pending' | 'clean' | 'flagged';
  manifestJson: ArtifactManifest;
  isPublicBlocked: boolean;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  hash?: string;
  mimeType?: string;
  isText?: boolean;
  isBinary?: boolean;
  children?: FileTreeNode[];
}

export interface FileContent {
  path: string;
  content: string;
  language: string;
  size: number;
  lineCount: number;
}

// Helper to build file tree from flat manifest
export function buildFileTree(files: ManifestFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  // Sort files to ensure directories are created in order
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/');
    let currentPath = '';
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      let existingNode = nodeMap.get(currentPath);

      if (!existingNode) {
        const newNode: FileTreeNode = {
          name: part,
          path: currentPath,
          isDirectory: !isLast,
          ...(isLast && {
            size: file.size,
            hash: file.hash,
            mimeType: file.mimeType,
            isText: file.isText,
            isBinary: file.isBinary,
          }),
          children: !isLast ? [] : undefined,
        };

        nodeMap.set(currentPath, newNode);
        currentLevel.push(newNode);
        existingNode = newNode;
      }

      if (existingNode.children) {
        currentLevel = existingNode.children;
      }
    }
  }

  // Sort directories first, then files, both alphabetically
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes
      .map((node) => ({
        ...node,
        children: node.children ? sortNodes(node.children) : undefined,
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
  };

  return sortNodes(root);
}

// Get language for syntax highlighting from file path
export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    mjs: 'javascript',
    cjs: 'javascript',

    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',

    // Data formats
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    xml: 'xml',

    // Scripting
    py: 'python',
    rb: 'ruby',
    php: 'php',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'fish',
    ps1: 'powershell',

    // Systems
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    scala: 'scala',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',

    // Database/Query
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',

    // Documentation
    md: 'markdown',
    markdown: 'markdown',
    rst: 'restructuredtext',
    txt: 'plaintext',

    // Config
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    gitignore: 'plaintext',
    env: 'plaintext',
  };

  // Check filename for special cases
  const filename = filePath.split('/').pop()?.toLowerCase() || '';
  if (filename === 'dockerfile') return 'dockerfile';
  if (filename === 'makefile') return 'makefile';
  if (filename.startsWith('.env')) return 'plaintext';

  return languageMap[ext] || 'plaintext';
}

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

// Types for artifact comparison
export type FileDiffStatus = 'unchanged' | 'modified' | 'added' | 'removed';

export interface CompareFile {
  path: string;
  status: FileDiffStatus;
  leftFile?: ManifestFile;
  rightFile?: ManifestFile;
  leftContent?: string;
  rightContent?: string;
}

export interface ArtifactComparison {
  leftArtifact: Artifact;
  rightArtifact: Artifact;
  files: CompareFile[];
  summary: {
    unchanged: number;
    modified: number;
    added: number;
    removed: number;
  };
}

export interface SubmissionScore {
  totalScore: number;
  breakdown: {
    requirementId: string;
    title: string;
    score: number;
    maxScore: number;
    evidence?: string;
  }[];
}

export interface MatchComparison {
  matchId: string;
  leftParticipant: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    seat: 'A' | 'B';
    artifact: Artifact;
    score?: SubmissionScore;
    isWinner?: boolean;
  };
  rightParticipant: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    seat: 'A' | 'B';
    artifact: Artifact;
    score?: SubmissionScore;
    isWinner?: boolean;
  };
  comparison: ArtifactComparison;
}

// Helper function to compare two artifacts and generate diff
export function compareArtifacts(
  leftArtifact: Artifact,
  rightArtifact: Artifact
): ArtifactComparison {
  const leftFiles = new Map(
    leftArtifact.manifestJson.files.map((f) => [f.path, f])
  );
  const rightFiles = new Map(
    rightArtifact.manifestJson.files.map((f) => [f.path, f])
  );

  const allPaths = new Set([...leftFiles.keys(), ...rightFiles.keys()]);
  const files: CompareFile[] = [];
  const summary = { unchanged: 0, modified: 0, added: 0, removed: 0 };

  for (const path of allPaths) {
    const leftFile = leftFiles.get(path);
    const rightFile = rightFiles.get(path);

    let status: FileDiffStatus;
    if (leftFile && rightFile) {
      status = leftFile.hash === rightFile.hash ? 'unchanged' : 'modified';
    } else if (leftFile) {
      status = 'removed';
    } else {
      status = 'added';
    }

    summary[status]++;
    files.push({ path, status, leftFile, rightFile });
  }

  // Sort: modified first, then added, removed, unchanged - all alphabetically within
  files.sort((a, b) => {
    const order = { modified: 0, added: 1, removed: 2, unchanged: 3 };
    if (order[a.status] !== order[b.status]) {
      return order[a.status] - order[b.status];
    }
    return a.path.localeCompare(b.path);
  });

  return {
    leftArtifact,
    rightArtifact,
    files,
    summary,
  };
}

// Get file icon based on type
export function getFileIcon(node: FileTreeNode): string {
  if (node.isDirectory) return '📁';

  const ext = node.name.split('.').pop()?.toLowerCase() || '';

  const iconMap: Record<string, string> = {
    // Documents
    md: '📝',
    txt: '📄',
    pdf: '📕',

    // Code
    js: '🟨',
    jsx: '⚛️',
    ts: '🔷',
    tsx: '⚛️',
    py: '🐍',
    rb: '💎',
    go: '🔵',
    rs: '🦀',
    java: '☕',

    // Web
    html: '🌐',
    css: '🎨',
    scss: '🎨',

    // Data
    json: '📋',
    yaml: '📋',
    yml: '📋',
    xml: '📋',

    // Images
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    svg: '🖼️',

    // Config
    env: '⚙️',
    gitignore: '⚙️',
    dockerignore: '🐳',
    dockerfile: '🐳',
  };

  return iconMap[ext] || '📄';
}
