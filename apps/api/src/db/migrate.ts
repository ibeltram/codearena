import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://reporivals:reporivals@localhost:5432/reporivals';

async function runMigrations() {
  console.info('Starting database migrations...');

  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.info('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
