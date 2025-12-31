/**
 * Session Management Library
 *
 * Provides secure session management with:
 * - Short-lived JWT access tokens (15 minutes)
 * - Long-lived refresh tokens with rotation (30 days)
 * - Redis-backed token blacklist for immediate revocation
 * - Device/session tracking for multi-device support
 */

import crypto from 'crypto';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../db';
import { users, sessions, type User, type Session } from '../db/schema';
import { env } from './env';
import { getRedis } from './redis';

// Token configuration
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_TOKEN_EXPIRY_SECONDS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

// Cookie configuration
export const COOKIE_CONFIG = {
  accessToken: {
    name: 'reporivals_access_token',
    maxAge: ACCESS_TOKEN_EXPIRY_SECONDS,
  },
  refreshToken: {
    name: 'reporivals_refresh_token',
    maxAge: REFRESH_TOKEN_EXPIRY_SECONDS,
  },
} as const;

// Redis keys
const BLACKLIST_PREFIX = 'token:blacklist:';
const RATE_LIMIT_PREFIX = 'auth:ratelimit:';

// Device code storage (in-memory for now, could move to Redis)
interface DeviceCodeEntry {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: Date;
  interval: number;
  authorized: boolean;
  userId?: string;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

const deviceCodes: Map<string, DeviceCodeEntry> = new Map();
const usersByCode: Map<string, string> = new Map();

// Types
export interface TokenPayload {
  sub: string; // User ID
  type: 'access' | 'refresh';
  sessionId?: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SessionInfo {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  lastUsedAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

// Helper functions
export function generateRandomToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateUserCode(): string {
  // Generate an 8-character alphanumeric code (easy to type)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Parse JWT expiry string to seconds
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return ACCESS_TOKEN_EXPIRY_SECONDS;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: return ACCESS_TOKEN_EXPIRY_SECONDS;
  }
}

/**
 * Generate JWT access token
 */
export async function generateAccessToken(app: FastifyInstance, userId: string, sessionId?: string): Promise<string> {
  const expiresIn = parseExpiry(env.JWT_ACCESS_EXPIRY);

  const token = app.jwt.sign(
    {
      sub: userId,
      type: 'access',
      sessionId,
    },
    { expiresIn }
  );

  return token;
}

/**
 * Generate refresh token and store session in database
 */
export async function generateRefreshToken(
  userId: string,
  deviceInfo: {
    deviceName?: string;
    deviceType?: string;
    ipAddress?: string;
    userAgent?: string;
  } = {}
): Promise<{ refreshToken: string; session: Session }> {
  const refreshToken = generateRandomToken(64);
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

  const [session] = await db.insert(sessions).values({
    userId,
    refreshTokenHash,
    deviceName: deviceInfo.deviceName || 'Unknown Device',
    deviceType: deviceInfo.deviceType || 'web',
    ipAddress: deviceInfo.ipAddress,
    userAgent: deviceInfo.userAgent,
    expiresAt,
  }).returning();

  return { refreshToken, session };
}

/**
 * Generate both access and refresh tokens
 */
export async function generateTokenPair(
  app: FastifyInstance,
  userId: string,
  deviceInfo: {
    deviceName?: string;
    deviceType?: string;
    ipAddress?: string;
    userAgent?: string;
  } = {}
): Promise<TokenPair & { session: Session }> {
  const { refreshToken, session } = await generateRefreshToken(userId, deviceInfo);
  const accessToken = await generateAccessToken(app, userId, session.id);

  return {
    accessToken,
    refreshToken,
    expiresIn: parseExpiry(env.JWT_ACCESS_EXPIRY),
    session,
  };
}

/**
 * Verify and decode access token
 */
export async function verifyAccessToken(app: FastifyInstance, token: string): Promise<TokenPayload | null> {
  try {
    const payload = app.jwt.verify<TokenPayload>(token);

    if (payload.type !== 'access') {
      return null;
    }

    // Check if token is blacklisted
    const redis = getRedis();
    const isBlacklisted = await redis.exists(`${BLACKLIST_PREFIX}${token}`);
    if (isBlacklisted) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Result type for refresh token operations
 */
export interface RefreshResult {
  success: boolean;
  tokens?: TokenPair;
  error?: 'invalid_token' | 'expired_token' | 'token_reuse_detected';
  sessionsRevoked?: number;
}

/**
 * Refresh tokens using a valid refresh token
 * Implements rotation with reuse detection:
 * - Old refresh token is stored as previousTokenHash
 * - If previousTokenHash is used, it indicates token theft
 * - In case of theft, the entire token family is revoked
 */
export async function refreshTokens(
  app: FastifyInstance,
  refreshToken: string,
  deviceInfo: {
    ipAddress?: string;
    userAgent?: string;
  } = {}
): Promise<RefreshResult> {
  const refreshTokenHash = hashToken(refreshToken);

  // First, check if this token hash matches the current valid token
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.refreshTokenHash, refreshTokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (session) {
    // Valid current token - perform normal rotation
    const newRefreshToken = generateRandomToken(64);
    const newRefreshTokenHash = hashToken(newRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

    // Update session: store current hash as previous, set new hash
    await db
      .update(sessions)
      .set({
        refreshTokenHash: newRefreshTokenHash,
        previousTokenHash: refreshTokenHash, // Store old hash for reuse detection
        expiresAt: newExpiresAt,
        lastUsedAt: new Date(),
        ipAddress: deviceInfo.ipAddress || session.ipAddress,
        userAgent: deviceInfo.userAgent || session.userAgent,
      })
      .where(eq(sessions.id, session.id));

    // Generate new access token
    const accessToken = await generateAccessToken(app, session.userId, session.id);

    return {
      success: true,
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: parseExpiry(env.JWT_ACCESS_EXPIRY),
      },
    };
  }

  // Token doesn't match current - check if it's a previously rotated token (REUSE DETECTION)
  const [reusedSession] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.previousTokenHash, refreshTokenHash),
        isNull(sessions.revokedAt)
      )
    )
    .limit(1);

