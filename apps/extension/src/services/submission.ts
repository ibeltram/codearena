import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ExtensionConfig } from '../types';

/**
 * File entry for submission preview
 */
export interface FileEntry {
  relativePath: string;
  absolutePath: string;
  size: number;
  isExcluded: boolean;
  excludeReason?: string;
}

/**
 * Submission package summary
 */
export interface SubmissionSummary {
  files: FileEntry[];
  totalSize: number;
  includedSize: number;
  excludedCount: number;
  contentHash: string;
  workspacePath: string;
}

/**
 * Upload progress info
 */
export interface UploadProgress {
  phase: 'preparing' | 'hashing' | 'uploading' | 'finalizing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  bytesUploaded?: number;
  totalBytes?: number;
}

/**
 * Default exclusion patterns
 */
const DEFAULT_EXCLUSIONS = [
  'node_modules/**',
  '.git/**',
  '.svn/**',
  '.hg/**',
  'dist/**',
  'build/**',
  'out/**',
  '.env*',
  '*.log',
  '*.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.DS_Store',
  'Thumbs.db',
  '.vscode/**',
  '.idea/**',
  '*.swp',
  '*.swo',
  '*~',
  '.codearenaignore',
];

/**
 * Dangerous file patterns that should always be excluded
 */
const DANGEROUS_PATTERNS = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'credentials.json',
  'service-account*.json',
  '*_rsa',
  '*_dsa',
  '*_ed25519',
  '*_ecdsa',
  'id_rsa*',
  'id_dsa*',
  '.npmrc',
  '.yarnrc',
  '.netrc',
  'aws-credentials',
  '.aws/credentials',
];

/**
 * Service for handling submission packaging and upload
 */
export class SubmissionService {
  private _onProgressUpdate = new vscode.EventEmitter<UploadProgress>();
  readonly onProgressUpdate = this._onProgressUpdate.event;

  private getAccessToken: () => Promise<string | null>;
  private getConfig: () => ExtensionConfig;

  constructor(
    getAccessToken: () => Promise<string | null>,
    getConfig: () => ExtensionConfig
  ) {
    this.getAccessToken = getAccessToken;
    this.getConfig = getConfig;
  }

  /**
   * Scan workspace and generate submission summary
   */
  async scanWorkspace(workspacePath: string): Promise<SubmissionSummary> {
    this._onProgressUpdate.fire({
      phase: 'preparing',
      progress: 0,
      message: 'Scanning workspace...',
    });

    const config = this.getConfig();
    const exclusionPatterns = this.loadExclusionPatterns(workspacePath, config.excludePatterns);

    const files: FileEntry[] = [];
    let totalSize = 0;
    let includedSize = 0;
    let excludedCount = 0;

    // Recursively scan the directory
    await this.scanDirectory(workspacePath, '', files, exclusionPatterns);

    // Calculate sizes
    for (const file of files) {
      totalSize += file.size;
      if (file.isExcluded) {
        excludedCount++;
      } else {
        includedSize += file.size;
      }
    }

    // Check max size
    const maxSizeBytes = config.maxSubmissionSizeMB * 1024 * 1024;
    if (includedSize > maxSizeBytes) {
      throw new Error(
        `Submission size (${this.formatBytes(includedSize)}) exceeds maximum allowed (${config.maxSubmissionSizeMB}MB)`
      );
    }

    this._onProgressUpdate.fire({
      phase: 'hashing',
      progress: 50,
      message: 'Computing content hash...',
    });

    // Compute content hash of included files
    const contentHash = await this.computeContentHash(files.filter((f) => !f.isExcluded));

    this._onProgressUpdate.fire({
      phase: 'preparing',
      progress: 100,
      message: 'Ready to submit',
    });

    return {
      files,
      totalSize,
      includedSize,
      excludedCount,
      contentHash,
      workspacePath,
    };
  }

  /**
   * Recursively scan a directory
   */
  private async scanDirectory(
    basePath: string,
    relativePath: string,
    files: FileEntry[],
    exclusionPatterns: string[]
  ): Promise<void> {
    const fullPath = path.join(basePath, relativePath);

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
    } catch (error) {
      console.error(`Failed to read directory ${fullPath}:`, error);
      return;
    }

