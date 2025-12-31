/**
 * Storage API Routes
 *
 * Provides endpoints for file upload/download with presigned URLs.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  storage,
  BUCKETS,
  getUploadUrl,
  getArtifactDownloadUrl,
  hashContent,
  generateContentKey,
  type BucketName,
} from '../lib/storage';
import { verifyAccessToken } from '../lib/session';

// Schemas
const getUploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().optional(),
  bucket: z.enum(['uploads', 'artifacts']).optional().default('uploads'),
});

const confirmUploadSchema = z.object({
  key: z.string().min(1),
  bucket: z.enum(['uploads', 'artifacts']).optional().default('uploads'),
});

const getDownloadUrlSchema = z.object({
  key: z.string().min(1),
  bucket: z.enum(['uploads', 'artifacts', 'logs']).optional().default('artifacts'),
  filename: z.string().optional(),
});

// Helper to get bucket from string
function getBucket(bucket: string): BucketName {
  switch (bucket) {
    case 'artifacts':
      return BUCKETS.ARTIFACTS;
    case 'uploads':
      return BUCKETS.UPLOADS;
    case 'logs':
      return BUCKETS.LOGS;
    case 'templates':
      return BUCKETS.TEMPLATES;
    default:
      return BUCKETS.UPLOADS;
  }
}

export async function storageRoutes(app: FastifyInstance) {
  /**
   * POST /api/storage/upload-url
   * Get a presigned URL for direct upload
   */
  app.post('/api/storage/upload-url', async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify authentication
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const accessToken = authHeader.slice(7);
    const payload = await verifyAccessToken(app, accessToken);

    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    const parseResult = getUploadUrlSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        errorDescription: 'Invalid request body',
        details: parseResult.error.errors,
      });
    }

    const { filename, contentType, bucket } = parseResult.data;

    // Generate unique key with user ID prefix
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `users/${payload.sub}/${timestamp}-${sanitizedFilename}`;

    const bucketName = getBucket(bucket);
    const { url } = getUploadUrl(bucketName, key, contentType);

    return reply.status(200).send({
      uploadUrl: url,
      key,
      method: 'PUT',
      expiresIn: 3600,
    });
  });

  /**
   * POST /api/storage/confirm-upload
   * Confirm an upload was successful and get file metadata
   */
  app.post('/api/storage/confirm-upload', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const accessToken = authHeader.slice(7);
    const payload = await verifyAccessToken(app, accessToken);

    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    const parseResult = confirmUploadSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        errorDescription: 'Invalid request body',
      });
    }

    const { key, bucket } = parseResult.data;
    const bucketName = getBucket(bucket);

    // Verify the key belongs to the user
    if (!key.startsWith(`users/${payload.sub}/`)) {
      return reply.status(403).send({
        error: 'forbidden',
        errorDescription: 'Access denied to this file',
      });
    }

    // Check if file exists
    const info = await storage.head(bucketName, key);
    if (!info) {
      return reply.status(404).send({
        error: 'not_found',
        errorDescription: 'File not found',
      });
    }

    return reply.status(200).send({
      key,
      size: info.size,
      contentType: info.contentType,
      etag: info.etag,
      uploadedAt: info.lastModified,
    });
  });

  /**
   * GET /api/storage/download-url
   * Get a presigned URL for downloading a file
   */
  app.get('/api/storage/download-url', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const accessToken = authHeader.slice(7);
    const payload = await verifyAccessToken(app, accessToken);

    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    const query = request.query as { key?: string; bucket?: string; filename?: string };

    const parseResult = getDownloadUrlSchema.safeParse(query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        errorDescription: 'Invalid query parameters',
      });
    }

    const { key, bucket, filename } = parseResult.data;
    const bucketName = getBucket(bucket);

    // For user uploads, verify ownership
    if (key.startsWith('users/') && !key.startsWith(`users/${payload.sub}/`)) {
      return reply.status(403).send({
        error: 'forbidden',
        errorDescription: 'Access denied to this file',
      });
    }

    // Check if file exists
    const exists = await storage.exists(bucketName, key);
    if (!exists) {
      return reply.status(404).send({
        error: 'not_found',
        errorDescription: 'File not found',
      });
    }

    const downloadUrl = storage.generateDownloadUrl(bucketName, key, {
      expiresIn: 3600,
      contentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
    });

    return reply.status(200).send({
      downloadUrl,
      expiresIn: 3600,
    });
  });

  /**
   * DELETE /api/storage/files/:key
   * Delete a user's uploaded file
   */
  app.delete('/api/storage/files/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const accessToken = authHeader.slice(7);
    const payload = await verifyAccessToken(app, accessToken);

    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    // Get key from wildcard param
    const key = (request.params as { '*': string })['*'];

    if (!key) {
      return reply.status(400).send({
        error: 'invalid_request',
        errorDescription: 'File key required',
      });
    }

    // Only allow deleting own files
    if (!key.startsWith(`users/${payload.sub}/`)) {
      return reply.status(403).send({
        error: 'forbidden',
        errorDescription: 'Access denied to this file',
      });
    }

    // Check if file exists
    const exists = await storage.exists(BUCKETS.UPLOADS, key);
    if (!exists) {
      return reply.status(404).send({
        error: 'not_found',
        errorDescription: 'File not found',
      });
    }

    await storage.delete(BUCKETS.UPLOADS, key);

    return reply.status(200).send({
      success: true,
      message: 'File deleted',
    });
  });

  /**
   * GET /api/storage/health
   * Check storage connectivity
   */
  app.get('/api/storage/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Try to check if a test key exists (will connect to storage)
      await storage.exists(BUCKETS.UPLOADS, '__health_check__');

      return reply.status(200).send({
        status: 'healthy',
        buckets: Object.values(BUCKETS),
      });
    } catch (error) {
      return reply.status(503).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Storage connection failed',
      });
    }
  });
}
