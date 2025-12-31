/**
 * Authentication Routes
 *
 * Implements secure session management with:
 * - Device code flow for VS Code extension
 * - JWT access tokens (15 min expiry)
 * - Refresh token rotation (30 day expiry)
 * - Session/device management
 * - Rate limiting on auth endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  generateTokenPair,
  refreshTokens,
  verifyAccessToken,
  revokeSession,
  revokeAllSessions,
  getUserSessions,
  getUserById,
  getDeviceInfo,
  createDeviceCode,
  getDeviceCode,
  getDeviceCodeByUserCode,
  authorizeDeviceCode,
  consumeDeviceCode,
  cleanupExpiredDeviceCodes,
  checkRateLimit,
  blacklistAccessToken,
  setAuthCookies,
  clearAuthCookies,
  extractAccessToken,
  extractRefreshToken,
  isWebBrowserRequest,
} from '../lib/session';
import { env } from '../lib/env';

// Cleanup expired device codes every minute
setInterval(cleanupExpiredDeviceCodes, 60 * 1000);

// Request schemas
const deviceConfirmRequestSchema = z.object({
  deviceCode: z.string().min(1),
});

const authorizeRequestSchema = z.object({
  userCode: z.string().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
});

const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

// Rate limit configuration
const AUTH_RATE_LIMIT = {
  refresh: { max: 10, window: 60 }, // 10 requests per minute
  login: { max: 5, window: 300 }, // 5 requests per 5 minutes
  deviceStart: { max: 10, window: 300 }, // 10 device flows per 5 minutes
};

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/device/start
   * Start the device code flow (for VS Code extension)
   */
  app.post('/api/auth/device/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const deviceInfo = getDeviceInfo(request);
    const rateLimitKey = `device:${deviceInfo.ipAddress || 'unknown'}`;

    const { allowed, remaining, resetIn } = await checkRateLimit(
      rateLimitKey,
      AUTH_RATE_LIMIT.deviceStart.max,
      AUTH_RATE_LIMIT.deviceStart.window
    );

    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', resetIn);

    if (!allowed) {
      return reply.status(429).send({
        error: 'rate_limit_exceeded',
        errorDescription: 'Too many device code requests. Please try again later.',
        retryAfter: resetIn,
      });
    }

    const entry = createDeviceCode();

    return reply.status(200).send({
      deviceCode: entry.deviceCode,
      userCode: entry.userCode,
      verificationUri: entry.verificationUri,
      verificationUriComplete: `${entry.verificationUri}?code=${entry.userCode}`,
      expiresIn: Math.floor((entry.expiresAt.getTime() - Date.now()) / 1000),
      interval: entry.interval,
    });
  });

  /**
   * POST /api/auth/device/confirm
   * Poll endpoint for the device to check authorization status
   */
  app.post('/api/auth/device/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = deviceConfirmRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        errorDescription: 'Invalid request body',
      });
    }

    const { deviceCode } = parseResult.data;
    const entry = getDeviceCode(deviceCode);

    if (!entry) {
      return reply.status(400).send({
        error: 'invalid_grant',
        errorDescription: 'Invalid or expired device code',
      });
    }

    if (entry.expiresAt < new Date()) {
      consumeDeviceCode(deviceCode);
      return reply.status(400).send({
        error: 'expired_token',
        errorDescription: 'Device code has expired',
      });
    }

    if (!entry.authorized || !entry.userId || !entry.tokens) {
      return reply.status(400).send({
        error: 'authorization_pending',
        errorDescription: 'Waiting for user authorization',
      });
    }

    // Consume and cleanup
    const authorizedEntry = consumeDeviceCode(deviceCode);
    if (!authorizedEntry?.tokens) {
      return reply.status(400).send({
        error: 'invalid_grant',
        errorDescription: 'Authorization failed',
      });
    }

    // Get user info
    const user = await getUserById(authorizedEntry.userId!);

    return reply.status(200).send({
      accessToken: authorizedEntry.tokens.accessToken,
      refreshToken: authorizedEntry.tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: authorizedEntry.tokens.expiresIn,
      user: user ? {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      } : null,
    });
  });

  /**
   * POST /api/auth/device/authorize
   * Called from the web app when user authorizes the device
   */
  app.post('/api/auth/device/authorize', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = authorizeRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        errorDescription: 'Invalid user code format',
      });
    }

    const { userCode } = parseResult.data;
    const entry = getDeviceCodeByUserCode(userCode);

    if (!entry) {
      return reply.status(400).send({
        error: 'invalid_grant',
        errorDescription: 'Invalid or expired user code',
      });
    }

    if (entry.expiresAt < new Date()) {
      return reply.status(400).send({
        error: 'expired_token',
        errorDescription: 'Code has expired',
      });
    }

    if (entry.authorized) {
      return reply.status(400).send({
        error: 'invalid_grant',
        errorDescription: 'Code already used',
      });
    }

    // Get authenticated user from access token
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Authentication required',
      });
    }

    const accessToken = authHeader.slice(7);
    const payload = await verifyAccessToken(app, accessToken);

    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    // Generate tokens for the device
    const deviceInfo = {
      deviceName: 'VS Code Extension',
      deviceType: 'vscode',
      ipAddress: getDeviceInfo(request).ipAddress,
    };

    const { accessToken: newAccessToken, refreshToken, expiresIn } = await generateTokenPair(
      app,
      payload.sub,
      deviceInfo
    );

    // Authorize the device code
    const authorized = authorizeDeviceCode(userCode, payload.sub, {
      accessToken: newAccessToken,
      refreshToken,
      expiresIn,
    });

    if (!authorized) {
      return reply.status(400).send({
        error: 'invalid_grant',
        errorDescription: 'Failed to authorize device',
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'Device authorized successfully',
    });
  });

  /**
   * GET /api/auth/device/status
   * Check device code status (for the web UI)
   */
  app.get('/api/auth/device/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { userCode } = request.query as { userCode?: string };

    if (!userCode) {
      return reply.status(400).send({
        error: 'invalid_request',
        errorDescription: 'User code required',
      });
    }

    const entry = getDeviceCodeByUserCode(userCode);

    if (!entry) {
      return reply.status(404).send({
        error: 'not_found',
        errorDescription: 'Invalid or expired user code',
      });
    }

    if (entry.expiresAt < new Date()) {
      return reply.status(400).send({
        error: 'expired_token',
        errorDescription: 'Code has expired',
      });
    }

    return reply.status(200).send({
      valid: true,
      authorized: entry.authorized,
      expiresIn: Math.floor((entry.expiresAt.getTime() - Date.now()) / 1000),
    });
  });

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token (with rotation and reuse detection)
   * Supports both cookie-based (web) and body-based (extension) refresh tokens
   */
  app.post('/api/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const deviceInfo = getDeviceInfo(request);
    const rateLimitKey = `refresh:${deviceInfo.ipAddress || 'unknown'}`;

    const { allowed, remaining, resetIn } = await checkRateLimit(
      rateLimitKey,
      AUTH_RATE_LIMIT.refresh.max,
      AUTH_RATE_LIMIT.refresh.window
    );

    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', resetIn);

    if (!allowed) {
      return reply.status(429).send({
        error: 'rate_limit_exceeded',
        errorDescription: 'Too many refresh requests',
        retryAfter: resetIn,
      });
    }

    // Extract refresh token from body or cookies
    const refreshToken = extractRefreshToken(request);
    if (!refreshToken) {
      return reply.status(400).send({
        error: 'invalid_request',
        errorDescription: 'Refresh token required',
      });
    }

    const result = await refreshTokens(app, refreshToken, deviceInfo);

    if (!result.success) {
      // Clear cookies on failure for web clients
      if (isWebBrowserRequest(request)) {
        clearAuthCookies(reply);
      }

      // Handle different error types
      if (result.error === 'token_reuse_detected') {
        // Security alert: potential token theft detected
        // Return a specific error so the client knows to force re-authentication
        return reply.status(401).send({
          error: 'token_reuse_detected',
          errorDescription: 'Security alert: This refresh token was already used. Your session has been revoked for security. Please sign in again.',
          sessionsRevoked: result.sessionsRevoked,
        });
      }

      return reply.status(401).send({
        error: 'invalid_grant',
        errorDescription: 'Invalid or expired refresh token',
      });
    }

    // Set cookies for web clients
    if (isWebBrowserRequest(request)) {
      setAuthCookies(reply, {
        accessToken: result.tokens!.accessToken,
        refreshToken: result.tokens!.refreshToken,
      });
    }

    return reply.status(200).send({
      accessToken: result.tokens!.accessToken,
      refreshToken: result.tokens!.refreshToken,
      tokenType: 'Bearer',
      expiresIn: result.tokens!.expiresIn,
    });
  });

  /**
   * POST /api/auth/logout
   * Logout and invalidate current session
   * Supports both cookie-based (web) and header-based (extension) tokens
   */
  app.post('/api/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    // Extract access token from header or cookies
    const accessToken = extractAccessToken(request);

    if (accessToken) {
      const payload = await verifyAccessToken(app, accessToken);

      if (payload?.sessionId) {
        // Revoke the session
        await revokeSession(payload.sessionId, payload.sub);

        // Blacklist the access token for its remaining lifetime
        const exp = payload.exp ?? 0;
        const remainingSeconds = Math.max(0, exp - Math.floor(Date.now() / 1000));
        if (remainingSeconds > 0) {
          await blacklistAccessToken(accessToken, remainingSeconds);
        }
      }
    }

    // Always clear cookies for web clients
    clearAuthCookies(reply);

    return reply.status(200).send({
      success: true,
      message: 'Logged out successfully',
    });
  });

  /**
   * POST /api/auth/logout-all
   * Logout from all devices
   * Supports both cookie-based (web) and header-based (extension) tokens
   */
  app.post('/api/auth/logout-all', async (request: FastifyRequest, reply: FastifyReply) => {
    const accessToken = extractAccessToken(request);

    if (!accessToken) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const payload = await verifyAccessToken(app, accessToken);

    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    // Revoke all sessions
    const count = await revokeAllSessions(payload.sub);

    // Blacklist current access token
    const exp = payload.exp ?? 0;
    const remainingSeconds = Math.max(0, exp - Math.floor(Date.now() / 1000));
    if (remainingSeconds > 0) {
      await blacklistAccessToken(accessToken, remainingSeconds);
    }

    // Clear cookies for web clients
    clearAuthCookies(reply);

    return reply.status(200).send({
      success: true,
      message: `Logged out from ${count} device(s)`,
      sessionsRevoked: count,
    });
  });

  /**
   * GET /api/auth/me
   * Get current user info from access token
   * Supports both cookie-based (web) and header-based (extension) tokens
   */
  app.get('/api/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractAccessToken(request);

    if (!token) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const payload = await verifyAccessToken(app, token);

    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    const user = await getUserById(payload.sub);

    if (!user) {
      return reply.status(404).send({
        error: 'not_found',
        errorDescription: 'User not found',
      });
    }

    return reply.status(200).send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      roles: user.roles,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    });
  });

  /**
   * GET /api/auth/sessions
   * Get all active sessions for current user
   * Supports both cookie-based (web) and header-based (extension) tokens
   */
  app.get('/api/auth/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractAccessToken(request);

    if (!token) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const payload = await verifyAccessToken(app, token);

    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    const sessions = await getUserSessions(payload.sub, payload.sessionId);

    return reply.status(200).send({
      sessions,
    });
  });

  /**
   * DELETE /api/auth/sessions/:sessionId
   * Revoke a specific session
   * Supports both cookie-based (web) and header-based (extension) tokens
   */
  app.delete('/api/auth/sessions/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractAccessToken(request);

    if (!token) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const payload = await verifyAccessToken(app, token);

    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    const { sessionId } = request.params as { sessionId: string };

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return reply.status(400).send({
        error: 'invalid_request',
        errorDescription: 'Invalid session ID format',
      });
    }

    // Only allow revoking own sessions
    const revoked = await revokeSession(sessionId, payload.sub);

    if (!revoked) {
      return reply.status(404).send({
        error: 'not_found',
        errorDescription: 'Session not found',
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'Session revoked successfully',
    });
  });
}
