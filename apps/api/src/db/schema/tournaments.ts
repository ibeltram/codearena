import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, pgEnum, boolean } from 'drizzle-orm/pg-core';

import { users } from './users';
import { challenges } from './challenges';

// Tournament format enum
export const tournamentFormatEnum = pgEnum('tournament_format', [
  'single_elimination',
  'double_elimination',
  'swiss',
  'ladder',
  'round_robin',
]);

// Tournament status enum
export const tournamentStatusEnum = pgEnum('tournament_status', [
  'draft',
  'registration_open',
  'registration_closed',
  'in_progress',
  'completed',
  'cancelled',
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
  status: tournamentStatusEnum('status').notNull().default('draft'),
  challengeId: uuid('challenge_id').references(() => challenges.id),
  maxParticipants: integer('max_participants').notNull().default(32),
  minParticipants: integer('min_participants').notNull().default(4),
  registrationStartAt: timestamp('registration_start_at', { withTimezone: true }),
  registrationEndAt: timestamp('registration_end_at', { withTimezone: true }),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }),
  entryFeeCredits: integer('entry_fee_credits').notNull().default(0),
  prizePoolJson: jsonb('prize_pool_json').notNull().default({}),
  rulesJson: jsonb('rules_json').notNull().default({}),
  bracketJson: jsonb('bracket_json').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Tournament registrations table
export const tournamentRegistrations = pgTable('tournament_registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  seed: integer('seed'),
  isCheckedIn: boolean('is_checked_in').notNull().default(false),
  eliminatedAt: timestamp('eliminated_at', { withTimezone: true }),
  finalPlacement: integer('final_placement'),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
});

// Tournament bracket matches (different from regular matches - tracking bracket position)
export const tournamentBracketMatches = pgTable('tournament_bracket_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  matchId: uuid('match_id'), // Links to regular matches table when created
  round: integer('round').notNull(), // 1, 2, 3... (finals = highest round)
  position: integer('position').notNull(), // Position within round (0, 1, 2...)
  bracketSide: varchar('bracket_side', { length: 20 }), // 'winners', 'losers' for double elim
  participant1Id: uuid('participant1_id').references(() => users.id),
  participant2Id: uuid('participant2_id').references(() => users.id),
  winnerId: uuid('winner_id').references(() => users.id),
  loserId: uuid('loser_id').references(() => users.id),
  score1: integer('score1'),
  score2: integer('score2'),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, in_progress, completed, bye
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  nextMatchId: uuid('next_match_id'), // Winner advances to this bracket match
  loserNextMatchId: uuid('loser_next_match_id'), // For double elimination - loser goes here
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
export type TournamentRegistration = typeof tournamentRegistrations.$inferSelect;
export type NewTournamentRegistration = typeof tournamentRegistrations.$inferInsert;
export type TournamentBracketMatch = typeof tournamentBracketMatches.$inferSelect;
export type NewTournamentBracketMatch = typeof tournamentBracketMatches.$inferInsert;
export type PrizeClaim = typeof prizeClaims.$inferSelect;
export type NewPrizeClaim = typeof prizeClaims.$inferInsert;

// Tournament status type
export type TournamentStatus = 'draft' | 'registration_open' | 'registration_closed' | 'in_progress' | 'completed' | 'cancelled';
export type TournamentFormat = 'single_elimination' | 'double_elimination' | 'swiss' | 'ladder' | 'round_robin';