  if (reusedSession) {
    // SECURITY ALERT: Token reuse detected!
    // This means someone is using an old token after it was already rotated.
    // The legitimate user has the new token, so this is likely an attacker.
    // Revoke the entire session to protect the user.

    const redis = getRedis();

    // Log the security event
    await redis.lpush('security:token_reuse', JSON.stringify({
      sessionId: reusedSession.id,
      userId: reusedSession.userId,
      detectedAt: new Date().toISOString(),
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    }));

    // Revoke this session immediately
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, reusedSession.id));

    // Also revoke all sessions in the same token family for extra security
    const result = await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.tokenFamily, reusedSession.tokenFamily),
          isNull(sessions.revokedAt)
        )
      );

    return {
      success: false,
      error: 'token_reuse_detected',
      sessionsRevoked: result.rowCount ?? 1,
    };
  }

  // Token not found at all - could be expired, revoked, or invalid
  return {
    success: false,
    error: 'invalid_token',
  };
}

/**
 * Revoke a specific session
 */
export async function revokeSession(sessionId: string, userId?: string): Promise<boolean> {
  const conditions = [eq(sessions.id, sessionId)];
  if (userId) {
    conditions.push(eq(sessions.userId, userId));
  }

  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions));

  return (result.rowCount ?? 0) > 0;
}

/**
 * Revoke all sessions for a user (logout everywhere)
 */
export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const conditions = [
    eq(sessions.userId, userId),
    isNull(sessions.revokedAt),
  ];

  // Get sessions to revoke
  const sessionsToRevoke = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(...conditions));

  const idsToRevoke = sessionsToRevoke
    .filter(s => s.id !== exceptSessionId)
    .map(s => s.id);

  if (idsToRevoke.length === 0) {
    return 0;
  }

  // Revoke sessions
  for (const id of idsToRevoke) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, id));
  }

  return idsToRevoke.length;
}

/**
 * Blacklist an access token (for immediate invalidation)
 */
export async function blacklistAccessToken(token: string, expiresInSeconds: number): Promise<void> {
  const redis = getRedis();
  await redis.setex(`${BLACKLIST_PREFIX}${token}`, expiresInSeconds, '1');
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string, currentSessionId?: string): Promise<SessionInfo[]> {
  const userSessions = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date())
      )
    )
    .orderBy(sessions.lastUsedAt);

  return userSessions.map(session => ({
    id: session.id,
    deviceName: session.deviceName,
    deviceType: session.deviceType,
    ipAddress: session.ipAddress,
    lastUsedAt: session.lastUsedAt,
    createdAt: session.createdAt,
    isCurrent: session.id === currentSessionId,
  }));
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user || null;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user || null;
}

/**
 * Extract client IP from request
 */
export function getClientIp(request: FastifyRequest): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  }
  return request.ip;
}

/**
 * Extract device info from request
 */
export function getDeviceInfo(request: FastifyRequest): {
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
} {
  const userAgent = request.headers['user-agent'];
  let deviceType = 'web';

  if (userAgent) {
    if (userAgent.includes('VSCode') || userAgent.includes('RepoRivals-Extension')) {
      deviceType = 'vscode';
    } else if (/mobile|android|iphone|ipad/i.test(userAgent)) {
      deviceType = 'mobile';
    }
  }

  return {
    ipAddress: getClientIp(request),
    userAgent: userAgent?.slice(0, 500),
    deviceType,
  };
}

// Device code flow functions
export function createDeviceCode(): DeviceCodeEntry {
  const deviceCode = generateRandomToken(32);
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + parseInt(env.DEVICE_CODE_EXPIRY) * 1000);

  const verificationUri = `${env.WEB_URL}/device`;

  const entry: DeviceCodeEntry = {
    deviceCode,
    userCode,
    verificationUri,
    expiresAt,
    interval: 5,
    authorized: false,
  };

  deviceCodes.set(deviceCode, entry);
  usersByCode.set(userCode, deviceCode);

  return entry;
}

export function getDeviceCodeByUserCode(userCode: string): DeviceCodeEntry | undefined {
  const deviceCode = usersByCode.get(userCode);
  if (!deviceCode) return undefined;
  return deviceCodes.get(deviceCode);
}

