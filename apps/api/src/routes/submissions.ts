/**
 * Submissions Routes
 *
 * Provides API endpoints for submission upload flow with resumable multipart uploads.
 *
 * Endpoints:
 * - POST /api/matches/:id/submissions/init - Initialize upload, get presigned URLs
 * - PUT /api/uploads/:id/part - Upload a chunk with part number
 * - POST /api/uploads/:id/complete - Finalize upload and create submission
 * - GET /api/uploads/:id/status - Get upload progress
 * - DELETE /api/uploads/:id - Cancel/abort upload
 * - GET /api/matches/:id/submissions - List submissions for a match
 * - GET /api/submissions/:id - Get submission details
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count } from 'drizzle-orm';
import { createHash, randomUUID } from 'crypto';

import { db, schema } from '../db';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../lib/errors';
import {
  generateStorageKey as generateContentAddressedKey,
  getSecretSummary,
  shouldBlockPublicViewing,
  type SecretScanResult,
} from '../lib/artifact-processor';

const {
  matches,
  matchParticipants,
  submissions,
  artifacts,
  challengeVersions,
  challenges,
  users,
} = schema;

// Constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB minimum part size (S3 requirement)
const MAX_PARTS = 1000;
const UPLOAD_TIMEOUT_HOURS = 24;

// In-memory upload tracking (in production, use Redis)
interface UploadPart {
  partNumber: number;
  size: number;
  hash: string;
  uploadedAt: Date;
}

interface PendingUpload {
  id: string;
  matchId: string;
  userId: string;
  filename: string;
  totalSize: number;
  parts: UploadPart[];
  partCount: number;
  createdAt: Date;
  expiresAt: Date;
  completed: boolean;
  storageKey: string;
  clientType?: string;
  clientVersion?: string;
}

// In-memory store for pending uploads (would use Redis in production)
const pendingUploads = new Map<string, PendingUpload>();

// Request body schemas
const initUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  totalSize: z.number().int().min(1).max(MAX_FILE_SIZE),
  contentType: z.string().default('application/zip'),
  clientType: z.string().optional(),
  clientVersion: z.string().optional(),
});

const uploadPartSchema = z.object({
  partNumber: z.number().int().min(1).max(MAX_PARTS),
  hash: z.string().length(64), // SHA-256 hex
});

const completeUploadSchema = z.object({
  parts: z.array(
    z.object({
      partNumber: z.number().int().min(1),
      hash: z.string().length(64),
    })
  ),
  totalHash: z.string().length(64), // SHA-256 of complete file
});

const matchIdParamSchema = z.object({
  id: z.string().uuid(),
});

const uploadIdParamSchema = z.object({
  id: z.string().uuid(),
});

const submissionIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Helper to generate storage key
function generateStorageKey(matchId: string, userId: string, filename: string): string {
  const timestamp = Date.now();
  const randomSuffix = randomUUID().split('-')[0];
  return `submissions/${matchId}/${userId}/${timestamp}-${randomSuffix}-${filename}`;
}

// Helper to calculate expected part count
function calculatePartCount(totalSize: number, partSize: number = MIN_PART_SIZE): number {
  return Math.ceil(totalSize / partSize);
}

// Helper to generate presigned URLs for parts (mock implementation)
function generatePresignedUrls(uploadId: string, partCount: number): { partNumber: number; url: string }[] {
  // In production, this would generate actual S3 presigned URLs
  return Array.from({ length: partCount }, (_, i) => ({
    partNumber: i + 1,
    url: `/api/uploads/${uploadId}/part?partNumber=${i + 1}`,
  }));
}

// Cleanup expired uploads
function cleanupExpiredUploads(): void {
  const now = new Date();
  for (const [id, upload] of pendingUploads.entries()) {
    if (upload.expiresAt < now && !upload.completed) {
      pendingUploads.delete(id);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredUploads, 60 * 60 * 1000);

export async function submissionRoutes(app: FastifyInstance) {
  // Helper to get user ID from request (would come from auth in production)
  const getUserId = (request: FastifyRequest): string => {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) {
      throw new ForbiddenError('User authentication required');
    }
    return userId;
  };

  // Helper to validate user is a match participant
  async function validateMatchParticipant(matchId: string, userId: string) {
    const [participant] = await db
      .select()
      .from(matchParticipants)
      .where(
        and(
          eq(matchParticipants.matchId, matchId),
          eq(matchParticipants.userId, userId)
        )
      );

    if (!participant) {
      throw new ForbiddenError('Not a participant in this match');
    }

    return participant;
  }

  // Helper to check if match accepts submissions
  function canSubmit(matchStatus: string): boolean {
    return matchStatus === 'in_progress';
  }

  /**
   * POST /api/matches/:id/submissions/init
   * Initialize a new upload session
   */
  app.post(
    '/api/matches/:id/submissions/init',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            filename: { type: 'string', minLength: 1, maxLength: 255 },
            totalSize: { type: 'number', minimum: 1, maximum: MAX_FILE_SIZE },
            contentType: { type: 'string', default: 'application/zip' },
            clientType: { type: 'string' },
            clientVersion: { type: 'string' },
          },
          required: ['filename', 'totalSize'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              uploadId: { type: 'string' },
              partSize: { type: 'number' },
              partCount: { type: 'number' },
              expiresAt: { type: 'string' },
              presignedUrls: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    partNumber: { type: 'number' },
                    url: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const paramResult = matchIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid match ID', {
          issues: paramResult.error.issues,
        });
      }

      const bodyResult = initUploadSchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new ValidationError('Invalid request body', {
          issues: bodyResult.error.issues,
        });
      }

      const { id: matchId } = paramResult.data;
      const { filename, totalSize, clientType, clientVersion } = bodyResult.data;

      // Verify match exists and is in submittable state
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId));

      if (!match) {
        throw new NotFoundError('Match', matchId);
      }

      if (!canSubmit(match.status)) {
        throw new ConflictError(
          `Cannot submit to match with status '${match.status}'. Match must be 'in_progress'.`
        );
      }

      // Verify user is a participant
      await validateMatchParticipant(matchId, userId);

      // Check if user already has a pending upload for this match
      for (const upload of pendingUploads.values()) {
        if (upload.matchId === matchId && upload.userId === userId && !upload.completed) {
          throw new ConflictError(
            'You already have a pending upload for this match. Complete or cancel it first.',
            { existingUploadId: upload.id }
          );
        }
      }

      // Create upload session
      const uploadId = randomUUID();
      const partCount = calculatePartCount(totalSize);
      const storageKey = generateStorageKey(matchId, userId, filename);
      const expiresAt = new Date(Date.now() + UPLOAD_TIMEOUT_HOURS * 60 * 60 * 1000);

      const upload: PendingUpload = {
        id: uploadId,
        matchId,
        userId,
        filename,
        totalSize,
        parts: [],
        partCount,
        createdAt: new Date(),
        expiresAt,
        completed: false,
        storageKey,
        clientType,
        clientVersion,
      };

      pendingUploads.set(uploadId, upload);

      // Generate presigned URLs for each part
      const presignedUrls = generatePresignedUrls(uploadId, partCount);

      return {
        uploadId,
        partSize: MIN_PART_SIZE,
        partCount,
        expiresAt: expiresAt.toISOString(),
        presignedUrls,
      };
    }
  );

  /**
   * PUT /api/uploads/:id/part
   * Upload a single part
   */
  app.put(
    '/api/uploads/:id/part',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            partNumber: { type: 'number', minimum: 1, maximum: MAX_PARTS },
          },
          required: ['partNumber'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              partNumber: { type: 'number' },
              hash: { type: 'string' },
              uploadedAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const paramResult = uploadIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid upload ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id: uploadId } = paramResult.data;

      // Get query params
      const query = request.query as { partNumber?: number };
      const partNumber = Number(query.partNumber);

      if (!partNumber || partNumber < 1) {
        throw new ValidationError('partNumber query parameter is required');
      }

      // Get upload session
      const upload = pendingUploads.get(uploadId);
      if (!upload) {
        throw new NotFoundError('Upload session', uploadId);
      }

      // Verify ownership
      if (upload.userId !== userId) {
        throw new ForbiddenError('Not authorized to upload to this session');
      }

      // Check if expired
      if (upload.expiresAt < new Date()) {
        pendingUploads.delete(uploadId);
        throw new ConflictError('Upload session has expired');
      }

      // Check if already completed
      if (upload.completed) {
        throw new ConflictError('Upload already completed');
      }

      // Validate part number
      if (partNumber > upload.partCount) {
        throw new ValidationError(`Part number ${partNumber} exceeds expected ${upload.partCount} parts`);
      }

      // Check if part already uploaded
      const existingPart = upload.parts.find((p) => p.partNumber === partNumber);
      if (existingPart) {
        // Allow re-upload of same part (idempotent)
        return {
          partNumber: existingPart.partNumber,
          hash: existingPart.hash,
          uploadedAt: existingPart.uploadedAt.toISOString(),
          message: 'Part already uploaded',
        };
      }

      // Read request body as buffer
      const body = await request.body as Buffer || Buffer.alloc(0);
      const size = body.length;

      // Validate part size
      if (partNumber < upload.partCount && size < MIN_PART_SIZE) {
        throw new ValidationError(
          `Part size ${size} is less than minimum ${MIN_PART_SIZE} bytes for non-final parts`
        );
      }

      // Calculate hash of the part
      const hash = createHash('sha256').update(body).digest('hex');

      // In production, would upload to S3 here
      // For now, just track the part metadata

      const part: UploadPart = {
        partNumber,
        size,
        hash,
        uploadedAt: new Date(),
      };

      upload.parts.push(part);
      upload.parts.sort((a, b) => a.partNumber - b.partNumber);

      return {
        partNumber: part.partNumber,
        hash: part.hash,
        uploadedAt: part.uploadedAt.toISOString(),
      };
    }
  );

  /**
   * POST /api/uploads/:id/complete
   * Finalize upload and create submission
   */
  app.post(
    '/api/uploads/:id/complete',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            parts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  partNumber: { type: 'number' },
                  hash: { type: 'string' },
                },
                required: ['partNumber', 'hash'],
              },
            },
            totalHash: { type: 'string', minLength: 64, maxLength: 64 },
          },
          required: ['parts', 'totalHash'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              submissionId: { type: 'string' },
              artifactId: { type: 'string' },
              contentHash: { type: 'string' },
              sizeBytes: { type: 'number' },
              submittedAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const paramResult = uploadIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid upload ID', {
          issues: paramResult.error.issues,
        });
      }

      const bodyResult = completeUploadSchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new ValidationError('Invalid request body', {
          issues: bodyResult.error.issues,
        });
      }

      const { id: uploadId } = paramResult.data;
      const { parts: clientParts, totalHash } = bodyResult.data;

      // Get upload session
      const upload = pendingUploads.get(uploadId);
      if (!upload) {
        throw new NotFoundError('Upload session', uploadId);
      }

      // Verify ownership
      if (upload.userId !== userId) {
        throw new ForbiddenError('Not authorized to complete this upload');
      }

      // Check if expired
      if (upload.expiresAt < new Date()) {
        pendingUploads.delete(uploadId);
        throw new ConflictError('Upload session has expired');
      }

      // Check if already completed
      if (upload.completed) {
        throw new ConflictError('Upload already completed');
      }

      // Verify all parts uploaded
      if (upload.parts.length !== upload.partCount) {
        throw new ValidationError(
          `Upload incomplete: ${upload.parts.length}/${upload.partCount} parts uploaded`
        );
      }

      // Verify client-provided parts match server-side parts
      for (const clientPart of clientParts) {
        const serverPart = upload.parts.find((p) => p.partNumber === clientPart.partNumber);
        if (!serverPart) {
          throw new ValidationError(`Part ${clientPart.partNumber} not found on server`);
        }
        if (serverPart.hash !== clientPart.hash) {
          throw new ValidationError(
            `Hash mismatch for part ${clientPart.partNumber}: client=${clientPart.hash}, server=${serverPart.hash}`
          );
        }
      }

      // Calculate total size
      const totalSize = upload.parts.reduce((sum, p) => sum + p.size, 0);

      // Verify match is still submittable
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, upload.matchId));

      if (!match) {
        throw new NotFoundError('Match', upload.matchId);
      }

      if (!canSubmit(match.status)) {
        throw new ConflictError(
          `Cannot submit to match with status '${match.status}'. Match must be 'in_progress'.`
        );
      }

      // Create manifest for the artifact
      const manifest = {
        filename: upload.filename,
        totalSize,
        partCount: upload.partCount,
        parts: upload.parts.map((p) => ({
          partNumber: p.partNumber,
          size: p.size,
          hash: p.hash,
        })),
        uploadedAt: new Date().toISOString(),
        clientType: upload.clientType,
        clientVersion: upload.clientVersion,
      };

      // Create artifact record
      const [artifact] = await db
        .insert(artifacts)
        .values({
          contentHash: totalHash,
          storageKey: upload.storageKey,
          sizeBytes: totalSize,
          manifestJson: manifest,
          secretScanStatus: 'pending',
        })
        .onConflictDoNothing({ target: artifacts.contentHash })
        .returning();

      // If artifact already exists (same hash), get it
      let finalArtifact = artifact;
      if (!finalArtifact) {
        const [existingArtifact] = await db
          .select()
          .from(artifacts)
          .where(eq(artifacts.contentHash, totalHash));
        finalArtifact = existingArtifact;
      }

      // Create submission record
      const [submission] = await db
        .insert(submissions)
        .values({
          matchId: upload.matchId,
          userId,
          method: 'zip',
          artifactId: finalArtifact.id,
          clientType: upload.clientType,
          clientVersion: upload.clientVersion,
        })
        .returning();

      // Update participant with submission reference
      await db
        .update(matchParticipants)
        .set({ submissionId: submission.id })
        .where(
          and(
            eq(matchParticipants.matchId, upload.matchId),
            eq(matchParticipants.userId, userId)
          )
        );

      // Mark upload as completed
      upload.completed = true;

      // Clean up from pending uploads after a short delay
      setTimeout(() => {
        pendingUploads.delete(uploadId);
      }, 5 * 60 * 1000); // Keep for 5 minutes for debugging

      return {
        submissionId: submission.id,
        artifactId: finalArtifact.id,
        contentHash: finalArtifact.contentHash,
        sizeBytes: finalArtifact.sizeBytes,
        submittedAt: submission.submittedAt.toISOString(),
      };
    }
  );

  /**
   * GET /api/uploads/:id/status
   * Get upload progress and status
   */
  app.get(
    '/api/uploads/:id/status',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              uploadId: { type: 'string' },
              matchId: { type: 'string' },
              filename: { type: 'string' },
              totalSize: { type: 'number' },
              uploadedSize: { type: 'number' },
              partsUploaded: { type: 'number' },
              totalParts: { type: 'number' },
              progress: { type: 'number' },
              completed: { type: 'boolean' },
              expiresAt: { type: 'string' },
              parts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    partNumber: { type: 'number' },
                    size: { type: 'number' },
                    hash: { type: 'string' },
                    uploadedAt: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const paramResult = uploadIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid upload ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id: uploadId } = paramResult.data;

      // Get upload session
      const upload = pendingUploads.get(uploadId);
      if (!upload) {
        throw new NotFoundError('Upload session', uploadId);
      }

      // Verify ownership
      if (upload.userId !== userId) {
        throw new ForbiddenError('Not authorized to view this upload');
      }

      const uploadedSize = upload.parts.reduce((sum, p) => sum + p.size, 0);
      const progress = upload.totalSize > 0 ? (uploadedSize / upload.totalSize) * 100 : 0;

      return {
        uploadId: upload.id,
        matchId: upload.matchId,
        filename: upload.filename,
        totalSize: upload.totalSize,
        uploadedSize,
        partsUploaded: upload.parts.length,
        totalParts: upload.partCount,
        progress: Math.round(progress * 100) / 100,
        completed: upload.completed,
        expiresAt: upload.expiresAt.toISOString(),
        parts: upload.parts.map((p) => ({
          partNumber: p.partNumber,
          size: p.size,
          hash: p.hash,
          uploadedAt: p.uploadedAt.toISOString(),
        })),
      };
    }
  );

  /**
   * DELETE /api/uploads/:id
   * Cancel/abort an upload
   */
  app.delete(
    '/api/uploads/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              uploadId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const paramResult = uploadIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid upload ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id: uploadId } = paramResult.data;

      // Get upload session
      const upload = pendingUploads.get(uploadId);
      if (!upload) {
        throw new NotFoundError('Upload session', uploadId);
      }

      // Verify ownership
      if (upload.userId !== userId) {
        throw new ForbiddenError('Not authorized to cancel this upload');
      }

      // Remove from pending uploads
      pendingUploads.delete(uploadId);

      // In production, would also delete any uploaded parts from S3

      return {
        message: 'Upload cancelled successfully',
        uploadId,
      };
    }
  );

  /**
   * GET /api/matches/:id/submissions
   * List submissions for a match
   */
  app.get(
    '/api/matches/:id/submissions',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    userId: { type: 'string' },
                    method: { type: 'string' },
                    submittedAt: { type: 'string' },
                    lockedAt: { type: ['string', 'null'] },
                    artifact: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        contentHash: { type: 'string' },
                        sizeBytes: { type: 'number' },
                        secretScanStatus: { type: 'string' },
                      },
                    },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        displayName: { type: 'string' },
                        avatarUrl: { type: ['string', 'null'] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramResult = matchIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid match ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id: matchId } = paramResult.data;

      // Verify match exists
      const [match] = await db.select().from(matches).where(eq(matches.id, matchId));

      if (!match) {
        throw new NotFoundError('Match', matchId);
      }

      // Get submissions with artifact and user details
      const submissionList = await db
        .select({
          id: submissions.id,
          userId: submissions.userId,
          method: submissions.method,
          submittedAt: submissions.submittedAt,
          lockedAt: submissions.lockedAt,
          artifact: {
            id: artifacts.id,
            contentHash: artifacts.contentHash,
            sizeBytes: artifacts.sizeBytes,
            secretScanStatus: artifacts.secretScanStatus,
          },
          user: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(submissions)
        .innerJoin(artifacts, eq(submissions.artifactId, artifacts.id))
        .innerJoin(users, eq(submissions.userId, users.id))
        .where(eq(submissions.matchId, matchId))
        .orderBy(desc(submissions.submittedAt));

      return {
        data: submissionList.map((s) => ({
          id: s.id,
          userId: s.userId,
          method: s.method,
          submittedAt: s.submittedAt.toISOString(),
          lockedAt: s.lockedAt?.toISOString() || null,
          artifact: s.artifact,
          user: s.user,
        })),
      };
    }
  );

  /**
   * GET /api/submissions/:id
   * Get single submission details
   */
  app.get(
    '/api/submissions/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  matchId: { type: 'string' },
                  userId: { type: 'string' },
                  method: { type: 'string' },
                  submittedAt: { type: 'string' },
                  lockedAt: { type: ['string', 'null'] },
                  clientType: { type: ['string', 'null'] },
                  clientVersion: { type: ['string', 'null'] },
                  sourceRef: { type: ['string', 'null'] },
                  artifact: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      contentHash: { type: 'string' },
                      sizeBytes: { type: 'number' },
                      secretScanStatus: { type: 'string' },
                      manifestJson: { type: 'object' },
                    },
                  },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      displayName: { type: 'string' },
                      avatarUrl: { type: ['string', 'null'] },
                    },
                  },
                  match: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      status: { type: 'string' },
                      challenge: {
                        type: 'object',
                        properties: {
                          title: { type: 'string' },
                          slug: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramResult = submissionIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid submission ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id: submissionId } = paramResult.data;

      // Get submission with all details
      const [submission] = await db
        .select({
          id: submissions.id,
          matchId: submissions.matchId,
          userId: submissions.userId,
          method: submissions.method,
          submittedAt: submissions.submittedAt,
          lockedAt: submissions.lockedAt,
          clientType: submissions.clientType,
          clientVersion: submissions.clientVersion,
          sourceRef: submissions.sourceRef,
          artifact: {
            id: artifacts.id,
            contentHash: artifacts.contentHash,
            sizeBytes: artifacts.sizeBytes,
            secretScanStatus: artifacts.secretScanStatus,
            manifestJson: artifacts.manifestJson,
          },
          user: {
            id: users.id,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
          matchStatus: matches.status,
          challengeTitle: challenges.title,
          challengeSlug: challenges.slug,
        })
        .from(submissions)
        .innerJoin(artifacts, eq(submissions.artifactId, artifacts.id))
        .innerJoin(users, eq(submissions.userId, users.id))
        .innerJoin(matches, eq(submissions.matchId, matches.id))
        .innerJoin(challengeVersions, eq(matches.challengeVersionId, challengeVersions.id))
        .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
        .where(eq(submissions.id, submissionId));

      if (!submission) {
        throw new NotFoundError('Submission', submissionId);
      }

      return {
        data: {
          id: submission.id,
          matchId: submission.matchId,
          userId: submission.userId,
          method: submission.method,
          submittedAt: submission.submittedAt.toISOString(),
          lockedAt: submission.lockedAt?.toISOString() || null,
          clientType: submission.clientType,
          clientVersion: submission.clientVersion,
          sourceRef: submission.sourceRef,
          artifact: submission.artifact,
          user: submission.user,
          match: {
            id: submission.matchId,
            status: submission.matchStatus,
            challenge: {
              title: submission.challengeTitle,
              slug: submission.challengeSlug,
            },
          },
        },
      };
    }
  );

  /**
   * POST /api/submissions/:id/lock
   * Lock a submission (makes it immutable)
   */
  app.post(
    '/api/submissions/:id/lock',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              lockedAt: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const paramResult = submissionIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid submission ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id: submissionId } = paramResult.data;

      // Get submission
      const [submission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, submissionId));

      if (!submission) {
        throw new NotFoundError('Submission', submissionId);
      }

      // Verify ownership
      if (submission.userId !== userId) {
        throw new ForbiddenError('Not authorized to lock this submission');
      }

      // Check if already locked
      if (submission.lockedAt) {
        throw new ConflictError('Submission is already locked');
      }

      // Lock the submission
      const now = new Date();
      await db
        .update(submissions)
        .set({ lockedAt: now })
        .where(eq(submissions.id, submissionId));

      return {
        id: submissionId,
        lockedAt: now.toISOString(),
        message: 'Submission locked successfully. It can no longer be modified.',
      };
    }
  );

  /**
   * POST /api/matches/:id/submissions/lock
   * Lock a submission by match ID (used by extension)
   */
  app.post(
    '/api/matches/:id/submissions/lock',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              lockedAt: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);

      const paramResult = matchIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        throw new ValidationError('Invalid match ID', {
          issues: paramResult.error.issues,
        });
      }

      const { id: matchId } = paramResult.data;

      // Find the user's submission for this match
      const [submission] = await db
        .select()
        .from(submissions)
        .where(
          and(
            eq(submissions.matchId, matchId),
            eq(submissions.userId, userId)
          )
        );

      if (!submission) {
        throw new NotFoundError('Submission for this match');
      }

      // Check if already locked
      if (submission.lockedAt) {
        return {
          lockedAt: submission.lockedAt.toISOString(),
          message: 'Submission was already locked.',
        };
      }

      // Verify match is still in progress
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId));

      if (!match) {
        throw new NotFoundError('Match', matchId);
      }

      if (match.status !== 'in_progress') {
        throw new ConflictError(`Cannot lock submission: match status is '${match.status}'`);
      }

      // Lock the submission
      const now = new Date();
      await db
        .update(submissions)
        .set({ lockedAt: now })
        .where(eq(submissions.id, submission.id));

      return {
        lockedAt: now.toISOString(),
        message: 'Submission locked successfully. It can no longer be modified.',
      };
    }
  );

  /**
   * GET /api/artifacts/:id
   * Get artifact details including secret scan status
   */
  app.get(
    '/api/artifacts/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              contentHash: { type: 'string' },
              storageKey: { type: 'string' },
              sizeBytes: { type: 'number' },
              createdAt: { type: 'string' },
              secretScanStatus: { type: 'string' },
              manifestJson: { type: 'object' },
              isPublicBlocked: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { id: string };

      const [artifact] = await db
        .select()
        .from(artifacts)
        .where(eq(artifacts.id, params.id));

      if (!artifact) {
        throw new NotFoundError('Artifact', params.id);
      }

      // Block public viewing if flagged
      const isPublicBlocked = artifact.secretScanStatus === 'flagged';

      return {
        id: artifact.id,
        contentHash: artifact.contentHash,
        storageKey: artifact.storageKey,
        sizeBytes: artifact.sizeBytes,
        createdAt: artifact.createdAt.toISOString(),
        secretScanStatus: artifact.secretScanStatus,
        manifestJson: artifact.manifestJson,
        isPublicBlocked,
      };
    }
  );

  /**
   * POST /api/artifacts/:id/scan
   * Trigger secret scan on an artifact (admin/internal use)
   * In production, this would be triggered automatically via queue
   */
  app.post(
    '/api/artifacts/:id/scan',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              artifactId: { type: 'string' },
              status: { type: 'string' },
              findingsCount: { type: 'number' },
              summary: { type: 'string' },
              isPublicBlocked: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { id: string };

      const [artifact] = await db
        .select()
        .from(artifacts)
        .where(eq(artifacts.id, params.id));

      if (!artifact) {
        throw new NotFoundError('Artifact', params.id);
      }

      // In a real implementation, we would:
      // 1. Download the artifact from S3
      // 2. Extract the zip
      // 3. Scan each file for secrets
      // 4. Update the artifact record with scan results

      // For now, simulate based on manifest content
      const manifest = artifact.manifestJson as any;
      const files = manifest?.files || manifest?.parts || [];

      // Mock scan result - in production, use the artifact processor
      const mockScanResult: SecretScanResult = {
        status: 'clean',
        findings: [],
        scannedAt: new Date().toISOString(),
        scannedFiles: files.length,
        skippedFiles: 0,
      };

      // Check file names for obvious issues
      for (const file of files) {
        const filePath = file.path || file.filename || '';
        if (
          filePath.includes('.env') ||
          filePath.includes('credentials') ||
          filePath.includes('secret')
        ) {
          mockScanResult.status = 'flagged';
          mockScanResult.findings.push({
            file: filePath,
            type: 'credential_file',
            severity: 'high',
            description: 'Potentially sensitive file detected',
          });
        }
      }

      // Update artifact with scan results
      await db
        .update(artifacts)
        .set({
          secretScanStatus: mockScanResult.status,
        })
        .where(eq(artifacts.id, params.id));

      const summary = getSecretSummary(mockScanResult);
      const isPublicBlocked = shouldBlockPublicViewing(mockScanResult);

      return {
        artifactId: artifact.id,
        status: mockScanResult.status,
        findingsCount: mockScanResult.findings.length,
        summary,
        isPublicBlocked,
      };
    }
  );
}
