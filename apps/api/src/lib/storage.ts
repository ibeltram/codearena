/**
 * S3-Compatible Object Storage Library
 *
 * Provides a unified interface for object storage operations:
 * - File uploads/downloads
 * - Presigned URL generation
 * - Content-addressed storage (SHA-256)
 * - Bucket management
 *
 * Uses MinIO in development, can switch to S3 in production.
 */

import crypto from 'crypto';
import { Readable } from 'stream';
import { env } from './env';

// Bucket names
export const BUCKETS = {
  ARTIFACTS: 'reporivals-artifacts',
  UPLOADS: 'reporivals-uploads',
  LOGS: 'reporivals-logs',
  TEMPLATES: 'reporivals-templates',
} as const;

export type BucketName = typeof BUCKETS[keyof typeof BUCKETS];

// Storage configuration
interface StorageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  forcePathStyle: boolean;
}

function getStorageConfig(): StorageConfig {
  return {
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    region: 'us-east-1', // Default region for MinIO
    forcePathStyle: true, // Required for MinIO
  };
}

// Types
export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  contentDisposition?: string;
  cacheControl?: string;
}

export interface DownloadResult {
  body: Buffer;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
  etag?: string;
}

export interface ObjectInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
  contentType?: string;
}

export interface PresignedUrlOptions {
  expiresIn?: number; // seconds, default 3600 (1 hour)
  contentType?: string; // for upload URLs
  contentDisposition?: string;
}

export interface ListOptions {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface ListResult {
  objects: ObjectInfo[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

/**
 * Storage client class for S3-compatible storage
 * Uses native fetch API for S3 operations (no AWS SDK dependency)
 */
class StorageClient {
  private config: StorageConfig;

  constructor() {
    this.config = getStorageConfig();
  }

  /**
   * Generate AWS Signature Version 4 for request
   */
  private signRequest(
    method: string,
    bucket: string,
    key: string,
    headers: Record<string, string>,
    payload: Buffer | string = ''
  ): Record<string, string> {
    const date = new Date();
    const dateStr = date.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8);
    const timeStr = date.toISOString().replace(/[:-]|\.\d{3}/g, '');

    // Parse endpoint to get host
    const endpointUrl = new URL(this.config.endpoint);
    const host = `${bucket}.${endpointUrl.host}`;
    const path = `/${encodeURIComponent(key)}`;

    // Use path-style for MinIO
    const actualHost = this.config.forcePathStyle ? endpointUrl.host : host;
    const actualPath = this.config.forcePathStyle ? `/${bucket}${path}` : path;

    // Payload hash
    const payloadHash = crypto
      .createHash('sha256')
      .update(payload)
      .digest('hex');

    // Canonical headers
    const signedHeaders: Record<string, string> = {
      host: actualHost,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': timeStr,
      ...headers,
    };

    const sortedHeaderKeys = Object.keys(signedHeaders).sort();
    const canonicalHeaders = sortedHeaderKeys
      .map((k) => `${k.toLowerCase()}:${signedHeaders[k]}\n`)
      .join('');
    const signedHeadersList = sortedHeaderKeys.map((k) => k.toLowerCase()).join(';');

    // Canonical request
    const canonicalRequest = [
      method,
      actualPath,
      '', // query string
      canonicalHeaders,
      signedHeadersList,
      payloadHash,
    ].join('\n');

    const canonicalRequestHash = crypto
      .createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');

    // String to sign
    const credentialScope = `${dateStr}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timeStr,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // Signing key
    const kDate = crypto
      .createHmac('sha256', `AWS4${this.config.secretAccessKey}`)
      .update(dateStr)
      .digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.config.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();

    // Signature
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Authorization header
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`;

    return {
      ...signedHeaders,
      Authorization: authorization,
    };
  }

  /**
   * Build full URL for S3 request
   */
  private buildUrl(bucket: string, key?: string): string {
    const endpointUrl = new URL(this.config.endpoint);

    if (this.config.forcePathStyle) {
      // Path-style: http://localhost:9000/bucket/key
      const path = key ? `/${bucket}/${encodeURIComponent(key)}` : `/${bucket}`;
      return `${endpointUrl.origin}${path}`;
    } else {
      // Virtual-hosted style: http://bucket.localhost:9000/key
      const path = key ? `/${encodeURIComponent(key)}` : '/';
      return `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}${path}`;
    }
  }

  /**
   * Upload a file to storage
   */
  async upload(
    bucket: BucketName,
    key: string,
    data: Buffer | string,
    options: UploadOptions = {}
  ): Promise<{ etag: string; key: string }> {
    const payload = typeof data === 'string' ? Buffer.from(data) : data;

    const headers: Record<string, string> = {};
    if (options.contentType) {
      headers['content-type'] = options.contentType;
    }
    if (options.contentDisposition) {
      headers['content-disposition'] = options.contentDisposition;
    }
    if (options.cacheControl) {
      headers['cache-control'] = options.cacheControl;
    }
    if (options.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        headers[`x-amz-meta-${k.toLowerCase()}`] = v;
      }
    }

    const signedHeaders = this.signRequest('PUT', bucket, key, headers, payload);
    const url = this.buildUrl(bucket, key);

    const response = await fetch(url, {
      method: 'PUT',
      headers: signedHeaders,
      body: payload,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed: ${response.status} ${text}`);
    }

    const etag = response.headers.get('etag')?.replace(/"/g, '') || '';

    return { etag, key };
  }

  /**
   * Download a file from storage
   */
  async download(bucket: BucketName, key: string): Promise<DownloadResult> {
    const signedHeaders = this.signRequest('GET', bucket, key, {});
    const url = this.buildUrl(bucket, key);

    const response = await fetch(url, {
      method: 'GET',
      headers: signedHeaders,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Object not found: ${key}`);
      }
      const text = await response.text();
      throw new Error(`Download failed: ${response.status} ${text}`);
    }

