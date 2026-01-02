import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  // Database (via PgBouncer)
  DATABASE_URL: z.string().default('postgresql://reporivals:reporivals@localhost:5432/reporivals'),
  DATABASE_REPLICA_URL: z.string().optional(),

  // Database Connection Pooling
  DB_POOL_MAX: z.string().optional().default('10'),
  DB_POOL_MIN: z.string().optional().default('2'),
  DB_REPLICA_POOL_MAX: z.string().optional().default('15'),

  // PgBouncer Admin (for stats)
  PGBOUNCER_ADMIN_URL: z.string().optional(),

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

  // Feature Flags (LaunchDarkly)
  LAUNCHDARKLY_SDK_KEY: z.string().optional(),

  // Secrets Management
  SECRETS_PROVIDER: z.enum(['local', 'vault', 'aws']).default('local'),

  // HashiCorp Vault
  VAULT_ADDR: z.string().optional(),
  VAULT_TOKEN: z.string().optional(),
  VAULT_ROLE_ID: z.string().optional(),
  VAULT_SECRET_ID: z.string().optional(),
  VAULT_NAMESPACE: z.string().optional(),
  VAULT_MOUNT_PATH: z.string().optional(),

  // AWS Secrets Manager
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SECRET_PREFIX: z.string().optional(),

  // Secrets Cache
  SECRETS_CACHE_ENABLED: z.string().optional().default('true'),
  SECRETS_CACHE_TTL: z.string().optional().default('300'),
  SECRETS_AUDIT_ENABLED: z.string().optional().default('true'),
  SECRETS_AUDIT_LEVEL: z.enum(['info', 'warn', 'debug']).optional().default('info'),

  // Alerting
  ALERTING_ENABLED: z.string().optional().default('false'),
  ALERTING_PROVIDER: z.enum(['pagerduty', 'opsgenie', 'none']).optional().default('none'),

  // PagerDuty
  PAGERDUTY_ROUTING_KEY: z.string().optional(),
  PAGERDUTY_API_URL: z.string().optional(),

  // Opsgenie
  OPSGENIE_API_KEY: z.string().optional(),
  OPSGENIE_API_URL: z.string().optional(),
  OPSGENIE_RESPONDERS: z.string().optional(), // JSON array of responders

  // Runbooks
  RUNBOOK_BASE_URL: z.string().optional().default('https://docs.reporivals.com/runbooks'),
  ESCALATION_TIMEOUT_MINUTES: z.string().optional().default('15'),
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

/**
 * Check if secrets management is using external provider
 */
export function isUsingExternalSecrets(): boolean {
  return env.SECRETS_PROVIDER !== 'local';
}

/**
 * Get the configured secrets provider
 */
export function getSecretsProvider(): 'local' | 'vault' | 'aws' {
  return env.SECRETS_PROVIDER;
}
