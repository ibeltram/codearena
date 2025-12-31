/**
 * Artifact Processing Pipeline
 *
 * Handles:
 * - Zip extraction and normalization
 * - Manifest generation with file paths, sizes, and hashes
 * - Secret scanning for sensitive files and patterns
 * - Content-addressed storage key generation
 */

import crypto from 'crypto';
import path from 'path';

/**
 * File entry in the manifest
 */
export interface ManifestFile {
  path: string;
  size: number;
  hash: string; // SHA-256 of file contents
  mimeType?: string;
  isText: boolean;
  isBinary: boolean;
}

/**
 * Complete artifact manifest
 */
export interface ArtifactManifest {
  version: 1;
  contentHash: string; // SHA-256 of all file hashes combined
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

/**
 * Secret finding from the scanner
 */
export interface SecretFinding {
  file: string;
  line?: number;
  type: SecretType;
  severity: 'high' | 'medium' | 'low';
  description: string;
  evidence?: string; // Redacted snippet showing the match
}

/**
 * Types of secrets we scan for
 */
export type SecretType =
  | 'env_file'
  | 'api_key'
  | 'private_key'
  | 'credential_file'
  | 'aws_credentials'
  | 'database_url'
  | 'jwt_secret'
  | 'oauth_token'
  | 'github_token'
  | 'stripe_key'
  | 'password_in_code';

/**
 * Secret scan result
 */
export interface SecretScanResult {
  status: 'clean' | 'flagged';
  findings: SecretFinding[];
  scannedAt: string;
  scannedFiles: number;
  skippedFiles: number; // Binary files
}

/**
 * Files that are always flagged as dangerous
 */
const DANGEROUS_FILE_PATTERNS = [
  // Environment files
  /^\.env$/i,
  /^\.env\..+$/i,
  /^\.env\.local$/i,
  /^\.env\.production$/i,
  /^\.env\.development$/i,

  // Credential files
  /^credentials\.json$/i,
  /^service[-_]?account.*\.json$/i,
  /^gcloud.*\.json$/i,
  /^firebase.*\.json$/i,

  // SSH keys
  /^id_rsa$/i,
  /^id_dsa$/i,
  /^id_ed25519$/i,
  /^id_ecdsa$/i,
  /.*_rsa$/i,
  /.*\.pem$/i,
  /.*\.key$/i,
  /.*\.p12$/i,
  /.*\.pfx$/i,

  // Package manager auth
  /^\.npmrc$/i,
  /^\.yarnrc$/i,
  /^\.pypirc$/i,

  // Cloud provider configs
  /^\.aws\/credentials$/i,
  /^aws-credentials$/i,
  /^\.netrc$/i,
  /^\.docker\/config\.json$/i,

  // Auth tokens
  /^\.git-credentials$/i,
  /^\.github.*token.*$/i,
];

/**
 * Patterns to scan for in file contents
 */
const SECRET_PATTERNS: {
  pattern: RegExp;
  type: SecretType;
  severity: 'high' | 'medium' | 'low';
  description: string;
}[] = [
  // AWS
  {
    pattern: /AKIA[0-9A-Z]{16}/g,
    type: 'aws_credentials',
    severity: 'high',
    description: 'AWS Access Key ID',
  },
  {
    pattern: /aws_secret_access_key\s*[=:]\s*['""]?[\w/+=]{40}['""]?/gi,
    type: 'aws_credentials',
    severity: 'high',
    description: 'AWS Secret Access Key',
  },

  // GitHub
  {
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    type: 'github_token',
    severity: 'high',
    description: 'GitHub Personal Access Token',
  },
  {
    pattern: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
    type: 'github_token',
    severity: 'high',
    description: 'GitHub Fine-grained Personal Access Token',
  },
  {
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    type: 'oauth_token',
    severity: 'high',
    description: 'GitHub OAuth Token',
  },

  // Stripe
  {
    pattern: /sk_live_[a-zA-Z0-9]{24,}/g,
    type: 'stripe_key',
    severity: 'high',
    description: 'Stripe Live Secret Key',
  },
  {
    pattern: /sk_test_[a-zA-Z0-9]{24,}/g,
    type: 'stripe_key',
    severity: 'medium',
    description: 'Stripe Test Secret Key',
  },

  // Generic API Keys
  {
    pattern: /api[_-]?key\s*[=:]\s*['""]?[a-zA-Z0-9]{20,}['""]?/gi,
    type: 'api_key',
    severity: 'medium',
    description: 'Generic API Key',
  },
  {
    pattern: /apikey\s*[=:]\s*['""]?[a-zA-Z0-9]{20,}['""]?/gi,
    type: 'api_key',
    severity: 'medium',
    description: 'Generic API Key',
  },

  // Database URLs
  {
    pattern: /postgres(ql)?:\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    type: 'database_url',
    severity: 'high',
    description: 'PostgreSQL Connection String with Credentials',
  },
  {
    pattern: /mysql:\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    type: 'database_url',
    severity: 'high',
    description: 'MySQL Connection String with Credentials',
  },
  {
    pattern: /mongodb(\+srv)?:\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    type: 'database_url',
    severity: 'high',
    description: 'MongoDB Connection String with Credentials',
  },

  // JWT Secrets
  {
    pattern: /jwt[_-]?secret\s*[=:]\s*['""]?[\w-]{20,}['""]?/gi,
    type: 'jwt_secret',
    severity: 'high',
    description: 'JWT Secret Key',
  },

  // Private Keys
  {
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    type: 'private_key',
    severity: 'high',
    description: 'Private Key',
  },

  // Passwords in code
  {
    pattern: /password\s*[=:]\s*['""][^'""]{8,}['""](?!\s*\|\||&&)/gi,
    type: 'password_in_code',
    severity: 'medium',
    description: 'Hardcoded Password',
  },
];

/**
 * Binary file extensions to skip during content scanning
 */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pyc', '.pyo', '.class', '.o',
  '.sqlite', '.db', '.sqlite3',
]);

