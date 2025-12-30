import { pgTable, uuid, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core';

import { challengeVersions } from './challenges';
import { users } from './users';

// Match status enum
export const matchStatusEnum = pgEnum('match_status', [
  'created',
  'open',
  'matched',
  'in_progress',
  'submission_locked',
  'judging',
  'finalized',
  'archived',
]);

// Match mode enum
export const matchModeEnum = pgEnum('match_mode', ['ranked', 'invite', 'tournament']);

// Dispute status enum
export const disputeStatusEnum = pgEnum('dispute_status', ['none', 'open', 'in_review', 'resolved']);

// Participant seat enum
export const participantSeatEnum = pgEnum('participant_seat', ['A', 'B']);

// Matches table
export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeVersionId: uuid('challenge_version_id')
    .notNull()
    .references(() => challengeVersions.id),
  status: matchStatusEnum('status').notNull().default('created'),
  mode: matchModeEnum('mode').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startAt: timestamp('start_at', { withTimezone: true }),
  endAt: timestamp('end_at', { withTimezone: true }),
  lockAt: timestamp('lock_at', { withTimezone: true }),
  configHash: varchar('config_hash', { length: 64 }),
  disputeStatus: disputeStatusEnum('dispute_status').notNull().default('none'),
});

// Match participants table
export const matchParticipants = pgTable('match_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  seat: participantSeatEnum('seat').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  submissionId: uuid('submission_id'),
  forfeitAt: timestamp('forfeit_at', { withTimezone: true }),
});

// Types
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchParticipant = typeof matchParticipants.$inferSelect;
export type NewMatchParticipant = typeof matchParticipants.$inferInsert;
