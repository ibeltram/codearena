import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';

import { users } from './users';

// Tournament format enum
export const tournamentFormatEnum = pgEnum('tournament_format', [
  'single_elimination',
  'double_elimination',
  'swiss',
  'ladder',
  'round_robin',
]);

// Prize claim status enum
export const prizeClaimStatusEnum = pgEnum('prize_claim_status', [
  'pending',
  'approved',
  'fulfilled',
  'denied',
]);

// Prize type enum
export const prizeTypeEnum = pgEnum('prize_type', ['cash', 'crypto', 'hardware', 'saas_bundle']);

// Tournaments table
export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  format: tournamentFormatEnum('format').notNull(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }),
  entryFeeCredits: integer('entry_fee_credits').notNull().default(0),
  prizePoolJson: jsonb('prize_pool_json').notNull().default({}),
  rulesJson: jsonb('rules_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Prize claims table
export const prizeClaims = pgTable('prize_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .notNull()
    .references(() => tournaments.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  prizeType: prizeTypeEnum('prize_type').notNull(),
  amountOrBundleRef: varchar('amount_or_bundle_ref', { length: 500 }).notNull(),
  status: prizeClaimStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Types
export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type PrizeClaim = typeof prizeClaims.$inferSelect;
export type NewPrizeClaim = typeof prizeClaims.$inferInsert;