/**
 * Text file extensions
 */
const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt', '.scala', '.cs',
  '.c', '.cpp', '.h', '.hpp',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.cfg',
  '.md', '.txt', '.rst', '.csv', '.log',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql',
  '.env', '.gitignore', '.dockerignore', '.editorconfig',
  '.eslintrc', '.prettierrc', '.babelrc',
  'Dockerfile', 'Makefile', 'Jenkinsfile',
]);

/**
 * Determine if a file is binary based on extension
 */
export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Determine if a file is text based on extension
 */
export function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);

  // Check known text extensions
  if (TEXT_EXTENSIONS.has(ext)) return true;

  // Check known text files without extensions
  if (TEXT_EXTENSIONS.has(basename)) return true;

  // Default: assume text if not in binary list
  return !isBinaryFile(filePath);
}

/**
 * Get MIME type for a file
 */
export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    '.js': 'application/javascript',
    '.jsx': 'text/jsx',
    '.ts': 'application/typescript',
    '.tsx': 'text/tsx',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.py': 'text/x-python',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.yaml': 'application/x-yaml',
    '.yml': 'application/x-yaml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
  };

  return mimeTypes[ext] || (isTextFile(filePath) ? 'text/plain' : 'application/octet-stream');
}

/**
 * Check if a file path matches dangerous file patterns
 */
export function isDangerousFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = path.basename(normalizedPath);

  for (const pattern of DANGEROUS_FILE_PATTERNS) {
    if (pattern.test(fileName) || pattern.test(normalizedPath)) {
      return true;
    }
  }

  return false;
}

/**
 * Scan file contents for secrets
 */