    for (const entry of entries) {
      const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      const entryFullPath = path.join(basePath, entryRelativePath);

      if (entry.isDirectory()) {
        // Check if directory should be excluded
        const dirPattern = entryRelativePath + '/';
        if (this.isExcluded(dirPattern, exclusionPatterns)) {
          // Don't descend into excluded directories
          continue;
        }
        await this.scanDirectory(basePath, entryRelativePath, files, exclusionPatterns);
      } else if (entry.isFile()) {
        try {
          const stats = await fs.promises.stat(entryFullPath);
          const { isExcluded, reason } = this.checkExclusion(entryRelativePath, exclusionPatterns);

          files.push({
            relativePath: entryRelativePath,
            absolutePath: entryFullPath,
            size: stats.size,
            isExcluded,
            excludeReason: reason,
          });
        } catch (error) {
          console.error(`Failed to stat file ${entryFullPath}:`, error);
        }
      }
    }
  }

  /**
   * Load exclusion patterns from config and .codearenaignore
   */
  private loadExclusionPatterns(workspacePath: string, configPatterns: string[]): string[] {
    const patterns = [...DEFAULT_EXCLUSIONS, ...configPatterns];

    // Always add dangerous patterns
    patterns.push(...DANGEROUS_PATTERNS);

    // Load .codearenaignore if it exists
    const ignoreFilePath = path.join(workspacePath, '.codearenaignore');
    try {
      if (fs.existsSync(ignoreFilePath)) {
        const content = fs.readFileSync(ignoreFilePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            patterns.push(trimmed);
          }
        }
      }
    } catch (error) {
      console.error('Failed to read .codearenaignore:', error);
    }

    // Remove duplicates
    return [...new Set(patterns)];
  }

  /**
   * Check if a file path matches exclusion patterns
   */
  private checkExclusion(
    filePath: string,
    patterns: string[]
  ): { isExcluded: boolean; reason?: string } {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');

    for (const pattern of patterns) {
      if (this.matchesPattern(normalizedPath, pattern)) {
        // Determine if it's a dangerous file
        const isDangerous = DANGEROUS_PATTERNS.some((p) => this.matchesPattern(normalizedPath, p));
        return {
          isExcluded: true,
          reason: isDangerous ? 'Potentially sensitive file' : `Matches pattern: ${pattern}`,
        };
      }
    }

    return { isExcluded: false };
  }

  /**
   * Simple pattern matching (glob-style)
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Normalize both
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Convert glob pattern to regex
    const regexPattern = normalizedPattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{DOUBLE_STAR}}/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');

    // Check full path match
    if (regex.test(normalizedPath)) {
      return true;
    }

    // Check filename-only match
    const filename = path.basename(normalizedPath);
    if (regex.test(filename)) {
      return true;
    }

    // Check if any parent directory matches
    const parts = normalizedPath.split('/');
    for (let i = 0; i < parts.length; i++) {
      const partialPath = parts.slice(0, i + 1).join('/');
      if (regex.test(partialPath) || regex.test(partialPath + '/')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a path is excluded
   */
  private isExcluded(filePath: string, patterns: string[]): boolean {
    return this.checkExclusion(filePath, patterns).isExcluded;
  }

  /**
   * Compute SHA-256 hash of all included files
   */
  private async computeContentHash(files: FileEntry[]): Promise<string> {
    const hash = crypto.createHash('sha256');

    // Sort files for deterministic hash
    const sortedFiles = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    for (const file of sortedFiles) {
      // Include file path in hash
      hash.update(file.relativePath);

      // Include file contents
      try {
        const content = await fs.promises.readFile(file.absolutePath);
        hash.update(content);
      } catch (error) {
        console.error(`Failed to read file for hashing: ${file.absolutePath}`, error);
      }
    }

    return hash.digest('hex');
  }

  /**
   * Create zip buffer from files
   */
  async createZipBuffer(summary: SubmissionSummary): Promise<Buffer> {
    // We'll create a simple tar-like format or use the API's multipart upload
    // For now, we'll just concatenate files with a manifest
    // In production, you'd use a proper zip library like 'archiver' or 'jszip'

    const includedFiles = summary.files.filter((f) => !f.isExcluded);
    const chunks: Buffer[] = [];

    // Create manifest
    const manifest = {
      version: 1,
      contentHash: summary.contentHash,
      files: includedFiles.map((f) => ({
        path: f.relativePath,
        size: f.size,
      })),
    };

    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
    chunks.push(manifestBuffer);

    // Add file contents
    for (const file of includedFiles) {
      const content = await fs.promises.readFile(file.absolutePath);
      chunks.push(content);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Upload submission to the API
   */
  async uploadSubmission(matchId: string, summary: SubmissionSummary): Promise<string | null> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const config = this.getConfig();
    const includedFiles = summary.files.filter((f) => !f.isExcluded);

    this._onProgressUpdate.fire({
      phase: 'uploading',
      progress: 0,
      message: 'Initializing upload...',
      bytesUploaded: 0,
      totalBytes: summary.includedSize,
    });

    try {
      // Initialize upload
      const initResponse = await fetch(`${config.apiUrl}/api/matches/${matchId}/submissions/init`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contentHash: summary.contentHash,
          totalSize: summary.includedSize,
          fileCount: includedFiles.length,
          method: 'zip',
        }),
      });

      if (!initResponse.ok) {
        const error = (await initResponse.json().catch(() => ({ message: 'Upload init failed' }))) as { message?: string };
        throw new Error(error.message || `HTTP ${initResponse.status}`);
      }

      const initData = (await initResponse.json()) as { uploadId: string };
      const uploadId = initData.uploadId;

      // For simplicity, we'll upload files as a single multipart request
      // In production, you'd implement chunked uploads with progress
      this._onProgressUpdate.fire({
        phase: 'uploading',
        progress: 30,
        message: 'Uploading files...',
        bytesUploaded: 0,
        totalBytes: summary.includedSize,
      });

      // Create FormData with files
      const formData = new FormData();
      formData.append('uploadId', uploadId);
      formData.append('contentHash', summary.contentHash);

      // Create a combined buffer for upload
      // In a real implementation, you'd stream this
      let uploadedBytes = 0;
      for (const file of includedFiles) {
        const content = await fs.promises.readFile(file.absolutePath);
        const blob = new Blob([content]);
        formData.append('files', blob, file.relativePath);

        uploadedBytes += file.size;
        this._onProgressUpdate.fire({
          phase: 'uploading',
          progress: 30 + Math.floor((uploadedBytes / summary.includedSize) * 50),
          message: `Uploading ${file.relativePath}...`,
          bytesUploaded: uploadedBytes,
          totalBytes: summary.includedSize,
        });
      }

      // Upload files
      const uploadResponse = await fetch(`${config.apiUrl}/api/uploads/${uploadId}/part`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const error = (await uploadResponse.json().catch(() => ({ message: 'Upload failed' }))) as { message?: string };
        throw new Error(error.message || `HTTP ${uploadResponse.status}`);
      }

      this._onProgressUpdate.fire({
        phase: 'finalizing',
        progress: 90,
        message: 'Finalizing submission...',
      });

      // Complete upload
      const completeResponse = await fetch(`${config.apiUrl}/api/uploads/${uploadId}/complete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contentHash: summary.contentHash }),
      });

      if (!completeResponse.ok) {
        const error = (await completeResponse.json().catch(() => ({ message: 'Finalization failed' }))) as { message?: string };
        throw new Error(error.message || `HTTP ${completeResponse.status}`);
      }

      const completeData = (await completeResponse.json()) as { submissionId?: string; artifactId?: string };

      this._onProgressUpdate.fire({
        phase: 'complete',
        progress: 100,
        message: 'Submission complete!',
      });

      return completeData.submissionId || completeData.artifactId || null;
    } catch (error) {
      this._onProgressUpdate.fire({
        phase: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Upload failed',
      });
      throw error;
    }
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Toggle file exclusion manually
   */
  toggleFileExclusion(summary: SubmissionSummary, relativePath: string): SubmissionSummary {
    const updatedFiles = summary.files.map((f) => {
      if (f.relativePath === relativePath) {
        return {
          ...f,
          isExcluded: !f.isExcluded,
          excludeReason: f.isExcluded ? undefined : 'Manually excluded',
        };
      }
      return f;
    });

    // Recalculate sizes
    let includedSize = 0;
    let excludedCount = 0;
    for (const file of updatedFiles) {
      if (file.isExcluded) {
        excludedCount++;
      } else {
        includedSize += file.size;
      }
    }

    return {
      ...summary,
      files: updatedFiles,
      includedSize,
      excludedCount,
    };
  }

  /**
   * Dispose
   */
  dispose(): void {
    this._onProgressUpdate.dispose();
  }
}
