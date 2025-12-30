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

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;
