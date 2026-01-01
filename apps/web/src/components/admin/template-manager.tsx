'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  GitBranch,
  File,
  Folder,
  FolderOpen,
  X,
  Download,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileTreeNode[];
  size?: number;
}

interface TemplateManagerProps {
  templateRef: string;
  onChange: (templateRef: string) => void;
  onUpload?: (file: File) => Promise<string>; // Returns the uploaded URL
}

type TemplateSource = 'none' | 'upload' | 'git';

// Simulate file tree from zip (in production, this would come from the server)
function simulateFileTreeFromFiles(files: FileList): FileTreeNode[] {
  const root: Map<string, FileTreeNode> = new Map();

  Array.from(files).forEach((file) => {
    const parts = file.webkitRelativePath?.split('/') || [file.name];
    let currentPath = '';

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!root.has(currentPath)) {
        const node: FileTreeNode = {
          name: part,
          type: isLast ? 'file' : 'directory',
          path: currentPath,
          size: isLast ? file.size : undefined,
          children: isLast ? undefined : [],
        };
        root.set(currentPath, node);

        if (parentPath && root.has(parentPath)) {
          const parent = root.get(parentPath)!;
          if (parent.children) {
            parent.children.push(node);
          }
        }
      }
    });
  });

  // Return only top-level nodes
  return Array.from(root.values()).filter(
    (node) => !node.path.includes('/')
  );
}

// Create sample file tree for demo
function createSampleFileTree(): FileTreeNode[] {
  return [
    {
      name: 'src',
      type: 'directory',
      path: 'src',
      children: [
        { name: 'index.ts', type: 'file', path: 'src/index.ts', size: 1024 },
        { name: 'utils.ts', type: 'file', path: 'src/utils.ts', size: 512 },
        {
          name: 'components',
          type: 'directory',
          path: 'src/components',
          children: [
            { name: 'App.tsx', type: 'file', path: 'src/components/App.tsx', size: 2048 },
          ],
        },
      ],
    },
    { name: 'package.json', type: 'file', path: 'package.json', size: 856 },
    { name: 'tsconfig.json', type: 'file', path: 'tsconfig.json', size: 428 },
    { name: 'README.md', type: 'file', path: 'README.md', size: 1536 },
  ];
}

