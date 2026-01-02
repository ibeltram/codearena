import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';

import { db, schema } from '../../db';
import { NotFoundError, ValidationError, ConflictError } from '../../lib/errors';
import { type UserRole } from '../../plugins';

const { challenges, challengeVersions } = schema;

// Request body schemas
const createChallengeSchema = z.object({
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/),
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  category: z.enum(['frontend', 'backend', 'fullstack', 'algorithm', 'devops']),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
});

const updateChallengeSchema = z.object({
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/).optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).optional(),
  category: z.enum(['frontend', 'backend', 'fullstack', 'algorithm', 'devops']).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
});

const createVersionSchema = z.object({
  requirementsJson: z.record(z.unknown()),
  rubricJson: z.record(z.unknown()),
  constraintsJson: z.record(z.unknown()),
  templateRef: z.string().optional(),
  judgeImageRef: z.string().optional(),
});

const challengeIdParamSchema = z.object({
  id: z.string().uuid(),
});

const versionIdParamSchema = z.object({
  versionId: z.string().uuid(),
});

// Admin routes require admin role
const ADMIN_ROLES: UserRole[] = ['admin'];

export async function adminChallengeRoutes(app: FastifyInstance) {
  // Apply authentication and admin role check to all routes in this plugin
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole(ADMIN_ROLES));

  // GET /api/admin/challenges/:id - Get a single challenge with all versions for admin editing
  app.get('/api/admin/challenges/:id', async (request: FastifyRequest) => {
    const paramResult = challengeIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid challenge ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    // Get the challenge
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, id));

    if (!challenge) {
      throw new NotFoundError('Challenge', id);
    }

    // Get all versions for this challenge
    const versions = await db
      .select()
      .from(challengeVersions)
      .where(eq(challengeVersions.challengeId, id))
      .orderBy(sql`${challengeVersions.versionNumber} DESC`);

    return {
      ...challenge,
      versions,
    };
  });

  // POST /api/admin/challenges - Create a new challenge
  app.post('/api/admin/challenges', async (request: FastifyRequest) => {
    const bodyResult = createChallengeSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw new ValidationError('Invalid challenge data', {
        issues: bodyResult.error.issues,
      });
    }

    const { slug, title, description, category, difficulty } = bodyResult.data;

    // Check if slug already exists
    const [existingChallenge] = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(eq(challenges.slug, slug));

    if (existingChallenge) {
      throw new ConflictError(`Challenge with slug '${slug}' already exists`);
    }

    // Get user ID from authenticated session
    const createdBy = request.user!.id;

    const [newChallenge] = await db
      .insert(challenges)
      .values({
        slug,
        title,
        description,
        category,
        difficulty,
        createdBy,
        isPublished: false,
      })
      .returning();

    return {
      message: 'Challenge created successfully',
      challenge: newChallenge,
    };
  });

  // PATCH /api/admin/challenges/:id - Update a challenge
  app.patch('/api/admin/challenges/:id', async (request: FastifyRequest) => {
    const paramResult = challengeIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid challenge ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = updateChallengeSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw new ValidationError('Invalid update data', {
        issues: bodyResult.error.issues,
      });
    }

    const { id } = paramResult.data;
    const updates = bodyResult.data;

    // Check if challenge exists
    const [existingChallenge] = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(eq(challenges.id, id));

    if (!existingChallenge) {
      throw new NotFoundError('Challenge', id);
    }

    // Check slug uniqueness if updating slug
    if (updates.slug) {
      const [slugConflict] = await db
        .select({ id: challenges.id })
        .from(challenges)
        .where(eq(challenges.slug, updates.slug));

      if (slugConflict && slugConflict.id !== id) {
        throw new ConflictError(`Challenge with slug '${updates.slug}' already exists`);
      }
    }

    const [updatedChallenge] = await db
      .update(challenges)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(challenges.id, id))
      .returning();

    return {
      message: 'Challenge updated successfully',
      challenge: updatedChallenge,
    };
  });

  // POST /api/admin/challenges/:id/publish - Publish a challenge
  app.post('/api/admin/challenges/:id/publish', async (request: FastifyRequest) => {
    const paramResult = challengeIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid challenge ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    // Check if challenge exists and has at least one version
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, id));

    if (!challenge) {
      throw new NotFoundError('Challenge', id);
    }

    // Check for at least one version
    const [versionCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(challengeVersions)
      .where(eq(challengeVersions.challengeId, id));

    if (!versionCount || versionCount.count === 0) {
      throw new ValidationError('Challenge must have at least one version before publishing');
    }

    if (challenge.isPublished) {
      return {
        message: 'Challenge is already published',
        challenge,
      };
    }

    const [updatedChallenge] = await db
      .update(challenges)
      .set({
        isPublished: true,
        updatedAt: new Date(),
      })
      .where(eq(challenges.id, id))
      .returning();

    return {
      message: 'Challenge published successfully',
      challenge: updatedChallenge,
    };
  });

  // POST /api/admin/challenges/:id/unpublish - Unpublish a challenge
  app.post('/api/admin/challenges/:id/unpublish', async (request: FastifyRequest) => {
    const paramResult = challengeIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid challenge ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, id));

    if (!challenge) {
      throw new NotFoundError('Challenge', id);
    }

    if (!challenge.isPublished) {
      return {
        message: 'Challenge is already unpublished',
        challenge,
      };
    }

    const [updatedChallenge] = await db
      .update(challenges)
      .set({
        isPublished: false,
        updatedAt: new Date(),
      })
      .where(eq(challenges.id, id))
      .returning();

    return {
      message: 'Challenge unpublished successfully',
      challenge: updatedChallenge,
    };
  });

  // POST /api/admin/challenges/:id/versions - Create a new version
  app.post('/api/admin/challenges/:id/versions', async (request: FastifyRequest) => {
    const paramResult = challengeIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid challenge ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = createVersionSchema.safeParse(request.body);

    if (!bodyResult.success) {
      throw new ValidationError('Invalid version data', {
        issues: bodyResult.error.issues,
      });
    }

    const { id } = paramResult.data;
    const { requirementsJson, rubricJson, constraintsJson, templateRef, judgeImageRef } = bodyResult.data;

    // Check if challenge exists
    const [challenge] = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(eq(challenges.id, id));

    if (!challenge) {
      throw new NotFoundError('Challenge', id);
    }

    // Get the next version number
    const [latestVersion] = await db
      .select({ versionNumber: challengeVersions.versionNumber })
      .from(challengeVersions)
      .where(eq(challengeVersions.challengeId, id))
      .orderBy(sql`${challengeVersions.versionNumber} DESC`)
      .limit(1);

    const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    const [newVersion] = await db
      .insert(challengeVersions)
      .values({
        challengeId: id,
        versionNumber: nextVersionNumber,
        requirementsJson,
        rubricJson,
        constraintsJson,
        templateRef: templateRef || null,
        judgeImageRef: judgeImageRef || null,
      })
      .returning();

    return {
      message: 'Challenge version created successfully',
      version: newVersion,
    };
  });

  // POST /api/admin/challenge-versions/:versionId/publish - Publish a specific version
  app.post('/api/admin/challenge-versions/:versionId/publish', async (request: FastifyRequest) => {
    const paramResult = versionIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid version ID', {
        issues: paramResult.error.issues,
      });
    }

    const { versionId } = paramResult.data;

    const [version] = await db
      .select()
      .from(challengeVersions)
      .where(eq(challengeVersions.id, versionId));

    if (!version) {
      throw new NotFoundError('Challenge Version', versionId);
    }

    if (version.publishedAt) {
      return {
        message: 'Version is already published',
        version,
      };
    }

    const [updatedVersion] = await db
      .update(challengeVersions)
      .set({
        publishedAt: new Date(),
      })
      .where(eq(challengeVersions.id, versionId))
      .returning();

    return {
      message: 'Version published successfully',
      version: updatedVersion,
    };
  });

  // POST /api/admin/challenges/:id/set-default-version - Set the default version for a challenge
  app.post('/api/admin/challenges/:id/set-default-version', async (request: FastifyRequest) => {
    const paramResult = challengeIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid challenge ID', {
        issues: paramResult.error.issues,
      });
    }

    const bodyResult = z.object({ versionId: z.string().uuid() }).safeParse(request.body);

    if (!bodyResult.success) {
      throw new ValidationError('Invalid version ID', {
        issues: bodyResult.error.issues,
      });
    }

    const { id } = paramResult.data;
    const { versionId } = bodyResult.data;

    // Check if challenge exists
    const [challenge] = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(eq(challenges.id, id));

    if (!challenge) {
      throw new NotFoundError('Challenge', id);
    }

    // Check if version exists and belongs to this challenge
    const [version] = await db
      .select()
      .from(challengeVersions)
      .where(eq(challengeVersions.id, versionId));

    if (!version) {
      throw new NotFoundError('Challenge Version', versionId);
    }

    if (version.challengeId !== id) {
      throw new ValidationError('Version does not belong to this challenge');
    }

    // Version must be published to be set as default
    if (!version.publishedAt) {
      throw new ValidationError('Only published versions can be set as default');
    }

    const [updatedChallenge] = await db
      .update(challenges)
      .set({
        defaultVersionId: versionId,
        updatedAt: new Date(),
      })
      .where(eq(challenges.id, id))
      .returning();

    return {
      message: 'Default version set successfully',
      challenge: updatedChallenge,
    };
  });

  // DELETE /api/admin/challenges/:id - Delete a challenge (soft delete not implemented, hard delete for now)
  app.delete('/api/admin/challenges/:id', async (request: FastifyRequest) => {
    const paramResult = challengeIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid challenge ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, id));

    if (!challenge) {
      throw new NotFoundError('Challenge', id);
    }

    // Delete challenge (cascade will delete versions)
    await db.delete(challenges).where(eq(challenges.id, id));

    return {
      message: 'Challenge deleted successfully',
      challengeId: id,
    };
  });
}
