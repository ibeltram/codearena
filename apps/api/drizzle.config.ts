import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString:
      process.env.DATABASE_URL || 'postgresql://reporivals:reporivals@localhost:5432/reporivals',
  },
  verbose: true,
  strict: true,
} satisfies Config;
