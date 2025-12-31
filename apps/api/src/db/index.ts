import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

// Database configuration
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://reporivals:reporivals@localhost:5432/reporivals';

// Create a connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Create drizzle instance with schema
export const db = drizzle(pool, { schema });

// Export schema for use in queries
export { schema };

// Export pool for direct access if needed
export { pool };

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
}
