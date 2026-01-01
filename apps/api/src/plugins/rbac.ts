/**
 * Role-Based Access Control (RBAC) Plugin
 *
 * Provides middleware for protecting routes based on user roles.
 * Roles: user (default), moderator, admin
 *
 * Usage:
 *   app.get('/admin/users', { preHandler: [app.authenticate, app.requireRole(['admin'])] }, handler)
 *   app.get('/disputes', { preHandler: [app.authenticate, app.requireRole(['admin', 'moderator'])] }, handler)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';

// Valid roles in the system
export type UserRole = 'user' | 'admin' | 'moderator';

// Extend FastifyRequest to include roles
declare module 'fastify' {
  interface FastifyRequest {
    userRoles?: UserRole[];
  }
  interface FastifyInstance {
    requireRole: (roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    loadUserRoles: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Load user roles from the database
 * This should be called after authenticate() to populate request.userRoles
 */
async function loadUserRoles(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user?.id) {
    return reply.status(401).send({
      error: 'unauthorized',
      message: 'Authentication required',
    });
  }

  // Fetch user roles from database
  const [user] = await db
    .select({
      roles: users.roles,
      isBanned: users.isBanned,
      suspendedUntil: users.suspendedUntil,
    })
    .from(users)
    .where(eq(users.id, request.user.id))
    .limit(1);

  if (!user) {
    return reply.status(401).send({
      error: 'unauthorized',
      message: 'User not found',
    });
  }

  if (user.isBanned) {
    return reply.status(403).send({
      error: 'forbidden',
      message: 'Account has been permanently banned',
      code: 'ACCOUNT_BANNED',
    });
  }

  // Check if user is currently suspended
  if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
    return reply.status(403).send({
      error: 'forbidden',
      message: 'Account is temporarily suspended',
      code: 'ACCOUNT_SUSPENDED',
      suspendedUntil: user.suspendedUntil,
    });
  }

  // Attach roles to request
  request.userRoles = (user.roles || ['user']) as UserRole[];
}

/**
 * Create a role check middleware
 * @param allowedRoles - Array of roles that are allowed to access the route
 */
function createRequireRole(allowedRoles: UserRole[]) {
  return async function requireRoleHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Ensure roles have been loaded
    if (!request.userRoles) {
      await loadUserRoles(request, reply);
      if (reply.sent) return; // loadUserRoles already sent an error response
    }

    const userRoles = request.userRoles || [];

    // Check if user has any of the allowed roles
    const hasRole = allowedRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return reply.status(403).send({
        error: 'forbidden',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        requiredRoles: allowedRoles,
        userRoles: userRoles,
      });
    }
  };
}

/**
 * Register RBAC decorators on Fastify instance
 */
export async function registerRbac(app: FastifyInstance): Promise<void> {
  // Decorate with loadUserRoles function
  app.decorate('loadUserRoles', loadUserRoles);

  // Decorate with requireRole factory function
  app.decorate('requireRole', (roles: UserRole[]) => createRequireRole(roles));
}

/**
 * Helper function to check if a user has a specific role
 */
export function hasRole(userRoles: UserRole[] | undefined, role: UserRole): boolean {
  return userRoles?.includes(role) ?? false;
}

/**
 * Helper function to check if a user has any of the specified roles
 */
export function hasAnyRole(userRoles: UserRole[] | undefined, roles: UserRole[]): boolean {
  if (!userRoles) return false;
  return roles.some(role => userRoles.includes(role));
}

/**
 * Helper to check if user is admin
 */
export function isAdmin(userRoles: UserRole[] | undefined): boolean {
  return hasRole(userRoles, 'admin');
}

/**
 * Helper to check if user is moderator or admin
 */
export function isModerator(userRoles: UserRole[] | undefined): boolean {
  return hasAnyRole(userRoles, ['admin', 'moderator']);
}
