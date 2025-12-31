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