export function scanContentForSecrets(
  filePath: string,
  content: string
): SecretFinding[] {
  const findings: SecretFinding[] = [];

  // Check if it's a dangerous file type first
  if (isDangerousFile(filePath)) {
    findings.push({
      file: filePath,
      type: 'credential_file',
      severity: 'high',
      description: 'Potentially sensitive configuration file',
    });
  }

  // Scan content for secret patterns
  const lines = content.split('\n');

  for (const secretDef of SECRET_PATTERNS) {
    // Reset regex
    secretDef.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = secretDef.pattern.exec(content)) !== null) {
      // Find the line number
      let charCount = 0;
      let lineNumber = 1;
      for (let i = 0; i < lines.length; i++) {
        charCount += lines[i].length + 1; // +1 for newline
        if (charCount > match.index) {
          lineNumber = i + 1;
          break;
        }
      }

      // Redact the secret for the evidence
      const matchedText = match[0];
      const redactedEvidence =
        matchedText.length > 20
          ? matchedText.substring(0, 10) + '...[REDACTED]...' + matchedText.substring(matchedText.length - 5)
          : '[REDACTED]';

      findings.push({
        file: filePath,
        line: lineNumber,
        type: secretDef.type,
        severity: secretDef.severity,
        description: secretDef.description,
        evidence: redactedEvidence,
      });
    }
  }

  return findings;
}

/**
 * Process a single file for manifest and scanning
 */
export function processFile(
  filePath: string,
  content: Buffer
): {
  manifestEntry: ManifestFile;
  secretFindings: SecretFinding[];
} {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const isBinary = isBinaryFile(filePath);
  const isText = isTextFile(filePath);

  const manifestEntry: ManifestFile = {
    path: filePath.replace(/\\/g, '/'), // Normalize path separators
    size: content.length,
    hash,
    mimeType: getMimeType(filePath),
    isText,
    isBinary,
  };

  let secretFindings: SecretFinding[] = [];

  // Only scan text files for secrets
  if (isText && !isBinary) {
    const textContent = content.toString('utf-8');
    secretFindings = scanContentForSecrets(filePath, textContent);
  }

  return { manifestEntry, secretFindings };
}

/**
 * Generate a complete artifact manifest from a list of files
 */
export function generateManifest(
  files: ManifestFile[],
  metadata: ArtifactManifest['metadata']
): ArtifactManifest {
  // Sort files by path for deterministic ordering
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  // Calculate total size
  const totalSize = sortedFiles.reduce((sum, f) => sum + f.size, 0);

  // Generate content hash from all file hashes
  const hashInput = sortedFiles.map((f) => `${f.path}:${f.hash}`).join('\n');
  const contentHash = crypto.createHash('sha256').update(hashInput).digest('hex');

  return {
    version: 1,
    contentHash,
    totalSize,
    fileCount: sortedFiles.length,
    files: sortedFiles,
    metadata: {
      ...metadata,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Generate storage key from content hash
 * Uses content-addressed storage pattern
 */
export function generateStorageKey(contentHash: string): string {
  // Use first 2 chars for directory sharding
  const shard = contentHash.substring(0, 2);
  return `artifacts/${shard}/${contentHash}`;
}

/**
 * Combine multiple secret scan results
 */
export function combineSecretScans(
  findings: SecretFinding[],
  totalFiles: number,
  skippedFiles: number
): SecretScanResult {
  return {
    status: findings.length > 0 ? 'flagged' : 'clean',
    findings,
    scannedAt: new Date().toISOString(),
    scannedFiles: totalFiles - skippedFiles,
    skippedFiles,
  };
}

/**
 * Check if an artifact should be blocked from public viewing
 */
export function shouldBlockPublicViewing(scanResult: SecretScanResult): boolean {
  // Block if there are any high severity findings
  return scanResult.findings.some((f) => f.severity === 'high');
}

/**
 * Get a summary of secret findings for logging/notifications
 */
export function getSecretSummary(scanResult: SecretScanResult): string {
  if (scanResult.status === 'clean') {
    return `Scanned ${scanResult.scannedFiles} files - no secrets detected`;
  }

  const byType = new Map<SecretType, number>();
  const bySeverity = { high: 0, medium: 0, low: 0 };

  for (const finding of scanResult.findings) {
    byType.set(finding.type, (byType.get(finding.type) || 0) + 1);
    bySeverity[finding.severity]++;
  }

  const typesSummary = Array.from(byType.entries())
    .map(([type, count]) => `${type}(${count})`)
    .join(', ');

  return (
    `Found ${scanResult.findings.length} potential secrets: ` +
    `${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low. ` +
    `Types: ${typesSummary}`
  );
}
