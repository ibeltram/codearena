import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';

import * as schema from './schema';

// Database configuration from environment
const PRIMARY_DATABASE_URL = process.env.DATABASE_URL || 'postgresql://reporivals:reporivals@localhost:5432/reporivals';
const REPLICA_DATABASE_URL = process.env.DATABASE_REPLICA_URL;

// Pool configuration optimized for PgBouncer
const basePoolConfig: Partial<PoolConfig> = {
  // Lower pool size since PgBouncer handles connection pooling
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 10,
  min: process.env.DB_POOL_MIN ? parseInt(process.env.DB_POOL_MIN) : 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Allow prepared statements (PgBouncer in transaction mode supports this)
  allowExitOnIdle: false,
};

// Create primary connection pool (for writes)
const primaryPool = new Pool({
  connectionString: PRIMARY_DATABASE_URL,
  ...basePoolConfig,
  // Primary pool can be slightly larger
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 10,
});

// Create replica connection pool (for reads) if configured
const replicaPool = REPLICA_DATABASE_URL
  ? new Pool({
      connectionString: REPLICA_DATABASE_URL,
      ...basePoolConfig,
      // Replica can have more connections for read scaling
      max: process.env.DB_REPLICA_POOL_MAX ? parseInt(process.env.DB_REPLICA_POOL_MAX) : 15,
    })
  : null;

// Create drizzle instances
export const db = drizzle(primaryPool, { schema });
export const dbReplica = replicaPool ? drizzle(replicaPool, { schema }) : db;

// Type exports
export type Database = NodePgDatabase<typeof schema>;

// Export schema for use in queries
export { schema };

// Export pools for direct access if needed
export { primaryPool as pool, replicaPool };

/**
 * Get the appropriate database connection for the operation type
 * @param readOnly - If true, returns replica connection (if available)
 */
export function getDb(readOnly: boolean = false): Database {
  if (readOnly && replicaPool) {
    return dbReplica;
  }
  return db;
}

/**
 * Check if read replicas are configured
 */
export function hasReadReplicas(): boolean {
  return replicaPool !== null;
}

/**
 * Health check for primary database
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await primaryPool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Primary database connection failed:', error);
    return false;
  }
}

/**
 * Health check for replica database
 */
export async function checkReplicaConnection(): Promise<boolean> {
  if (!replicaPool) {
    return true; // No replica configured, considered healthy
  }
  try {
    const client = await replicaPool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Replica database connection failed:', error);
    return false;
  }
}

/**
 * Get connection pool statistics
 */
export interface PoolStats {
  primary: {
    total: number;
    idle: number;
    waiting: number;
  };
  replica: {
    total: number;
    idle: number;
    waiting: number;
  } | null;
}

export function getPoolStats(): PoolStats {
  return {
    primary: {
      total: primaryPool.totalCount,
      idle: primaryPool.idleCount,
      waiting: primaryPool.waitingCount,
    },
    replica: replicaPool
      ? {
          total: replicaPool.totalCount,
          idle: replicaPool.idleCount,
          waiting: replicaPool.waitingCount,
        }
      : null,
  };
}

/**
 * Query PgBouncer stats (requires admin connection)
 */
export async function getPgBouncerStats(): Promise<Record<string, unknown>[] | null> {
  const pgbouncerUrl = process.env.PGBOUNCER_ADMIN_URL;
  if (!pgbouncerUrl) {
    return null;
  }

  const adminPool = new Pool({
    connectionString: pgbouncerUrl,
    max: 1,
  });

  try {
    const client = await adminPool.connect();
    const result = await client.query('SHOW STATS');
    client.release();
    await adminPool.end();
    return result.rows;
  } catch (error) {
    console.error('Failed to get PgBouncer stats:', error);
    await adminPool.end();
    return null;
  }
}

/**
 * Graceful shutdown - close all pools
 */
export async function closeDatabaseConnection(): Promise<void> {
  const closePromises = [primaryPool.end()];
  if (replicaPool) {
    closePromises.push(replicaPool.end());
  }
  await Promise.all(closePromises);
}

// Log pool configuration on startup
console.log('[Database] Connection pool initialized:', {
  primaryUrl: PRIMARY_DATABASE_URL.replace(/:[^:@]+@/, ':***@'),
  replicaConfigured: !!REPLICA_DATABASE_URL,
  poolMax: basePoolConfig.max,
  poolMin: basePoolConfig.min,
});
