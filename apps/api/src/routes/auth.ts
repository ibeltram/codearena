import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';

// In-memory store for device codes (would use Redis in production)
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

interface RefreshTokenEntry {
  userId: string;
  deviceId: string;
  createdAt: Date;
  expiresAt: Date;
}

// Simple in-memory stores (would be Redis in production)
const deviceCodes: Map<string, DeviceCodeEntry> = new Map();
const refreshTokens: Map<string, RefreshTokenEntry> = new Map();
const usersByCode: Map<string, string> = new Map(); // userCode -> deviceCode

// Mock user database (would be real DB in production)
const mockUsers = new Map<string, { id: string; email: string; displayName: string; avatarUrl?: string }>();

// Initialize some mock users
mockUsers.set('test-user-1', {
  id: 'test-user-1',
  email: 'test@codearena.dev',
  displayName: 'Test User',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test',
});

// Helper functions
function generateCode(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

function generateUserCode(): string {
  // Generate an 8-character alphanumeric code (easy to type)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0, O, I, 1)
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Format as XXXX-XXXX for readability
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function generateAccessToken(userId: string): string {
  // In production, use JWT with proper signing
  const payload = {
    sub: userId,
    iat: Date.now(),
    exp: Date.now() + 15 * 60 * 1000, // 15 minutes
    type: 'access',
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function generateRefreshToken(): string {
  return generateCode(64);
}

function validateAccessToken(token: string): { valid: boolean; userId?: string; expired?: boolean } {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    if (payload.type !== 'access') {
      return { valid: false };
    }
    if (payload.exp < Date.now()) {
      return { valid: false, expired: true };
    }
    return { valid: true, userId: payload.sub };
  } catch {
    return { valid: false };
  }
}

// Cleanup expired entries periodically
function cleanupExpiredEntries() {
  const now = new Date();

  // Cleanup device codes
  for (const [code, entry] of deviceCodes.entries()) {
    if (entry.expiresAt < now) {
      deviceCodes.delete(code);
      // Also cleanup user code mapping
      for (const [userCode, dCode] of usersByCode.entries()) {
        if (dCode === code) {
          usersByCode.delete(userCode);
        }
      }
    }
  }

  // Cleanup refresh tokens
  for (const [token, entry] of refreshTokens.entries()) {
    if (entry.expiresAt < now) {
      refreshTokens.delete(token);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredEntries, 60 * 1000);

// Schemas
const deviceStartResponseSchema = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string(),
  expiresIn: z.number(),
  interval: z.number(),
});

const deviceConfirmRequestSchema = z.object({
  deviceCode: z.string(),
});

const authorizeRequestSchema = z.object({
  userCode: z.string(),
  // In production, would also have user authentication
});

const refreshRequestSchema = z.object({
  refreshToken: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/device/start
   * Start the device code flow
   * Returns device code, user code, and verification URL
   */
  app.post('/api/auth/device/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const deviceCode = generateCode(32);
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Get verification URL from env or default
    const verificationUri = process.env.WEB_URL
      ? `${process.env.WEB_URL}/device`
      : 'http://localhost:3001/device';

    const entry: DeviceCodeEntry = {
      deviceCode,
      userCode,
      verificationUri,
      expiresAt,
      interval: 5, // Poll interval in seconds
      authorized: false,
    };

    deviceCodes.set(deviceCode, entry);
    usersByCode.set(userCode, deviceCode);

    return reply.status(200).send({
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete: `${verificationUri}?code=${userCode}`,
      expiresIn: 600, // 10 minutes in seconds
      interval: 5, // Poll every 5 seconds
    });
  });

  /**
   * POST /api/auth/device/confirm
   * Poll endpoint for the device to check authorization status
   * Returns tokens when authorized
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
    const entry = deviceCodes.get(deviceCode);

    if (!entry) {
      return reply.status(400).send({
        error: 'invalid_grant',
        errorDescription: 'Invalid or expired device code',
      });
    }

    // Check if expired
    if (entry.expiresAt < new Date()) {
      deviceCodes.delete(deviceCode);
      return reply.status(400).send({
        error: 'expired_token',
        errorDescription: 'Device code has expired',
      });
    }

    // Check if authorized
    if (!entry.authorized || !entry.userId || !entry.tokens) {
      return reply.status(400).send({
        error: 'authorization_pending',
        errorDescription: 'Waiting for user authorization',
      });
    }

    // Return tokens and cleanup
    const { tokens, userId } = entry;
    deviceCodes.delete(deviceCode);

    // Cleanup user code mapping
    for (const [userCode, dCode] of usersByCode.entries()) {
      if (dCode === deviceCode) {
        usersByCode.delete(userCode);
      }
    }

    // Get user info
    const user = mockUsers.get(userId);

    return reply.status(200).send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
      user: user
        ? {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          }
        : null,
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
        errorDescription: 'Invalid user code',
      });
    }

    const { userCode } = parseResult.data;
    const deviceCode = usersByCode.get(userCode);

    if (!deviceCode) {
      return reply.status(400).send({
        error: 'invalid_grant',
        errorDescription: 'Invalid or expired user code',
      });
    }

    const entry = deviceCodes.get(deviceCode);
    if (!entry) {
      return reply.status(400).send({
        error: 'invalid_grant',
        errorDescription: 'Device code not found',
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

    // For demo purposes, use a mock user
    // In production, would get userId from session/auth
    const userId = 'test-user-1';

    // Generate tokens
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken();

    // Store refresh token
    refreshTokens.set(refreshToken, {
      userId,
      deviceId: deviceCode,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    // Mark as authorized
    entry.authorized = true;
    entry.userId = userId;
    entry.tokens = {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes
    };

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

    const deviceCode = usersByCode.get(userCode);
    if (!deviceCode) {
      return reply.status(404).send({
        error: 'not_found',
        errorDescription: 'Invalid or expired user code',
      });
    }

    const entry = deviceCodes.get(deviceCode);
    if (!entry) {
      return reply.status(404).send({
        error: 'not_found',
        errorDescription: 'Device code not found',
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
   * Refresh access token using refresh token
   */
  app.post('/api/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = refreshRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        errorDescription: 'Refresh token required',
      });
    }

    const { refreshToken } = parseResult.data;
    const entry = refreshTokens.get(refreshToken);

    if (!entry) {
      return reply.status(401).send({
        error: 'invalid_grant',
        errorDescription: 'Invalid refresh token',
      });
    }

    if (entry.expiresAt < new Date()) {
      refreshTokens.delete(refreshToken);
      return reply.status(401).send({
        error: 'invalid_grant',
        errorDescription: 'Refresh token expired',
      });
    }

    // Rotate refresh token (invalidate old one, create new one)
    refreshTokens.delete(refreshToken);

    const newAccessToken = generateAccessToken(entry.userId);
    const newRefreshToken = generateRefreshToken();

    refreshTokens.set(newRefreshToken, {
      userId: entry.userId,
      deviceId: entry.deviceId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    // Get user info
    const user = mockUsers.get(entry.userId);

    return reply.status(200).send({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: 900, // 15 minutes
      user: user
        ? {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          }
        : null,
    });
  });

  /**
   * POST /api/auth/logout
   * Logout and invalidate tokens
   */
  app.post('/api/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = refreshRequestSchema.safeParse(request.body);
    if (parseResult.success) {
      const { refreshToken } = parseResult.data;
      refreshTokens.delete(refreshToken);
    }

    return reply.status(200).send({
      success: true,
      message: 'Logged out successfully',
    });
  });

  /**
   * GET /api/auth/me
   * Get current user info from access token
   */
  app.get('/api/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const token = authHeader.slice(7);
    const result = validateAccessToken(token);

    if (!result.valid) {
      return reply.status(401).send({
        error: result.expired ? 'token_expired' : 'invalid_token',
        errorDescription: result.expired ? 'Access token expired' : 'Invalid access token',
      });
    }

    const user = mockUsers.get(result.userId!);

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
    });
  });
}