// File tree component
function FileTreeView({ nodes, level = 0 }: { nodes: FileTreeNode[]; level?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <div key={node.path}>
          <div
            className={`flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm ${
              level > 0 ? 'ml-4' : ''
            }`}
            onClick={() => node.type === 'directory' && toggleExpand(node.path)}
          >
            {node.type === 'directory' ? (
              expanded.has(node.path) ? (
                <FolderOpen className="h-4 w-4 text-blue-500" />
              ) : (
                <Folder className="h-4 w-4 text-blue-500" />
              )
            ) : (
              <File className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={node.type === 'directory' ? 'font-medium' : ''}>
              {node.name}
            </span>
            {node.size && (
              <span className="text-xs text-muted-foreground ml-auto">
                {formatSize(node.size)}
              </span>
            )}
          </div>
          {node.type === 'directory' && expanded.has(node.path) && node.children && (
            <FileTreeView nodes={node.children} level={level + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

// Git URL validation
function isValidGitUrl(url: string): boolean {
  const gitPatterns = [
    /^https?:\/\/github\.com\/[\w-]+\/[\w.-]+(?:\.git)?$/,
    /^https?:\/\/gitlab\.com\/[\w-]+\/[\w.-]+(?:\.git)?$/,
    /^https?:\/\/bitbucket\.org\/[\w-]+\/[\w.-]+(?:\.git)?$/,
    /^git@github\.com:[\w-]+\/[\w.-]+\.git$/,
    /^git@gitlab\.com:[\w-]+\/[\w.-]+\.git$/,
  ];
  return gitPatterns.some((pattern) => pattern.test(url));
}

export function TemplateManager({
  templateRef,
  onChange,
  onUpload,
}: TemplateManagerProps) {
  const [source, setSource] = useState<TemplateSource>(
    templateRef
      ? templateRef.startsWith('http') || templateRef.startsWith('git@')
        ? 'git'
        : 'upload'
      : 'none'
  );
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [gitUrl, setGitUrl] = useState(
    source === 'git' ? templateRef : ''
  );
  const [gitUrlValid, setGitUrlValid] = useState<boolean | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.zip')) {
        await handleFileUpload(file);
      }
    }
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setSource('upload');
    setIsUploading(true);

    // Create a demo file tree
    setFileTree(createSampleFileTree());

    try {
      if (onUpload) {
        const url = await onUpload(file);
        onChange(url);
      } else {
        // Demo mode - just set a placeholder URL
        onChange(`s3://templates/${file.name}`);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGitUrlChange = (url: string) => {
    setGitUrl(url);
    if (url) {
      const valid = isValidGitUrl(url);
      setGitUrlValid(valid);
      if (valid) {
        onChange(url);
        setSource('git');
        // For demo, show a sample file tree
        setFileTree(createSampleFileTree());
      }
    } else {
      setGitUrlValid(null);
      if (source === 'git') {
        onChange('');
      }
    }
  };

  const clearTemplate = () => {
    setSource('none');
    setUploadedFile(null);
    setFileTree([]);
    setGitUrl('');
    setGitUrlValid(null);
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Challenge Template
          </CardTitle>
          {source !== 'none' && (
            <Badge variant={source === 'upload' ? 'default' : 'secondary'}>
              {source === 'upload' ? 'Zip Upload' : 'Git Repository'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source selection or current template */}
        {source === 'none' ? (
          <div className="grid grid-cols-2 gap-4">
            {/* Zip Upload Zone */}
            <div
              className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium">Upload Zip Template</p>
              <p className="text-sm text-muted-foreground mt-1">
                Drag & drop or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-2">.zip files only</p>
            </div>

            {/* Git Repository Input */}
            <div className="rounded-lg border p-6">
              <GitBranch className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium text-center">Git Repository</p>
              <div className="mt-3 space-y-2">
                <Input
                  placeholder="https://github.com/org/repo"
                  value={gitUrl}
                  onChange={(e) => handleGitUrlChange(e.target.value)}
                  className={
                    gitUrlValid === false
                      ? 'border-destructive'
                      : gitUrlValid === true
                      ? 'border-green-500'
                      : ''
                  }
                />
                {gitUrlValid === false && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Invalid Git URL format
                  </p>
                )}
                {gitUrlValid === true && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Valid Git URL
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current template info */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                {source === 'upload' ? (
                  <>
                    <div className="p-2 rounded bg-primary/10">
                      <File className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{uploadedFile?.name || 'Uploaded template'}</p>
                      <p className="text-xs text-muted-foreground">
                        {uploadedFile
                          ? `${(uploadedFile.size / 1024).toFixed(1)} KB`
                          : templateRef}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-2 rounded bg-secondary">
                      <GitBranch className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">Git Repository</p>
                      <p className="text-xs text-muted-foreground truncate max-w-md">
                        {gitUrl}
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                {source === 'git' && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={gitUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                <Button variant="ghost" size="sm">
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={clearTemplate}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* File tree preview */}
            {fileTree.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm">File Preview</Label>
                <div className="rounded-lg border bg-muted/30 p-3 max-h-60 overflow-auto">
                  <FileTreeView nodes={fileTree} />
                </div>
              </div>
            )}

            {/* Change template button */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Different Zip
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleFileSelect}
              />
              {source === 'upload' && (
                <div className="flex-1">
                  <Input
                    placeholder="Or enter Git repo URL..."
                    value={gitUrl}
                    onChange={(e) => handleGitUrlChange(e.target.value)}
                    className="h-9"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          The template will be provided to participants as a starting point for the challenge.
          They can fork the repo or download the zip to begin.
        </p>
      </CardContent>
    </Card>
  );
}
