import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

import { matches } from './matches';
import { users } from './users';

// Dispute status enum (for dispute table)
export const disputeTableStatusEnum = pgEnum('dispute_table_status', ['open', 'in_review', 'resolved']);

// Moderation action type enum
export const moderationActionTypeEnum = pgEnum('moderation_action_type', ['warn', 'suspend', 'ban']);

// Disputes table
export const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .notNull()
    .references(() => matches.id),
  openedByUserId: uuid('opened_by_user_id')
    .notNull()
    .references(() => users.id),
  reason: text('reason').notNull(),
  evidenceJson: jsonb('evidence_json').notNull().default({}),
  status: disputeTableStatusEnum('status').notNull().default('open'),
  resolutionJson: jsonb('resolution_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Moderation actions table
export const moderationActions = pgTable('moderation_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  moderatorUserId: uuid('moderator_user_id')
    .notNull()
    .references(() => users.id),
  targetUserId: uuid('target_user_id')
    .notNull()
    .references(() => users.id),
  actionType: moderationActionTypeEnum('action_type').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Audit events table
export const eventsAudit = pgTable('events_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  payloadJson: jsonb('payload_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Types
export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;
export type ModerationAction = typeof moderationActions.$inferSelect;
export type NewModerationAction = typeof moderationActions.$inferInsert;
export type EventAudit = typeof eventsAudit.$inferSelect;
export type NewEventAudit = typeof eventsAudit.$inferInsert;
