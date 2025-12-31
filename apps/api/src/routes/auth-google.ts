/**
 * Google OAuth Routes
 *
 * Implements the Authorization Code flow with PKCE for Google OAuth
 * with proper database integration and session management.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { users, oauthAccounts } from '../db/schema';
import { env } from '../lib/env';
import { getRedis } from '../lib/redis';
import {
  generateTokenPair,
  verifyAccessToken,
  getDeviceInfo,
} from '../lib/session';

// Redis key prefix for OAuth state
const OAUTH_STATE_PREFIX = 'oauth:google:state:';
const STATE_EXPIRY_SECONDS = 600; // 10 minutes

// Google OAuth endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Google API types
interface GoogleUser {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
}

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface OAuthState {
  redirectUrl: string;
  linkToUserId?: string;
  codeVerifier: string;
}

// Helper to generate secure random strings
function generateSecureString(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Generate code verifier for PKCE
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Generate code challenge from verifier (S256 method)
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// Store OAuth state in Redis
async function storeOAuthState(state: string, data: OAuthState): Promise<void> {
  const redis = getRedis();
  await redis.setex(
    `${OAUTH_STATE_PREFIX}${state}`,
    STATE_EXPIRY_SECONDS,
    JSON.stringify(data)
  );
}

// Retrieve and delete OAuth state from Redis
async function consumeOAuthState(state: string): Promise<OAuthState | null> {
  const redis = getRedis();
  const key = `${OAUTH_STATE_PREFIX}${state}`;
  const data = await redis.get(key);

  if (!data) return null;

  // Delete after retrieval (one-time use)
  await redis.del(key);

  try {
    return JSON.parse(data) as OAuthState;
  } catch {
    return null;
  }
}

export async function authGoogleRoutes(app: FastifyInstance) {
  /**
   * GET /api/auth/google
   * Initiate Google OAuth flow - redirects to Google authorization page
   */
  app.get('/api/auth/google', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { redirect?: string; link?: string };

    // Check if Google OAuth is configured
    if (!env.GOOGLE_CLIENT_ID) {
      return reply.status(503).send({
        error: 'google_not_configured',
        errorDescription: 'Google OAuth is not configured',
      });
    }

    // Generate state for CSRF protection
    const state = generateSecureString(32);
    const redirectUrl = query.redirect || `${env.WEB_URL}/`;

    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store state in Redis with code verifier
    await storeOAuthState(state, {
      redirectUrl,
      linkToUserId: query.link,
      codeVerifier,
    });

    // Build Google authorization URL
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL || `${env.API_URL}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
      // PKCE parameters
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

    return reply.redirect(authUrl);
  });

  /**
   * GET /api/auth/google/callback
   * Handle Google OAuth callback
   */
  app.get('/api/auth/google/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };

    // Handle OAuth errors from Google
    if (query.error) {
      const errorUrl = `${env.WEB_URL}/login?error=${encodeURIComponent(query.error)}&error_description=${encodeURIComponent(query.error_description || '')}`;
      return reply.redirect(errorUrl);
    }

    // Validate required params
    if (!query.code || !query.state) {
      return reply.redirect(`${env.WEB_URL}/login?error=invalid_request&error_description=Missing+code+or+state`);
    }

    // Validate and consume state
    const stateData = await consumeOAuthState(query.state);
    if (!stateData) {
      return reply.redirect(`${env.WEB_URL}/login?error=invalid_state&error_description=Invalid+or+expired+state`);
    }

    // Check if Google OAuth is configured
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return reply.redirect(`${env.WEB_URL}/login?error=google_not_configured`);
    }

    try {
      // Exchange code for access token with PKCE
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          code: query.code,
          redirect_uri: env.GOOGLE_CALLBACK_URL || `${env.API_URL}/api/auth/google/callback`,
          grant_type: 'authorization_code',
          code_verifier: stateData.codeVerifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Google token exchange failed:', errorText);
        throw new Error('Failed to exchange code for token');
      }

      const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      const googleAccessToken = tokenData.access_token;

      // Fetch user info from Google
      const userResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`,
        },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to fetch Google user info');
      }

      const googleUser = (await userResponse.json()) as GoogleUser;

      // Validate email
      if (!googleUser.email || !googleUser.verified_email) {
        return reply.redirect(`${env.WEB_URL}/login?error=unverified_email&error_description=Google+account+email+must+be+verified`);
      }

      const email = googleUser.email;

      // Check if OAuth account exists
      const [existingOAuth] = await db
        .select()
        .from(oauthAccounts)
        .where(
          and(
            eq(oauthAccounts.provider, 'google'),
            eq(oauthAccounts.providerUserId, googleUser.id)
          )
        )
        .limit(1);

      let userId: string;

      if (existingOAuth) {
        // Existing OAuth connection - use that user
        userId = existingOAuth.userId;

        // Update user info
        await db
          .update(users)
          .set({
            displayName: googleUser.name || email.split('@')[0],
            avatarUrl: googleUser.picture,
            lastLoginAt: new Date(),
          })
          .where(eq(users.id, userId));
      } else if (stateData.linkToUserId) {
        // Linking to existing account
        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, stateData.linkToUserId))
          .limit(1);

        if (!existingUser) {
          return reply.redirect(`${env.WEB_URL}/login?error=user_not_found`);
        }

        // Check if user already has Google linked
        const [existingGoogleLink] = await db
          .select()
          .from(oauthAccounts)
          .where(
            and(
              eq(oauthAccounts.userId, existingUser.id),
              eq(oauthAccounts.provider, 'google')
            )
          )
          .limit(1);

        if (existingGoogleLink) {
          return reply.redirect(`${env.WEB_URL}/settings?error=already_linked&error_description=Google+account+already+linked`);
        }

        // Create OAuth account link
        await db.insert(oauthAccounts).values({
          userId: existingUser.id,
          provider: 'google',
          providerUserId: googleUser.id,
          scopes: ['openid', 'email', 'profile'],
        });

        userId = existingUser.id;
      } else {
        // Check if user exists with this email
        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUser) {
          // Link Google to existing account
          await db.insert(oauthAccounts).values({
            userId: existingUser.id,
            provider: 'google',
            providerUserId: googleUser.id,
            scopes: ['openid', 'email', 'profile'],
          });

          // Update last login
          await db
            .update(users)
            .set({
              lastLoginAt: new Date(),
              avatarUrl: existingUser.avatarUrl || googleUser.picture,
            })
            .where(eq(users.id, existingUser.id));

          userId = existingUser.id;
        } else {
          // Create new user
          const [newUser] = await db
            .insert(users)
            .values({
              email,
              displayName: googleUser.name || email.split('@')[0],
              avatarUrl: googleUser.picture,
              isVerified: true, // Email verified via Google
              lastLoginAt: new Date(),
            })
            .returning();

          // Create OAuth account link
          await db.insert(oauthAccounts).values({
            userId: newUser.id,
            provider: 'google',
            providerUserId: googleUser.id,
            scopes: ['openid', 'email', 'profile'],
          });

          userId = newUser.id;
        }
      }

      // Generate tokens using proper session management
      const deviceInfo = {
        deviceName: 'Web Browser',
        ...getDeviceInfo(request),
      };

      const { accessToken, refreshToken, expiresIn } = await generateTokenPair(
        app,
        userId,
        deviceInfo
      );

      // Redirect back to web app with tokens
      const params = new URLSearchParams({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: String(expiresIn),
        token_type: 'Bearer',
      });

      return reply.redirect(`${stateData.redirectUrl}?auth=success&${params.toString()}`);
    } catch (error) {
      console.error('Google OAuth error:', error);
      const message = error instanceof Error ? error.message : 'OAuth failed';
      return reply.redirect(`${env.WEB_URL}/login?error=oauth_error&error_description=${encodeURIComponent(message)}`);
    }
  });

  /**
   * POST /api/auth/google/link
   * Link Google account to existing user (requires auth)
   */
  app.post('/api/auth/google/link', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
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

    // Check if Google OAuth is configured
    if (!env.GOOGLE_CLIENT_ID) {
      return reply.status(503).send({
        error: 'google_not_configured',
        errorDescription: 'Google OAuth is not configured',
      });
    }

    // Check if user already has Google linked
    const [existingOAuth] = await db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.userId, payload.sub),
          eq(oauthAccounts.provider, 'google')
        )
      )
      .limit(1);

    if (existingOAuth) {
      return reply.status(400).send({
        error: 'already_linked',
        errorDescription: 'Google account already linked',
      });
    }

    const body = request.body as { redirectUrl?: string };
    const redirectUrl = body.redirectUrl || `${env.WEB_URL}/settings`;

    // Generate state for CSRF protection
    const state = generateSecureString(32);

    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store state with link flag
    await storeOAuthState(state, {
      redirectUrl,
      linkToUserId: payload.sub,
      codeVerifier,
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL || `${env.API_URL}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return reply.status(200).send({
      authUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    });
  });

  /**
   * DELETE /api/auth/google/unlink
   * Unlink Google account from user (requires auth)
   */
  app.delete('/api/auth/google/unlink', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
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

    // Find and delete OAuth link
    const result = await db
      .delete(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.userId, payload.sub),
          eq(oauthAccounts.provider, 'google')
        )
      );

    if ((result.rowCount ?? 0) === 0) {
      return reply.status(404).send({
        error: 'not_found',
        errorDescription: 'No Google account linked',
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'Google account unlinked',
    });
  });

  /**
   * GET /api/auth/google/status
   * Check if Google is configured and user has linked account
   */
  app.get('/api/auth/google/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    const isConfigured = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(200).send({
        configured: isConfigured,
        linked: false,
      });
    }

    const accessToken = authHeader.slice(7);
    const payload = await verifyAccessToken(app, accessToken);

    if (!payload) {
      return reply.status(200).send({
        configured: isConfigured,
        linked: false,
      });
    }

    // Check if user has Google linked
    const [oauthAccount] = await db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.userId, payload.sub),
          eq(oauthAccounts.provider, 'google')
        )
      )
      .limit(1);

    return reply.status(200).send({
      configured: isConfigured,
      linked: !!oauthAccount,
      scopes: oauthAccount?.scopes || [],
    });
  });
}