    const body = Buffer.from(await response.arrayBuffer());

    // Extract metadata
    const metadata: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (key.startsWith('x-amz-meta-')) {
        metadata[key.replace('x-amz-meta-', '')] = value;
      }
    });

    return {
      body,
      contentType: response.headers.get('content-type') || undefined,
      contentLength: body.length,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      etag: response.headers.get('etag')?.replace(/"/g, '') || undefined,
    };
  }

  /**
   * Check if an object exists
   */
  async exists(bucket: BucketName, key: string): Promise<boolean> {
    try {
      const signedHeaders = this.signRequest('HEAD', bucket, key, {});
      const url = this.buildUrl(bucket, key);

      const response = await fetch(url, {
        method: 'HEAD',
        headers: signedHeaders,
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Delete an object
   */
  async delete(bucket: BucketName, key: string): Promise<void> {
    const signedHeaders = this.signRequest('DELETE', bucket, key, {});
    const url = this.buildUrl(bucket, key);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: signedHeaders,
    });

    if (!response.ok && response.status !== 204) {
      const text = await response.text();
      throw new Error(`Delete failed: ${response.status} ${text}`);
    }
  }

  /**
   * Get object metadata without downloading content
   */
  async head(bucket: BucketName, key: string): Promise<ObjectInfo | null> {
    try {
      const signedHeaders = this.signRequest('HEAD', bucket, key, {});
      const url = this.buildUrl(bucket, key);

      const response = await fetch(url, {
        method: 'HEAD',
        headers: signedHeaders,
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Head failed: ${response.status}`);
      }

      return {
        key,
        size: parseInt(response.headers.get('content-length') || '0', 10),
        lastModified: new Date(response.headers.get('last-modified') || ''),
        etag: response.headers.get('etag')?.replace(/"/g, '') || undefined,
        contentType: response.headers.get('content-type') || undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Generate a presigned URL for download
   */
  generateDownloadUrl(
    bucket: BucketName,
    key: string,
    options: PresignedUrlOptions = {}
  ): string {
    const expiresIn = options.expiresIn || 3600;
    const date = new Date();
    const dateStr = date.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8);
    const timeStr = date.toISOString().replace(/[:-]|\.\d{3}/g, '');

    const endpointUrl = new URL(this.config.endpoint);
    const host = this.config.forcePathStyle ? endpointUrl.host : `${bucket}.${endpointUrl.host}`;
    const path = this.config.forcePathStyle ? `/${bucket}/${encodeURIComponent(key)}` : `/${encodeURIComponent(key)}`;

    const credentialScope = `${dateStr}/${this.config.region}/s3/aws4_request`;
    const credential = `${this.config.accessKeyId}/${credentialScope}`;

    // Query parameters for presigned URL
    const queryParams = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': timeStr,
      'X-Amz-Expires': String(expiresIn),
      'X-Amz-SignedHeaders': 'host',
    });

    if (options.contentDisposition) {
      queryParams.set('response-content-disposition', options.contentDisposition);
    }

    // Canonical request for presigned URL
    const canonicalHeaders = `host:${host}\n`;
    const canonicalRequest = [
      'GET',
      path,
      queryParams.toString(),
      canonicalHeaders,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const canonicalRequestHash = crypto
      .createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');

    // String to sign
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timeStr,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // Signing key
    const kDate = crypto
      .createHmac('sha256', `AWS4${this.config.secretAccessKey}`)
      .update(dateStr)
      .digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.config.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();

    // Signature
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    queryParams.set('X-Amz-Signature', signature);

    const baseUrl = this.config.forcePathStyle
      ? `${endpointUrl.origin}${path}`
      : `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}${path}`;

    return `${baseUrl}?${queryParams.toString()}`;
  }

  /**
   * Generate a presigned URL for upload
   */
  generateUploadUrl(
    bucket: BucketName,
    key: string,
    options: PresignedUrlOptions = {}
  ): { url: string; fields?: Record<string, string> } {
    const expiresIn = options.expiresIn || 3600;
    const date = new Date();
    const dateStr = date.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8);
    const timeStr = date.toISOString().replace(/[:-]|\.\d{3}/g, '');

    const endpointUrl = new URL(this.config.endpoint);
    const host = this.config.forcePathStyle ? endpointUrl.host : `${bucket}.${endpointUrl.host}`;
    const path = this.config.forcePathStyle ? `/${bucket}/${encodeURIComponent(key)}` : `/${encodeURIComponent(key)}`;

    const credentialScope = `${dateStr}/${this.config.region}/s3/aws4_request`;
    const credential = `${this.config.accessKeyId}/${credentialScope}`;

    const queryParams = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': timeStr,
      'X-Amz-Expires': String(expiresIn),
      'X-Amz-SignedHeaders': 'host',
    });

    // Canonical request for presigned PUT
    const canonicalHeaders = `host:${host}\n`;
    const canonicalRequest = [
      'PUT',
      path,
      queryParams.toString(),
      canonicalHeaders,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const canonicalRequestHash = crypto
      .createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timeStr,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    const kDate = crypto
      .createHmac('sha256', `AWS4${this.config.secretAccessKey}`)
      .update(dateStr)
      .digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.config.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();

    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    queryParams.set('X-Amz-Signature', signature);

    const baseUrl = this.config.forcePathStyle
      ? `${endpointUrl.origin}${path}`
      : `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}${path}`;

    return { url: `${baseUrl}?${queryParams.toString()}` };
  }

  /**
   * Copy an object within or between buckets
   */
  async copy(
    sourceBucket: BucketName,
    sourceKey: string,
    destBucket: BucketName,
    destKey: string
  ): Promise<{ etag: string }> {
    const copySource = `/${sourceBucket}/${encodeURIComponent(sourceKey)}`;
    const headers = {
      'x-amz-copy-source': copySource,
    };

    const signedHeaders = this.signRequest('PUT', destBucket, destKey, headers);
    const url = this.buildUrl(destBucket, destKey);

    const response = await fetch(url, {
      method: 'PUT',
      headers: signedHeaders,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Copy failed: ${response.status} ${text}`);
    }

    const etag = response.headers.get('etag')?.replace(/"/g, '') || '';

    return { etag };
  }
}

// Singleton instance
const storageClient = new StorageClient();

/**
 * Check storage connection health
 */
export async function checkStorageConnection(): Promise<boolean> {
  try {
    // Try to check if the artifacts bucket exists by listing 1 object
    await storageClient.list(BUCKETS.ARTIFACTS, { maxKeys: 1 });
    return true;
  } catch (error) {
    console.error('Storage health check failed:', error);
    return false;
  }
}

// Content-addressed storage helpers

/**
 * Generate SHA-256 hash of content
 */
export function hashContent(content: Buffer | string): string {
  return crypto
    .createHash('sha256')
    .update(content)
    .digest('hex');
}

/**
 * Generate a content-addressed key for storage
 * Format: prefix/ab/cd/abcdef...123456
 */
export function generateContentKey(hash: string, prefix: string = ''): string {
  // Use first 4 chars as directory prefixes for better distribution
  const dir1 = hash.slice(0, 2);
  const dir2 = hash.slice(2, 4);
  const parts = [dir1, dir2, hash];

  if (prefix) {
    parts.unshift(prefix);
  }

  return parts.join('/');
}

/**
 * Upload content using content-addressed storage
 * Returns the content hash and storage key
 */
export async function uploadContentAddressed(
  bucket: BucketName,
  content: Buffer | string,
  options: UploadOptions & { prefix?: string } = {}
): Promise<{ hash: string; key: string; etag: string }> {
  const hash = hashContent(content);
  const key = generateContentKey(hash, options.prefix);

  const { prefix, ...uploadOptions } = options;

  // Check if content already exists (deduplication)
  const exists = await storageClient.exists(bucket, key);
  if (exists) {
    const info = await storageClient.head(bucket, key);
    return { hash, key, etag: info?.etag || '' };
  }

  const { etag } = await storageClient.upload(bucket, key, content, uploadOptions);

  return { hash, key, etag };
}

/**
 * Download content by hash
 */
export async function downloadByHash(
  bucket: BucketName,
  hash: string,
  prefix: string = ''
): Promise<DownloadResult> {
  const key = generateContentKey(hash, prefix);
  return storageClient.download(bucket, key);
}

// Artifact-specific helpers

/**
 * Upload a submission artifact
 */
export async function uploadArtifact(
  matchId: string,
  submissionId: string,
  content: Buffer,
  filename: string
): Promise<{ key: string; hash: string; size: number }> {
  const hash = hashContent(content);
  const key = `matches/${matchId}/submissions/${submissionId}/${filename}`;

  await storageClient.upload(BUCKETS.ARTIFACTS, key, content, {
    contentType: 'application/zip',
    metadata: {
      'match-id': matchId,
      'submission-id': submissionId,
      'content-hash': hash,
    },
  });

  return { key, hash, size: content.length };
}

/**
 * Get download URL for an artifact
 */
export function getArtifactDownloadUrl(
  key: string,
  filename?: string,
  expiresIn: number = 3600
): string {
  return storageClient.generateDownloadUrl(BUCKETS.ARTIFACTS, key, {
    expiresIn,
    contentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
  });
}

/**
 * Upload judging log
 */
export async function uploadJudgingLog(
  matchId: string,
  content: string
): Promise<{ key: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `matches/${matchId}/logs/${timestamp}.log`;

  await storageClient.upload(BUCKETS.LOGS, key, content, {
    contentType: 'text/plain',
  });

  return { key };
}

/**
 * Get upload URL for direct browser uploads
 */
export function getUploadUrl(
  bucket: BucketName,
  key: string,
  contentType?: string,
  expiresIn: number = 3600
): { url: string } {
  return storageClient.generateUploadUrl(bucket, key, {
    expiresIn,
    contentType,
  });
}

/**
 * Download an object from storage
 */
export async function downloadObject(
  bucket: BucketName,
  key: string
): Promise<Buffer> {
  const result = await storageClient.download(bucket, key);
  return result.body;
}

/**
 * Upload an object to storage
 */
export async function uploadObject(
  bucket: BucketName,
  key: string,
  data: Buffer | string,
  options?: UploadOptions
): Promise<{ etag: string; key: string }> {
  return storageClient.upload(bucket, key, data, options);
}

// Export singleton instance
export const storage = storageClient;

// Export types
export type { StorageClient };
