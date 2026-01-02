/**
 * GitHub OAuth Routes
 *
 * Implements the Authorization Code flow for GitHub OAuth
 * with proper database integration and session management.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
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
const OAUTH_STATE_PREFIX = 'oauth:state:';
const STATE_EXPIRY_SECONDS = 600; // 10 minutes

// GitHub API types
interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

interface OAuthState {
  redirectUrl: string;
  linkToUserId?: string;
}

// Helper to generate secure random strings
function generateSecureString(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
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

export async function authGitHubRoutes(app: FastifyInstance) {
  /**
   * GET /api/auth/github
   * Initiate GitHub OAuth flow - redirects to GitHub authorization page
   */
  app.get('/api/auth/github', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { redirect?: string; link?: string };

    // Check if GitHub OAuth is configured
    if (!env.GITHUB_CLIENT_ID) {
      return reply.status(503).send({
        error: 'github_not_configured',
        errorDescription: 'GitHub OAuth is not configured',
      });
    }

    // Generate state for CSRF protection
    const state = generateSecureString(32);
    const redirectUrl = query.redirect || `${env.WEB_URL}/`;

    // Store state in Redis
    await storeOAuthState(state, {
      redirectUrl,
      linkToUserId: query.link,
    });

    // Build GitHub authorization URL
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: env.GITHUB_CALLBACK_URL || `${env.API_URL}/api/auth/github/callback`,
      scope: 'read:user user:email',
      state,
      allow_signup: 'true',
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

    return reply.redirect(authUrl);
  });

  /**
   * GET /api/auth/github/callback
   * Handle GitHub OAuth callback
   */
  app.get('/api/auth/github/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };

    // Handle OAuth errors from GitHub
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

    // Check if GitHub OAuth is configured
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return reply.redirect(`${env.WEB_URL}/login?error=github_not_configured`);
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code: query.code,
          redirect_uri: env.GITHUB_CALLBACK_URL || `${env.API_URL}/api/auth/github/callback`,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for token');
      }

      const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      const githubAccessToken = tokenData.access_token;

      // Fetch user info from GitHub
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${githubAccessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoRivals',
        },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to fetch GitHub user info');
      }

      const githubUser = (await userResponse.json()) as GitHubUser;

      // Fetch user emails if email not in profile
      let email = githubUser.email;
      if (!email) {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `Bearer ${githubAccessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'RepoRivals',
          },
        });

        if (emailsResponse.ok) {
          const emails = (await emailsResponse.json()) as GitHubEmail[];
          const primaryEmail = emails.find((e) => e.primary && e.verified);
          email = primaryEmail?.email || emails[0]?.email || null;
        }
      }

      if (!email) {
        return reply.redirect(`${env.WEB_URL}/login?error=no_email&error_description=Unable+to+get+email+from+GitHub`);
      }

      // Check if OAuth account exists
      const [existingOAuth] = await db
        .select()
        .from(oauthAccounts)
        .where(eq(oauthAccounts.providerUserId, String(githubUser.id)))
        .limit(1);

      let userId: string;

      if (existingOAuth) {
        // Existing OAuth connection - use that user
        userId = existingOAuth.userId;

        // Update user info
        await db
          .update(users)
          .set({
            displayName: githubUser.name || githubUser.login,
            avatarUrl: githubUser.avatar_url,
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

        // Create OAuth account link
        await db.insert(oauthAccounts).values({
          userId: existingUser.id,
          provider: 'github',
          providerUserId: String(githubUser.id),
          scopes: ['read:user', 'user:email'],
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
          // Link GitHub to existing account
          await db.insert(oauthAccounts).values({
            userId: existingUser.id,
            provider: 'github',
            providerUserId: String(githubUser.id),
            scopes: ['read:user', 'user:email'],
          });

          // Update last login
          await db
            .update(users)
            .set({
              lastLoginAt: new Date(),
              avatarUrl: existingUser.avatarUrl || githubUser.avatar_url,
            })
            .where(eq(users.id, existingUser.id));

          userId = existingUser.id;
        } else {
          // Create new user
          const [newUser] = await db
            .insert(users)
            .values({
              email,
              displayName: githubUser.name || githubUser.login,
              avatarUrl: githubUser.avatar_url,
              isVerified: true, // Email verified via GitHub
              lastLoginAt: new Date(),
            })
            .returning();

          // Create OAuth account link
          await db.insert(oauthAccounts).values({
            userId: newUser.id,
            provider: 'github',
            providerUserId: String(githubUser.id),
            scopes: ['read:user', 'user:email'],
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

      const separator = stateData.redirectUrl.includes('?') ? '&' : '?';
      return reply.redirect(`${stateData.redirectUrl}${separator}auth=success&${params.toString()}`);
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      const message = error instanceof Error ? error.message : 'OAuth failed';
      return reply.redirect(`${env.WEB_URL}/login?error=oauth_error&error_description=${encodeURIComponent(message)}`);
    }
  });

  /**
   * POST /api/auth/github/link
   * Link GitHub account to existing user (requires auth)
   */
  app.post('/api/auth/github/link', async (request: FastifyRequest, reply: FastifyReply) => {
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

    // Check if GitHub OAuth is configured
    if (!env.GITHUB_CLIENT_ID) {
      return reply.status(503).send({
        error: 'github_not_configured',
        errorDescription: 'GitHub OAuth is not configured',
      });
    }

    // Check if user already has GitHub linked
    const [existingOAuth] = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, payload.sub))
      .limit(1);

    if (existingOAuth) {
      return reply.status(400).send({
        error: 'already_linked',
        errorDescription: 'GitHub account already linked',
      });
    }

    const body = request.body as { redirectUrl?: string };
    const redirectUrl = body.redirectUrl || `${env.WEB_URL}/settings`;

    // Generate state for CSRF protection
    const state = generateSecureString(32);

    // Store state with link flag
    await storeOAuthState(state, {
      redirectUrl,
      linkToUserId: payload.sub,
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: env.GITHUB_CALLBACK_URL || `${env.API_URL}/api/auth/github/callback`,
      scope: 'read:user user:email',
      state,
    });

    return reply.status(200).send({
      authUrl: `https://github.com/login/oauth/authorize?${params.toString()}`,
    });
  });

  /**
   * DELETE /api/auth/github/unlink
   * Unlink GitHub account from user (requires auth)
   */
  app.delete('/api/auth/github/unlink', async (request: FastifyRequest, reply: FastifyReply) => {
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
      .where(eq(oauthAccounts.userId, payload.sub));

    if ((result.rowCount ?? 0) === 0) {
      return reply.status(404).send({
        error: 'not_found',
        errorDescription: 'No GitHub account linked',
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'GitHub account unlinked',
    });
  });

  /**
   * GET /api/auth/github/status
   * Check if GitHub is configured and user has linked account
   */
  app.get('/api/auth/github/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    const isConfigured = !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

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

    // Check if user has GitHub linked
    const [oauthAccount] = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, payload.sub))
      .limit(1);

    return reply.status(200).send({
      configured: isConfigured,
      linked: !!oauthAccount,
      scopes: oauthAccount?.scopes || [],
    });
  });
}
