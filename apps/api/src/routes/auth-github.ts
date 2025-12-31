import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { env } from '../lib/env';

/**
 * GitHub OAuth endpoints
 * Implements the Authorization Code flow for GitHub OAuth
 */

// OAuth state store (would use Redis in production)
interface OAuthStateEntry {
  state: string;
  redirectUrl: string;
  linkToUserId?: string; // For account linking
  createdAt: Date;
  expiresAt: Date;
}

const oauthStates: Map<string, OAuthStateEntry> = new Map();

// Session store for authenticated users (would use Redis/sessions in production)
interface SessionEntry {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
}

const sessions: Map<string, SessionEntry> = new Map();

// Mock user database (would be real DB in production)
interface MockUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  githubId?: string;
  githubUsername?: string;
}

const mockUsers = new Map<string, MockUser>();
const usersByGithubId = new Map<string, string>(); // githubId -> userId

// Helper to generate secure random strings
function generateSecureString(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Generate JWT-like access token (simplified for demo)
function generateAccessToken(userId: string): string {
  const payload = {
    sub: userId,
    iat: Date.now(),
    exp: Date.now() + 15 * 60 * 1000, // 15 minutes
    type: 'access',
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function generateRefreshToken(): string {
  return generateSecureString(64);
}

// Cleanup expired entries
function cleanupExpiredEntries() {
  const now = new Date();

  for (const [state, entry] of oauthStates.entries()) {
    if (entry.expiresAt < now) {
      oauthStates.delete(state);
    }
  }

  for (const [token, entry] of sessions.entries()) {
    if (entry.expiresAt < now) {
      sessions.delete(token);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredEntries, 60 * 1000);

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
}

// Schemas
const callbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});

const linkRequestSchema = z.object({
  redirectUrl: z.string().optional(),
});

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

    // Store state
    oauthStates.set(state, {
      state,
      redirectUrl,
      linkToUserId: query.link, // If linking to existing account
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
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

    // Validate state
    const stateEntry = oauthStates.get(query.state);
    if (!stateEntry) {
      return reply.redirect(`${env.WEB_URL}/login?error=invalid_state&error_description=Invalid+or+expired+state`);
    }

    // Remove state (one-time use)
    oauthStates.delete(query.state);

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

      const tokenData = (await tokenResponse.json()) as GitHubTokenResponse & { error?: string; error_description?: string };

      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      const githubAccessToken = tokenData.access_token;

      // Fetch user info from GitHub
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${githubAccessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'CodeArena',
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
            'User-Agent': 'CodeArena',
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

      // Check if user exists with this GitHub ID
      let userId = usersByGithubId.get(String(githubUser.id));
      let user: MockUser;

      if (userId) {
        // Existing user - update info
        user = mockUsers.get(userId)!;
        user.displayName = githubUser.name || githubUser.login;
        user.avatarUrl = githubUser.avatar_url;
        user.githubUsername = githubUser.login;
      } else if (stateEntry.linkToUserId) {
        // Linking to existing account
        user = mockUsers.get(stateEntry.linkToUserId)!;
        if (!user) {
          return reply.redirect(`${env.WEB_URL}/login?error=user_not_found`);
        }
        user.githubId = String(githubUser.id);
        user.githubUsername = githubUser.login;
        usersByGithubId.set(String(githubUser.id), user.id);
        userId = user.id;
      } else {
        // New user - create account
        userId = `github-${githubUser.id}`;
        user = {
          id: userId,
          email,
          displayName: githubUser.name || githubUser.login,
          avatarUrl: githubUser.avatar_url,
          githubId: String(githubUser.id),
          githubUsername: githubUser.login,
        };
        mockUsers.set(userId, user);
        usersByGithubId.set(String(githubUser.id), userId);
      }

      // Generate our tokens
      const accessToken = generateAccessToken(userId);
      const refreshToken = generateRefreshToken();

      // Store session
      sessions.set(refreshToken, {
        userId,
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        createdAt: new Date(),
      });

      // Redirect back to web app with tokens
      const params = new URLSearchParams({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: '900', // 15 minutes
        token_type: 'Bearer',
      });

      return reply.redirect(`${stateEntry.redirectUrl}?auth=success&${params.toString()}`);
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
    // In production, would verify auth token and get user ID
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    // Check if GitHub OAuth is configured
    if (!env.GITHUB_CLIENT_ID) {
      return reply.status(503).send({
        error: 'github_not_configured',
        errorDescription: 'GitHub OAuth is not configured',
      });
    }

    const body = request.body as { redirectUrl?: string };
    const redirectUrl = body.redirectUrl || `${env.WEB_URL}/settings`;

    // In production, would extract user ID from token
    const userId = 'current-user-id'; // Placeholder

    // Generate state for CSRF protection
    const state = generateSecureString(32);

    // Store state with link flag
    oauthStates.set(state, {
      state,
      redirectUrl,
      linkToUserId: userId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
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
    // In production, would verify auth token and get user ID
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    // Placeholder - in production would:
    // 1. Get user from token
    // 2. Remove GitHub link from user record
    // 3. Remove from usersByGithubId map

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

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(200).send({
        configured: isConfigured,
        linked: false,
      });
    }

    // In production, would check if user has GitHub linked
    // For now, return placeholder

    return reply.status(200).send({
      configured: isConfigured,
      linked: false,
      scopes: ['read:user', 'user:email'],
    });
  });
}
