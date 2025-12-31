import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, ilike, sql, count } from 'drizzle-orm';

import { db, schema } from '../db';
import { NotFoundError, ValidationError } from '../lib/errors';

const { challenges, challengeVersions } = schema;

// Query parameter schemas
const listChallengesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(['frontend', 'backend', 'fullstack', 'algorithm', 'devops']).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  search: z.string().optional(),
  sort: z.enum(['newest', 'oldest', 'popular', 'title']).default('newest'),
  includeUnpublished: z.coerce.boolean().default(false),
});

const challengeIdParamSchema = z.object({
  id: z.string().uuid(),
});

const versionIdParamSchema = z.object({
  versionId: z.string().uuid(),
});

const challengeSlugParamSchema = z.object({
  slug: z.string().min(1).max(100),
});

// Response types
interface ChallengeWithVersion {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  latestVersion?: {
    id: string;
    versionNumber: number;
    templateRef: string | null;
    publishedAt: Date | null;
  };
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function challengeRoutes(app: FastifyInstance) {
  // GET /api/challenges - List challenges with pagination and filters
  app.get('/api/challenges', async (request: FastifyRequest, reply: FastifyReply): Promise<PaginatedResponse<ChallengeWithVersion>> => {
    const queryResult = listChallengesQuerySchema.safeParse(request.query);

    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: queryResult.error.issues,
      });
    }

    const { page, limit, category, difficulty, search, sort, includeUnpublished } = queryResult.data;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions = [];

    // Only show published challenges unless includeUnpublished is true (for admins)
    if (!includeUnpublished) {
      conditions.push(eq(challenges.isPublished, true));
    }

    if (category) {
      conditions.push(eq(challenges.category, category));
    }

    if (difficulty) {
      conditions.push(eq(challenges.difficulty, difficulty));
    }

    if (search) {
      conditions.push(
        sql`(${challenges.title} ILIKE ${`%${search}%`} OR ${challenges.description} ILIKE ${`%${search}%`})`
      );
    }

    // Build ORDER BY
    let orderBy;
    switch (sort) {
      case 'oldest':
        orderBy = asc(challenges.createdAt);
        break;
      case 'title':
        orderBy = asc(challenges.title);
        break;
      case 'popular':
        // For now, sort by newest as we don't have match counts yet
        orderBy = desc(challenges.createdAt);
        break;
      case 'newest':
      default:
        orderBy = desc(challenges.createdAt);
    }

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(challenges)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult?.total ?? 0;

    // Get challenges
    const challengesList = await db
      .select({
        id: challenges.id,
        slug: challenges.slug,
        title: challenges.title,
        description: challenges.description,
        category: challenges.category,
        difficulty: challenges.difficulty,
        isPublished: challenges.isPublished,
        createdAt: challenges.createdAt,
        updatedAt: challenges.updatedAt,
      })
      .from(challenges)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Get latest version for each challenge
    const challengesWithVersions: ChallengeWithVersion[] = await Promise.all(
      challengesList.map(async (challenge) => {
        const [latestVersion] = await db
          .select({
            id: challengeVersions.id,
            versionNumber: challengeVersions.versionNumber,
            templateRef: challengeVersions.templateRef,
            publishedAt: challengeVersions.publishedAt,
          })
          .from(challengeVersions)
          .where(eq(challengeVersions.challengeId, challenge.id))
          .orderBy(desc(challengeVersions.versionNumber))
          .limit(1);

        return {
          ...challenge,
          latestVersion: latestVersion || undefined,
        };
      })
    );

    return {
      data: challengesWithVersions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // GET /api/challenges/slug/:slug - Get challenge by slug
  app.get('/api/challenges/slug/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = challengeSlugParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid challenge slug', {
        issues: paramResult.error.issues,
      });
    }

    const { slug } = paramResult.data;

    // Get challenge by slug
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.slug, slug));

    if (!challenge) {
      throw new NotFoundError('Challenge', slug);
    }

    // Get latest published version
    const [latestVersion] = await db
      .select()
      .from(challengeVersions)
      .where(eq(challengeVersions.challengeId, challenge.id))
      .orderBy(desc(challengeVersions.versionNumber))
      .limit(1);

    // Get version count
    const [versionCount] = await db
      .select({ count: count() })
      .from(challengeVersions)
      .where(eq(challengeVersions.challengeId, challenge.id));

    return {
      ...challenge,
      latestVersion: latestVersion || null,
      versionCount: versionCount?.count ?? 0,
    };
  });

  // GET /api/challenges/:id - Get challenge details with latest version
  app.get('/api/challenges/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = challengeIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid challenge ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    // Get challenge
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, id));

    if (!challenge) {
      throw new NotFoundError('Challenge', id);
    }

    // Get latest published version (or latest version if admin)
    const [latestVersion] = await db
      .select()
      .from(challengeVersions)
      .where(eq(challengeVersions.challengeId, id))
      .orderBy(desc(challengeVersions.versionNumber))
      .limit(1);

    // Get version count
    const [versionCount] = await db
      .select({ count: count() })
      .from(challengeVersions)
      .where(eq(challengeVersions.challengeId, id));

    return {
      ...challenge,
      latestVersion: latestVersion || null,
      versionCount: versionCount?.count ?? 0,
    };
  });

  // GET /api/challenges/:id/versions - Get all versions of a challenge
  app.get('/api/challenges/:id/versions', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = challengeIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid challenge ID', {
        issues: paramResult.error.issues,
      });
    }

    const { id } = paramResult.data;

    // Verify challenge exists
    const [challenge] = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(eq(challenges.id, id));

    if (!challenge) {
      throw new NotFoundError('Challenge', id);
    }

    // Get all versions
    const versions = await db
      .select()
      .from(challengeVersions)
      .where(eq(challengeVersions.challengeId, id))
      .orderBy(desc(challengeVersions.versionNumber));

    return {
      challengeId: id,
      versions,
    };
  });

  // GET /api/challenge-versions/:versionId - Get specific version details
  app.get('/api/challenge-versions/:versionId', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramResult = versionIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      throw new ValidationError('Invalid version ID', {
        issues: paramResult.error.issues,
      });
    }

    const { versionId } = paramResult.data;

    // Get version with challenge info
    const [version] = await db
      .select({
        version: challengeVersions,
        challenge: {
          id: challenges.id,
          slug: challenges.slug,
          title: challenges.title,
          category: challenges.category,
          difficulty: challenges.difficulty,
        },
      })
      .from(challengeVersions)
      .innerJoin(challenges, eq(challengeVersions.challengeId, challenges.id))
      .where(eq(challengeVersions.id, versionId));

    if (!version) {
      throw new NotFoundError('Challenge Version', versionId);
    }

    return {
      ...version.version,
      challenge: version.challenge,
    };
  });

  // GET /api/challenges/categories - Get available categories with counts
  app.get('/api/challenges/categories', async () => {
    const categories = await db
      .select({
        category: challenges.category,
        count: count(),
      })
      .from(challenges)
      .where(eq(challenges.isPublished, true))
      .groupBy(challenges.category);

    return { categories };
  });

  // GET /api/challenges/difficulties - Get available difficulties with counts
  app.get('/api/challenges/difficulties', async () => {
    const difficulties = await db
      .select({
        difficulty: challenges.difficulty,
        count: count(),
      })
      .from(challenges)
      .where(eq(challenges.isPublished, true))
      .groupBy(challenges.difficulty);

    return { difficulties };
  });
}
