import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().default('postgresql://reporivals:reporivals@localhost:5432/reporivals'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // S3/MinIO
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET_ARTIFACTS: z.string().default('reporivals-artifacts'),
  S3_BUCKET_UPLOADS: z.string().default('reporivals-uploads'),

  // Auth
  JWT_SECRET: z.string().default('development-jwt-secret-change-in-production'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  DEVICE_CODE_EXPIRY: z.string().default('600'),

  // GitHub OAuth
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().optional(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // URLs
  API_URL: z.string().default('http://localhost:3001'),
  WEB_URL: z.string().default('http://localhost:3000'),

  // OpenTelemetry
  OTEL_ENABLED: z.string().optional().default('true'),
  OTEL_SERVICE_NAME: z.string().optional().default('reporivals-api'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_SAMPLE_RATE: z.string().optional(),
  OTEL_DEBUG: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();