export function getDeviceCode(deviceCode: string): DeviceCodeEntry | undefined {
  return deviceCodes.get(deviceCode);
}

export function authorizeDeviceCode(
  userCode: string,
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number }
): boolean {
  const deviceCode = usersByCode.get(userCode);
  if (!deviceCode) return false;

  const entry = deviceCodes.get(deviceCode);
  if (!entry || entry.authorized || entry.expiresAt < new Date()) {
    return false;
  }

  entry.authorized = true;
  entry.userId = userId;
  entry.tokens = tokens;

  return true;
}

export function consumeDeviceCode(deviceCode: string): DeviceCodeEntry | undefined {
  const entry = deviceCodes.get(deviceCode);
  if (!entry) return undefined;

  // Cleanup
  deviceCodes.delete(deviceCode);
  usersByCode.delete(entry.userCode);

  return entry;
}

// Cleanup expired device codes periodically
export function cleanupExpiredDeviceCodes(): void {
  const now = new Date();

  for (const [code, entry] of deviceCodes.entries()) {
    if (entry.expiresAt < now) {
      deviceCodes.delete(code);
      usersByCode.delete(entry.userCode);
    }
  }
}

// Rate limiting helpers
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const redis = getRedis();
  const redisKey = `${RATE_LIMIT_PREFIX}${key}`;

  const current = await redis.incr(redisKey);

  if (current === 1) {
    await redis.expire(redisKey, windowSeconds);
  }

  const ttl = await redis.ttl(redisKey);
  const remaining = Math.max(0, maxAttempts - current);

  return {
    allowed: current <= maxAttempts,
    remaining,
    resetIn: ttl > 0 ? ttl : windowSeconds,
  };
}

export async function resetRateLimit(key: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${RATE_LIMIT_PREFIX}${key}`);
}

// Cookie helper types and functions
import { FastifyReply } from 'fastify';

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  maxAge: number;
  domain?: string;
}

/**
 * Get default cookie options based on environment
 */
export function getCookieOptions(maxAge: number): CookieOptions {
  const isProduction = env.NODE_ENV === 'production';

  return {
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: isProduction, // HTTPS only in production
    sameSite: isProduction ? 'strict' : 'lax', // CSRF protection
    path: '/',
    maxAge, // In seconds
    // domain is not set - defaults to current domain
  };
}

/**
 * Set authentication cookies on the response
 */
export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string }
): void {
  // Set access token cookie
  reply.setCookie(
    COOKIE_CONFIG.accessToken.name,
    tokens.accessToken,
    getCookieOptions(COOKIE_CONFIG.accessToken.maxAge)
  );

  // Set refresh token cookie
  reply.setCookie(
    COOKIE_CONFIG.refreshToken.name,
    tokens.refreshToken,
    getCookieOptions(COOKIE_CONFIG.refreshToken.maxAge)
  );
}

/**
 * Clear authentication cookies on the response
 */
export function clearAuthCookies(reply: FastifyReply): void {
  const clearOptions = getCookieOptions(0);

  reply.setCookie(COOKIE_CONFIG.accessToken.name, '', clearOptions);
  reply.setCookie(COOKIE_CONFIG.refreshToken.name, '', clearOptions);
}

/**
 * Extract access token from request (checks both Authorization header and cookies)
 * Priority: Authorization header > Cookie
 */
export function extractAccessToken(request: FastifyRequest): string | null {
  // First check Authorization header (for VS Code extension and API clients)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Then check cookies (for web browser)
  const cookies = request.cookies;
  if (cookies && COOKIE_CONFIG.accessToken.name in cookies) {
    return cookies[COOKIE_CONFIG.accessToken.name] || null;
  }

  return null;
}

/**
 * Extract refresh token from request (checks both body and cookies)
 * Priority: Request body > Cookie
 */
export function extractRefreshToken(request: FastifyRequest): string | null {
  // First check request body (for explicit refresh requests)
  const body = request.body as { refreshToken?: string } | undefined;
  if (body?.refreshToken) {
    return body.refreshToken;
  }

  // Then check cookies (for web browser)
  const cookies = request.cookies;
  if (cookies && COOKIE_CONFIG.refreshToken.name in cookies) {
    return cookies[COOKIE_CONFIG.refreshToken.name] || null;
  }

  return null;
}

/**
 * Check if request is from a web browser (vs API client/extension)
 */
export function isWebBrowserRequest(request: FastifyRequest): boolean {
  const userAgent = request.headers['user-agent'] || '';

  // VS Code extension or API clients typically have specific user agents
  if (userAgent.includes('VSCode') || userAgent.includes('RepoRivals-Extension')) {
    return false;
  }

  // Check Accept header - browsers typically accept text/html
  const accept = request.headers.accept || '';
  if (accept.includes('text/html') || accept.includes('*/*')) {
    return true;
  }

  // Check if request has cookies (browsers send cookies)
  if (request.cookies && Object.keys(request.cookies).length > 0) {
    return true;
  }

  return false;
}
