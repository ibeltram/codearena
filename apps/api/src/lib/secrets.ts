/**
 * Secrets Management Module
 *
 * Provides secure secrets management with support for:
 * - HashiCorp Vault
 * - AWS Secrets Manager
 * - Local/environment fallback for development
 *
 * Features:
 * - Secret caching with TTL
 * - Audit logging for all secret access
 * - Secret rotation support
 * - Graceful fallback handling
 */

import { logger } from './logger';

// Types
export interface SecretValue {
  value: string;
  version?: string;
  lastRotated?: Date;
  expiresAt?: Date;
}

export interface SecretMetadata {
  name: string;
  provider: SecretsProvider;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  version?: string;
}

export type SecretsProvider = 'vault' | 'aws' | 'local';

export interface SecretsConfig {
  provider: SecretsProvider;

  // Vault configuration
  vault?: {
    address: string;
    token?: string;
    roleId?: string;
    secretId?: string;
    namespace?: string;
    mountPath?: string;
  };

  // AWS configuration
  aws?: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    secretPrefix?: string;
  };

  // Cache configuration
  cache?: {
    enabled: boolean;
    ttlSeconds: number;
  };

  // Audit configuration
  audit?: {
    enabled: boolean;
    logLevel: 'info' | 'warn' | 'debug';
  };
}

interface CachedSecret {
  value: SecretValue;
  cachedAt: Date;
  expiresAt: Date;
}

// Audit log entry type
interface SecretAuditEntry {
  timestamp: Date;
  action: 'read' | 'write' | 'rotate' | 'delete';
  secretName: string;
  provider: SecretsProvider;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Secrets Manager Class
 * Handles retrieval, caching, and rotation of secrets
 */
export class SecretsManager {
  private config: SecretsConfig;
  private cache: Map<string, CachedSecret> = new Map();
  private metadata: Map<string, SecretMetadata> = new Map();
  private auditLog: SecretAuditEntry[] = [];
  private vaultClient: VaultClient | null = null;
  private awsClient: AWSSecretsClient | null = null;
  private initialized = false;

  constructor(config: SecretsConfig) {
    this.config = {
      ...config,
      cache: config.cache ?? { enabled: true, ttlSeconds: 300 },
      audit: config.audit ?? { enabled: true, logLevel: 'info' },
    };
  }

  /**
   * Initialize the secrets manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info({ provider: this.config.provider }, 'Initializing secrets manager');

    try {
      switch (this.config.provider) {
        case 'vault':
          this.vaultClient = new VaultClient(this.config.vault!);
          await this.vaultClient.authenticate();
          break;
        case 'aws':
          this.awsClient = new AWSSecretsClient(this.config.aws!);
          await this.awsClient.initialize();
          break;
        case 'local':
          // No initialization needed for local provider
          break;
      }

      this.initialized = true;
      logger.info({ provider: this.config.provider }, 'Secrets manager initialized successfully');
    } catch (error) {
      logger.error({ error, provider: this.config.provider }, 'Failed to initialize secrets manager');
      throw error;
    }
  }

  /**
   * Get a secret by name
   */
  async getSecret(name: string): Promise<SecretValue | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check cache first
    if (this.config.cache?.enabled) {
      const cached = this.cache.get(name);
      if (cached && cached.expiresAt > new Date()) {
        this.updateMetadata(name, 'read');
        this.logAudit('read', name, true);
        return cached.value;
      }
    }

    try {
      let secretValue: SecretValue | null = null;

      switch (this.config.provider) {
        case 'vault':
          secretValue = await this.getFromVault(name);
          break;
        case 'aws':
          secretValue = await this.getFromAWS(name);
          break;
        case 'local':
          secretValue = this.getFromLocal(name);
          break;
      }

      if (secretValue && this.config.cache?.enabled) {
        this.cacheSecret(name, secretValue);
      }

      this.updateMetadata(name, 'read');
      this.logAudit('read', name, !!secretValue);

      return secretValue;
    } catch (error) {
      this.logAudit('read', name, false, error instanceof Error ? error.message : 'Unknown error');
      logger.error({ error, secretName: name }, 'Failed to retrieve secret');

      // Try fallback to local if configured provider fails
      if (this.config.provider !== 'local') {
        logger.warn({ secretName: name }, 'Falling back to local environment variable');
        return this.getFromLocal(name);
      }

      return null;
    }
  }

