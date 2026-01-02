import { pool } from './index';

/**
 * Materialized Views for CodeArena
 *
 * These views are pre-computed for performance on frequently accessed data.
 * They should be refreshed periodically based on data staleness requirements.
 */

/**
 * Create all materialized views
 * Should be called during database initialization/migration
 */
export async function createMaterializedViews(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Leaderboard materialized view
    await client.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leaderboard AS
      SELECT
        r.id AS ranking_id,
        r.user_id,
        r.season_id,
        r.rating,
        r.deviation,
        r.volatility,
        u.display_name,
        u.avatar_url,
        s.name AS season_name,
        s.status AS season_status,
        RANK() OVER (PARTITION BY r.season_id ORDER BY r.rating DESC) AS rank,
        COUNT(DISTINCT mp.match_id) AS total_matches,
        COUNT(DISTINCT CASE WHEN mp.submission_id IS NOT NULL THEN mp.match_id END) AS completed_matches,
        r.updated_at
      FROM rankings r
      JOIN users u ON u.id = r.user_id
      JOIN seasons s ON s.id = r.season_id
      LEFT JOIN match_participants mp ON mp.user_id = r.user_id
      GROUP BY r.id, r.user_id, r.season_id, r.rating, r.deviation, r.volatility,
               u.display_name, u.avatar_url, s.name, s.status, r.updated_at
      WITH NO DATA;
    `);

    // Create unique index for concurrent refresh
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mv_leaderboard_ranking_id_idx
      ON mv_leaderboard (ranking_id);
    `);

    // Index for common queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS mv_leaderboard_season_rank_idx
      ON mv_leaderboard (season_id, rank);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS mv_leaderboard_user_season_idx
      ON mv_leaderboard (user_id, season_id);
    `);

    // Challenge statistics materialized view
    await client.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS mv_challenge_stats AS
      SELECT
        c.id AS challenge_id,
        c.slug,
        c.title,
        c.category,
        c.difficulty,
        c.is_published,
        COUNT(DISTINCT m.id) AS total_matches,
        COUNT(DISTINCT CASE WHEN m.status = 'finalized' THEN m.id END) AS completed_matches,
        COUNT(DISTINCT mp.user_id) AS unique_participants,
        AVG(CASE WHEN m.status = 'finalized' THEN EXTRACT(EPOCH FROM (m.end_at - m.start_at)) END) AS avg_match_duration_seconds,
        c.created_at,
        c.updated_at
      FROM challenges c
      LEFT JOIN challenge_versions cv ON cv.challenge_id = c.id
      LEFT JOIN matches m ON m.challenge_version_id = cv.id
      LEFT JOIN match_participants mp ON mp.match_id = m.id
      GROUP BY c.id, c.slug, c.title, c.category, c.difficulty, c.is_published, c.created_at, c.updated_at
      WITH NO DATA;
    `);

    // Unique index for concurrent refresh
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mv_challenge_stats_challenge_id_idx
      ON mv_challenge_stats (challenge_id);
    `);

    // User stats materialized view
    await client.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_stats AS
      SELECT
        u.id AS user_id,
        u.display_name,
        u.avatar_url,
        u.created_at AS member_since,
        COUNT(DISTINCT mp.match_id) AS total_matches,
        COUNT(DISTINCT CASE WHEN sc.id IS NOT NULL THEN mp.match_id END) AS scored_matches,
        COALESCE(AVG(sc.total_score), 0) AS avg_score,
        COALESCE(MAX(sc.total_score), 0) AS best_score,
        ca.balance_available AS credits_available,
        ca.balance_reserved AS credits_reserved
      FROM users u
      LEFT JOIN match_participants mp ON mp.user_id = u.id
      LEFT JOIN scores sc ON sc.user_id = u.id AND sc.match_id = mp.match_id
      LEFT JOIN credit_accounts ca ON ca.user_id = u.id
      GROUP BY u.id, u.display_name, u.avatar_url, u.created_at, ca.balance_available, ca.balance_reserved
      WITH NO DATA;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mv_user_stats_user_id_idx
      ON mv_user_stats (user_id);
    `);

    await client.query('COMMIT');
    console.log('[Materialized Views] All views created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Materialized Views] Failed to create views:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Refresh a specific materialized view
 * Use CONCURRENTLY to avoid locking (requires unique index)
 */
export async function refreshMaterializedView(viewName: string, concurrent: boolean = true): Promise<void> {
  const client = await pool.connect();

  try {
    const refreshCommand = concurrent
      ? `REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`
      : `REFRESH MATERIALIZED VIEW ${viewName}`;

    const startTime = Date.now();
    await client.query(refreshCommand);
    const duration = Date.now() - startTime;

    console.log(`[Materialized Views] Refreshed ${viewName} in ${duration}ms (concurrent: ${concurrent})`);
  } catch (error) {
    console.error(`[Materialized Views] Failed to refresh ${viewName}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Refresh all materialized views
 * Should be called periodically (e.g., every 5 minutes via cron)
 */
export async function refreshAllMaterializedViews(): Promise<void> {
  const views = ['mv_leaderboard', 'mv_challenge_stats', 'mv_user_stats'];

  console.log('[Materialized Views] Starting refresh of all views...');

  for (const view of views) {
    try {
      await refreshMaterializedView(view, true);
    } catch (error) {
      // If concurrent refresh fails (first time with no data), try non-concurrent
      console.log(`[Materialized Views] Trying non-concurrent refresh for ${view}...`);
      await refreshMaterializedView(view, false);
    }
  }

  console.log('[Materialized Views] All views refreshed successfully');
}

/**
 * Get leaderboard data from materialized view
 */
export interface LeaderboardEntry {
  rankingId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  deviation: number;
  rank: number;
  totalMatches: number;
  completedMatches: number;
}

export async function getLeaderboard(
  seasonId: string,
  limit: number = 100,
  offset: number = 0
): Promise<LeaderboardEntry[]> {
  const client = await pool.connect();

  try {
    const result = await client.query<LeaderboardEntry>(
      `
      SELECT
        ranking_id AS "rankingId",
        user_id AS "userId",
        display_name AS "displayName",
        avatar_url AS "avatarUrl",
        rating,
        deviation,
        rank,
        total_matches AS "totalMatches",
        completed_matches AS "completedMatches"
      FROM mv_leaderboard
      WHERE season_id = $1
      ORDER BY rank ASC
      LIMIT $2 OFFSET $3
      `,
      [seasonId, limit, offset]
    );

    return result.rows;
  } catch (error) {
    // Fallback to direct query if materialized view not available
    console.warn('[Materialized Views] Falling back to direct query for leaderboard:', error);
    return getLeaderboardDirect(seasonId, limit, offset);
  } finally {
    client.release();
  }
}

/**
 * Direct query fallback for leaderboard (slower but always available)
 */
async function getLeaderboardDirect(
  seasonId: string,
  limit: number = 100,
  offset: number = 0
): Promise<LeaderboardEntry[]> {
  const client = await pool.connect();

  try {
    const result = await client.query<LeaderboardEntry>(
      `
      SELECT
        r.id AS "rankingId",
        r.user_id AS "userId",
        u.display_name AS "displayName",
        u.avatar_url AS "avatarUrl",
        r.rating,
        r.deviation,
        RANK() OVER (ORDER BY r.rating DESC) AS rank,
        COUNT(DISTINCT mp.match_id) AS "totalMatches",
        COUNT(DISTINCT CASE WHEN mp.submission_id IS NOT NULL THEN mp.match_id END) AS "completedMatches"
      FROM rankings r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN match_participants mp ON mp.user_id = r.user_id
      WHERE r.season_id = $1
      GROUP BY r.id, r.user_id, u.display_name, u.avatar_url, r.rating, r.deviation
      ORDER BY r.rating DESC
      LIMIT $2 OFFSET $3
      `,
      [seasonId, limit, offset]
    );

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get the last refresh time for a materialized view
 */
export async function getViewRefreshTime(viewName: string): Promise<Date | null> {
  const client = await pool.connect();

  try {
    // Check if view exists and has data
    const result = await client.query(
      `
      SELECT schemaname, matviewname, ispopulated
      FROM pg_matviews
      WHERE matviewname = $1
      `,
      [viewName]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // PostgreSQL doesn't track refresh time natively, we'd need to implement our own tracking
    // For now, return null to indicate unknown
    return null;
  } finally {
    client.release();
  }
}

/**
 * Drop all materialized views (for testing/reset)
 */
export async function dropMaterializedViews(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('DROP MATERIALIZED VIEW IF EXISTS mv_leaderboard CASCADE');
    await client.query('DROP MATERIALIZED VIEW IF EXISTS mv_challenge_stats CASCADE');
    await client.query('DROP MATERIALIZED VIEW IF EXISTS mv_user_stats CASCADE');
    console.log('[Materialized Views] All views dropped');
  } finally {
    client.release();
  }
}
