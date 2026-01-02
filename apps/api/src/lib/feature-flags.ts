/**
 * Feature Flags Service
 *
 * A flexible feature flags system that supports:
 * - Environment-based configuration
 * - Per-user targeting
 * - Percentage rollouts
 * - LaunchDarkly integration (when configured)
 *
 * Usage:
 * - isFeatureEnabled('new-feature', { userId, email })
 * - getFeatureFlags({ userId, email })
 */

import { env } from './env.js';
import { logger } from './logger.js';

// Feature flag definition
export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  // Percentage rollout (0-100). If set, only this percentage of users see the feature
  rolloutPercentage?: number;
  // Specific user IDs that always see this feature
  enabledForUsers?: string[];
  // Specific emails that always see this feature
  enabledForEmails?: string[];
  // Environment-specific overrides
  environments?: {
    development?: boolean;
    staging?: boolean;
    production?: boolean;
  };
  // LaunchDarkly key mapping (if different from our key)
  launchDarklyKey?: string;
}

// User context for targeting
export interface FeatureFlagContext {
  userId?: string;
  email?: string;
  anonymous?: boolean;
  attributes?: Record<string, string | number | boolean>;
}

// Default feature flags configuration
// These can be overridden via environment variables or LaunchDarkly
const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: 'ai-judge',
    name: 'AI Judge',
    description: 'Enable AI-powered code evaluation using LLMs',
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: false,
    },
  },
  {
    key: 'tournament-swiss',
    name: 'Swiss Tournaments',
    description: 'Enable Swiss tournament format',
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: true,
    },
  },
  {
    key: 'rewards-marketplace',
    name: 'Rewards Marketplace',
    description: 'Enable the rewards marketplace for credit redemption',
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: true,
    },
  },
  {
    key: 'automation-services',
    name: 'Automation Services',
    description: 'Enable automation services (batch runs, eval pipelines, etc.)',
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: false,
    },
  },
  {
    key: 'collusion-detection',
    name: 'Collusion Detection',
    description: 'Enable advanced collusion detection algorithms',
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: true,
    },
  },
  {
    key: 'dark-mode',
    name: 'Dark Mode',
    description: 'Enable dark mode theme toggle',
    enabled: true,
  },
  {
    key: 'new-match-ui',
    name: 'New Match UI',
    description: 'Enable redesigned match page UI',
    enabled: false,
    rolloutPercentage: 10,
  },
  {
    key: 'advanced-analytics',
    name: 'Advanced Analytics',
    description: 'Enable advanced user analytics dashboard',
    enabled: false,
    environments: {
      development: true,
      staging: true,
      production: false,
    },
  },
];

// In-memory flag store
let flagStore: Map<string, FeatureFlag> = new Map();
let launchDarklyClient: LaunchDarklyClientInterface | null = null;

// LaunchDarkly client interface
interface LaunchDarklyClientInterface {
  variation(key: string, context: unknown, defaultValue: boolean): Promise<boolean>;
  allFlagsState(context: unknown): Promise<Record<string, boolean>>;
  close(): Promise<void>;
}

/**
 * Initialize the feature flags system
 */