  /**
   * Get multiple secrets at once
   */
  async getSecrets(names: string[]): Promise<Map<string, SecretValue | null>> {
    const results = new Map<string, SecretValue | null>();

    await Promise.all(
      names.map(async (name) => {
        const value = await this.getSecret(name);
        results.set(name, value);
      })
    );

    return results;
  }

  /**
   * Rotate a secret
   */
  async rotateSecret(name: string, newValue?: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      let success = false;

      switch (this.config.provider) {
        case 'vault':
          success = await this.rotateInVault(name, newValue);
          break;
        case 'aws':
          success = await this.rotateInAWS(name, newValue);
          break;
        case 'local':
          logger.warn({ secretName: name }, 'Secret rotation not supported for local provider');
          success = false;
          break;
      }

      if (success) {
        // Invalidate cache
        this.cache.delete(name);
        this.logAudit('rotate', name, true);
      }

      return success;
    } catch (error) {
      this.logAudit('rotate', name, false, error instanceof Error ? error.message : 'Unknown error');
      logger.error({ error, secretName: name }, 'Failed to rotate secret');
      return false;
    }
  }

  /**
   * Get audit log entries
   */
  getAuditLog(filter?: {
    secretName?: string;
    action?: SecretAuditEntry['action'];
    since?: Date;
    limit?: number;
  }): SecretAuditEntry[] {
    let entries = [...this.auditLog];

    if (filter?.secretName) {
      entries = entries.filter(e => e.secretName === filter.secretName);
    }
    if (filter?.action) {
      entries = entries.filter(e => e.action === filter.action);
    }
    if (filter?.since) {
      entries = entries.filter(e => e.timestamp >= filter.since!);
    }

    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filter?.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  /**
   * Get secret metadata
   */
  getMetadata(name: string): SecretMetadata | undefined {
    return this.metadata.get(name);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Secret cache cleared');
  }

  /**
   * Check health of the secrets provider
   */
  async healthCheck(): Promise<{ healthy: boolean; provider: SecretsProvider; message?: string }> {
    try {
      switch (this.config.provider) {
        case 'vault':
          if (this.vaultClient) {
            const healthy = await this.vaultClient.healthCheck();
            return { healthy, provider: 'vault' };
          }
          return { healthy: false, provider: 'vault', message: 'Vault client not initialized' };
        case 'aws':
          if (this.awsClient) {
            const healthy = await this.awsClient.healthCheck();
            return { healthy, provider: 'aws' };
          }
          return { healthy: false, provider: 'aws', message: 'AWS client not initialized' };
        case 'local':
          return { healthy: true, provider: 'local' };
      }
    } catch (error) {
      return {
        healthy: false,
        provider: this.config.provider,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Private methods

  private async getFromVault(name: string): Promise<SecretValue | null> {
    if (!this.vaultClient) {
      throw new Error('Vault client not initialized');
    }
    return this.vaultClient.getSecret(name);
  }

  private async getFromAWS(name: string): Promise<SecretValue | null> {
    if (!this.awsClient) {
      throw new Error('AWS Secrets Manager client not initialized');
    }
    return this.awsClient.getSecret(name);
  }

  private getFromLocal(name: string): SecretValue | null {
    // Convert secret name to environment variable format
    const envName = name.toUpperCase().replace(/[/-]/g, '_');
    const value = process.env[envName];

    if (value) {
      return {
        value,
        version: 'local',
        lastRotated: undefined,
        expiresAt: undefined,
      };
    }

    return null;
  }

  private async rotateInVault(name: string, newValue?: string): Promise<boolean> {
    if (!this.vaultClient) {
      throw new Error('Vault client not initialized');
    }
    return this.vaultClient.rotateSecret(name, newValue);
  }

  private async rotateInAWS(name: string, newValue?: string): Promise<boolean> {
    if (!this.awsClient) {
      throw new Error('AWS Secrets Manager client not initialized');
    }
    return this.awsClient.rotateSecret(name, newValue);
  }

  private cacheSecret(name: string, value: SecretValue): void {
    const ttl = this.config.cache?.ttlSeconds ?? 300;
    const now = new Date();

    this.cache.set(name, {
      value,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + ttl * 1000),
    });
  }

  private updateMetadata(name: string, action: 'read' | 'write'): void {
    const existing = this.metadata.get(name);

    if (existing) {
      existing.lastAccessed = new Date();
      existing.accessCount++;
    } else {
      this.metadata.set(name, {
        name,
        provider: this.config.provider,
        createdAt: new Date(),
        lastAccessed: new Date(),
        accessCount: 1,
      });
    }
  }

  private logAudit(
    action: SecretAuditEntry['action'],
    secretName: string,
    success: boolean,
    error?: string
  ): void {
    if (!this.config.audit?.enabled) return;

    const entry: SecretAuditEntry = {
      timestamp: new Date(),
      action,
      secretName,
      provider: this.config.provider,
      success,
      error,
    };

    this.auditLog.push(entry);

    // Keep audit log bounded (max 10000 entries in memory)
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }

    // Log to application logger based on configured level
    const logMessage = {
      action,
      secretName,
      provider: this.config.provider,
      success,
      ...(error && { error }),
    };

    switch (this.config.audit.logLevel) {
      case 'debug':
        logger.debug(logMessage, 'Secret access');
        break;
      case 'info':
        logger.info(logMessage, 'Secret access');
        break;
      case 'warn':
        if (!success) {
          logger.warn(logMessage, 'Secret access failed');
        }
        break;
    }
  }
}

/**
 * HashiCorp Vault Client
 */
class VaultClient {
  private config: NonNullable<SecretsConfig['vault']>;
  private token: string | null = null;

  constructor(config: NonNullable<SecretsConfig['vault']>) {
    this.config = config;
  }

  async authenticate(): Promise<void> {
    if (this.config.token) {
      this.token = this.config.token;
      return;
    }

    if (this.config.roleId && this.config.secretId) {
      // AppRole authentication
      const response = await fetch(`${this.config.address}/v1/auth/approle/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: this.config.roleId,
          secret_id: this.config.secretId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Vault authentication failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.token = data.auth.client_token;
    } else {
      throw new Error('No Vault authentication method configured');
    }
  }

  async getSecret(name: string): Promise<SecretValue | null> {
    if (!this.token) {
      throw new Error('Not authenticated with Vault');
    }

    const mountPath = this.config.mountPath ?? 'secret';
    const url = `${this.config.address}/v1/${mountPath}/data/${name}`;

    const headers: Record<string, string> = {
      'X-Vault-Token': this.token,
    };

    if (this.config.namespace) {
      headers['X-Vault-Namespace'] = this.config.namespace;
    }

    const response = await fetch(url, { headers });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get secret from Vault: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      value: data.data.data.value,
      version: data.data.metadata.version?.toString(),
      lastRotated: data.data.metadata.created_time
        ? new Date(data.data.metadata.created_time)
        : undefined,
    };
  }

  async rotateSecret(name: string, newValue?: string): Promise<boolean> {
    if (!this.token) {
      throw new Error('Not authenticated with Vault');
    }

    if (!newValue) {
      // Trigger Vault's built-in rotation if available
      logger.warn({ secretName: name }, 'Automatic secret rotation requires Vault Enterprise');
      return false;
    }

    const mountPath = this.config.mountPath ?? 'secret';
    const url = `${this.config.address}/v1/${mountPath}/data/${name}`;

    const headers: Record<string, string> = {
      'X-Vault-Token': this.token,
      'Content-Type': 'application/json',
    };

    if (this.config.namespace) {
      headers['X-Vault-Namespace'] = this.config.namespace;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { value: newValue } }),
    });

    return response.ok;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.address}/v1/sys/health`);
      const data = await response.json();
      return !data.sealed && data.initialized;
    } catch {
      return false;
    }
  }
}

/**
 * AWS Secrets Manager Client
 */
class AWSSecretsClient {
  private config: NonNullable<SecretsConfig['aws']>;
  private initialized = false;

  constructor(config: NonNullable<SecretsConfig['aws']>) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // In a real implementation, this would initialize the AWS SDK
    // For now, we simulate initialization
    this.initialized = true;
  }

  async getSecret(name: string): Promise<SecretValue | null> {
    if (!this.initialized) {
      throw new Error('AWS client not initialized');
    }

    const secretName = this.config.secretPrefix
      ? `${this.config.secretPrefix}/${name}`
      : name;

    try {
      // In production, use @aws-sdk/client-secrets-manager
      // This is a simulated implementation
      const response = await this.makeAWSRequest('GetSecretValue', {
        SecretId: secretName,
      });

      if (!response) {
        return null;
      }

      return {
        value: response.SecretString,
        version: response.VersionId,
        lastRotated: response.LastRotatedDate
          ? new Date(response.LastRotatedDate)
          : undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('ResourceNotFoundException')) {
        return null;
      }
      throw error;
    }
  }

  async rotateSecret(name: string, newValue?: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('AWS client not initialized');
    }

    const secretName = this.config.secretPrefix
      ? `${this.config.secretPrefix}/${name}`
      : name;

    try {
      if (newValue) {
        // Update secret with new value
        await this.makeAWSRequest('PutSecretValue', {
          SecretId: secretName,
          SecretString: newValue,
        });
      } else {
        // Trigger automatic rotation
        await this.makeAWSRequest('RotateSecret', {
          SecretId: secretName,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Try to list secrets (limited to 1) to verify connectivity
      await this.makeAWSRequest('ListSecrets', { MaxResults: 1 });
      return true;
    } catch {
      return false;
    }
  }

  private async makeAWSRequest(action: string, params: Record<string, unknown>): Promise<any> {
    // In production, this would use the AWS SDK
    // For development/testing, we fall back to environment variables

    if (process.env.NODE_ENV === 'development') {
      // Simulate AWS response in development
      const secretId = params.SecretId as string;
      const envName = secretId.toUpperCase().replace(/[/-]/g, '_');
      const value = process.env[envName];

      if (action === 'GetSecretValue' && value) {
        return {
          SecretString: value,
          VersionId: 'dev-version',
        };
      }

      if (action === 'ListSecrets') {
        return { SecretList: [] };
      }

      return null;
    }

    // In production, implement actual AWS API calls here
    // using @aws-sdk/client-secrets-manager
    throw new Error('AWS Secrets Manager SDK not configured for production');
  }
}

// Singleton instance
let secretsManagerInstance: SecretsManager | null = null;

/**
 * Get or create the singleton secrets manager instance
 */
export function getSecretsManager(): SecretsManager {
  if (!secretsManagerInstance) {
    // Determine provider from environment
    const provider = (process.env.SECRETS_PROVIDER as SecretsProvider) || 'local';

    const config: SecretsConfig = {
      provider,
      vault: provider === 'vault' ? {
        address: process.env.VAULT_ADDR || 'http://localhost:8200',
        token: process.env.VAULT_TOKEN,
        roleId: process.env.VAULT_ROLE_ID,
        secretId: process.env.VAULT_SECRET_ID,
        namespace: process.env.VAULT_NAMESPACE,
        mountPath: process.env.VAULT_MOUNT_PATH || 'secret',
      } : undefined,
      aws: provider === 'aws' ? {
        region: process.env.AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        secretPrefix: process.env.AWS_SECRET_PREFIX || 'codearena',
      } : undefined,
      cache: {
        enabled: process.env.SECRETS_CACHE_ENABLED !== 'false',
        ttlSeconds: parseInt(process.env.SECRETS_CACHE_TTL || '300', 10),
      },
      audit: {
        enabled: process.env.SECRETS_AUDIT_ENABLED !== 'false',
        logLevel: (process.env.SECRETS_AUDIT_LEVEL as 'info' | 'warn' | 'debug') || 'info',
      },
    };

    secretsManagerInstance = new SecretsManager(config);
  }

  return secretsManagerInstance;
}

/**
 * Helper function to get a secret value directly
 */
export async function getSecret(name: string): Promise<string | null> {
  const manager = getSecretsManager();
  const secret = await manager.getSecret(name);
  return secret?.value ?? null;
}

/**
 * Helper function to get database credentials
 */
export async function getDatabaseCredentials(): Promise<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} | null> {
  const manager = getSecretsManager();

  try {
    // Try to get dynamic credentials from Vault/AWS
    const dbSecret = await manager.getSecret('database/credentials');

    if (dbSecret) {
      const creds = JSON.parse(dbSecret.value);
      return {
        host: creds.host || 'localhost',
        port: creds.port || 5432,
        database: creds.database || 'codearena',
        user: creds.username || creds.user,
        password: creds.password,
      };
    }

    // Fall back to DATABASE_URL parsing
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const url = new URL(dbUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port || '5432', 10),
        database: url.pathname.slice(1),
        user: url.username,
        password: url.password,
      };
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Failed to get database credentials');
    return null;
  }
}

// Export types for external use
export type { SecretAuditEntry };
