import { pgTable, uuid, varchar, timestamp, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';

// User roles enum
export const userRoleEnum = pgEnum('user_role', ['user', 'admin', 'moderator']);

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  roles: userRoleEnum('roles').array().notNull().default(['user']),
  isBanned: boolean('is_banned').notNull().default(false),
  isVerified: boolean('is_verified').notNull().default(false),
  preferences: jsonb('preferences').notNull().default({}),
  // GDPR soft delete fields
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// OAuth providers enum
export const oauthProviderEnum = pgEnum('oauth_provider', ['github', 'google']);

// OAuth accounts table
export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: oauthProviderEnum('provider').notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  accessTokenEncrypted: varchar('access_token_encrypted', { length: 1000 }),
  refreshTokenEncrypted: varchar('refresh_token_encrypted', { length: 1000 }),
  scopes: jsonb('scopes').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Session/device tokens table
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: varchar('refresh_token_hash', { length: 64 }).notNull().unique(),
  // Previous token hash for reuse detection - if someone tries to use this, it means
  // the current token was stolen and we should revoke the entire session
  previousTokenHash: varchar('previous_token_hash', { length: 64 }),
  // Token family ID to track token chains for reuse detection across rotations
  tokenFamily: uuid('token_family').notNull().defaultRandom(),
  deviceName: varchar('device_name', { length: 255 }),
  deviceType: varchar('device_type', { length: 50 }), // 'vscode', 'web', 'mobile'
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 500 }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