export async function initFeatureFlags(): Promise<void> {
  // Load default flags
  DEFAULT_FLAGS.forEach((flag) => {
    flagStore.set(flag.key, flag);
  });

  // Check for environment variable overrides
  // Format: FEATURE_FLAG_<KEY>=true|false
  for (const [envKey, envValue] of Object.entries(process.env)) {
    if (envKey.startsWith('FEATURE_FLAG_')) {
      const flagKey = envKey
        .replace('FEATURE_FLAG_', '')
        .toLowerCase()
        .replace(/_/g, '-');
      const existingFlag = flagStore.get(flagKey);
      if (existingFlag) {
        existingFlag.enabled = envValue === 'true';
        logger.info(`Feature flag override from env: ${flagKey}=${envValue}`);
      }
    }
  }

  // Initialize LaunchDarkly if configured
  const launchDarklySdkKey = process.env.LAUNCHDARKLY_SDK_KEY;
  if (launchDarklySdkKey) {
    try {
      // Dynamic import to avoid requiring the dependency
      const LaunchDarkly = await import('@launchdarkly/node-server-sdk');
      launchDarklyClient = LaunchDarkly.init(launchDarklySdkKey) as LaunchDarklyClientInterface;
      await (launchDarklyClient as { waitForInitialization: () => Promise<void> }).waitForInitialization();
      logger.info('LaunchDarkly client initialized');
    } catch (error) {
      logger.warn(
        'LaunchDarkly SDK not available or failed to initialize. Using local flags.',
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  } else {
    logger.info('Feature flags initialized with local configuration');
  }
}

/**
 * Generate a deterministic hash for percentage rollouts
 */
function hashUserForRollout(userId: string, flagKey: string): number {
  // Simple hash function for consistent rollouts
  const str = `${userId}-${flagKey}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to 0-100 range
  return Math.abs(hash) % 100;
}

/**
 * Check if a feature is enabled for the given context
 */
export async function isFeatureEnabled(
  flagKey: string,
  context?: FeatureFlagContext
): Promise<boolean> {
  // If LaunchDarkly is configured, use it
  if (launchDarklyClient) {
    try {
      const ldContext = {
        kind: context?.userId ? 'user' : 'anonymous',
        key: context?.userId || 'anonymous',
        email: context?.email,
        ...context?.attributes,
      };

      const flag = flagStore.get(flagKey);
      const ldKey = flag?.launchDarklyKey || flagKey;

      return await launchDarklyClient.variation(ldKey, ldContext, flag?.enabled ?? false);
    } catch (error) {
      logger.warn(`LaunchDarkly variation failed for ${flagKey}, using fallback`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Fall back to local flag evaluation
  return evaluateLocalFlag(flagKey, context);
}

/**
 * Synchronous version of isFeatureEnabled for non-async contexts
 * Uses local evaluation only
 */
export function isFeatureEnabledSync(
  flagKey: string,
  context?: FeatureFlagContext
): boolean {
  return evaluateLocalFlag(flagKey, context);
}

/**
 * Evaluate a flag using local configuration
 */
function evaluateLocalFlag(flagKey: string, context?: FeatureFlagContext): boolean {
  const flag = flagStore.get(flagKey);

  if (!flag) {
    logger.warn(`Unknown feature flag: ${flagKey}`);
    return false;
  }

  // Check environment-specific override
  const currentEnv = env.NODE_ENV as 'development' | 'staging' | 'production';
  if (flag.environments && flag.environments[currentEnv] !== undefined) {
    const envEnabled = flag.environments[currentEnv];
    if (!envEnabled) {
      return false;
    }
  }

  // Check user-specific targeting
  if (context?.userId && flag.enabledForUsers?.includes(context.userId)) {
    return true;
  }

  if (context?.email && flag.enabledForEmails?.includes(context.email)) {
    return true;
  }

  // Check percentage rollout
  if (flag.rolloutPercentage !== undefined && context?.userId) {
    const userHash = hashUserForRollout(context.userId, flagKey);
    if (userHash >= flag.rolloutPercentage) {
      return false;
    }
  }

  return flag.enabled;
}

/**
 * Get all feature flags for a user context
 * Useful for sending to frontend
 */
export async function getFeatureFlags(
  context?: FeatureFlagContext
): Promise<Record<string, boolean>> {
  const flags: Record<string, boolean> = {};

  // If LaunchDarkly is configured, use it
  if (launchDarklyClient) {
    try {
      const ldContext = {
        kind: context?.userId ? 'user' : 'anonymous',
        key: context?.userId || 'anonymous',
        email: context?.email,
        ...context?.attributes,
      };

      const ldState = await launchDarklyClient.allFlagsState(ldContext);
      return ldState;
    } catch (error) {
      logger.warn('LaunchDarkly allFlagsState failed, using fallback', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Fall back to local evaluation
  for (const [key] of flagStore) {
    flags[key] = evaluateLocalFlag(key, context);
  }

  return flags;
}

/**
 * Get all flag definitions (for admin purposes)
 */
export function getAllFlagDefinitions(): FeatureFlag[] {
  return Array.from(flagStore.values());
}

/**
 * Update a flag definition at runtime
 * Useful for admin overrides
 */
export function updateFlag(flagKey: string, updates: Partial<FeatureFlag>): boolean {
  const flag = flagStore.get(flagKey);
  if (!flag) {
    return false;
  }

  flagStore.set(flagKey, { ...flag, ...updates });
  logger.info(`Feature flag updated: ${flagKey}`, { updates });
  return true;
}

/**
 * Add a new flag at runtime
 */
export function addFlag(flag: FeatureFlag): void {
  flagStore.set(flag.key, flag);
  logger.info(`Feature flag added: ${flag.key}`);
}

/**
 * Shutdown feature flags (cleanup)
 */
export async function shutdownFeatureFlags(): Promise<void> {
  if (launchDarklyClient) {
    await launchDarklyClient.close();
    launchDarklyClient = null;
  }
  flagStore.clear();
}

/**
 * Fastify plugin for feature flags middleware
 */
export async function featureFlagsPlugin(fastify: import('fastify').FastifyInstance): Promise<void> {
  // Initialize feature flags on startup
  await initFeatureFlags();

  // Decorate request with feature flag helpers
  fastify.decorateRequest('isFeatureEnabled', function (
    this: { userId?: string; userEmail?: string },
    flagKey: string
  ) {
    return isFeatureEnabledSync(flagKey, {
      userId: this.userId,
      email: this.userEmail,
    });
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await shutdownFeatureFlags();
  });
}

// TypeScript augmentation for Fastify
declare module 'fastify' {
  interface FastifyRequest {
    isFeatureEnabled(flagKey: string): boolean;
    userId?: string;
    userEmail?: string;
  }
}

export { DEFAULT_FLAGS };
