import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';

import { matches } from './matches';
import { users } from './users';

// Dispute status enum (for dispute table)
export const disputeTableStatusEnum = pgEnum('dispute_table_status', ['open', 'in_review', 'resolved']);

// Moderation action type enum
export const moderationActionTypeEnum = pgEnum('moderation_action_type', ['warn', 'suspend', 'ban']);

// User report reason category enum
export const userReportReasonEnum = pgEnum('user_report_reason', [
  'cheating',              // Unfair play, match manipulation
  'harassment',            // Abusive behavior, threats
  'inappropriate_content', // Offensive profile, submissions
  'spam',                  // Bot activity, promotional spam
  'other',                 // Other concerns
]);

// User report status enum
export const userReportStatusEnum = pgEnum('user_report_status', [
  'pending',     // Awaiting moderator review
  'in_review',   // Being reviewed by moderator
  'resolved',    // Action taken or dismissed
  'dismissed',   // No action needed
]);

// Audit event category enum
export const auditEventCategoryEnum = pgEnum('audit_event_category', [
  'auth',           // Login, logout, token refresh
  'admin',          // Admin actions
  'moderation',     // User moderation (warn, suspend, ban)
  'payment',        // Purchases, refunds, wallet operations
  'match',          // Match creation, finalization, disputes
  'submission',     // Submission uploads, modifications
  'challenge',      // Challenge creation, publishing
  'tournament',     // Tournament management
  'reward',         // Reward redemptions
  'system',         // System events
]);

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

// User reports table - for users to report other users
export const userReports = pgTable('user_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterUserId: uuid('reporter_user_id')
    .notNull()
    .references(() => users.id),
  reportedUserId: uuid('reported_user_id')
    .notNull()
    .references(() => users.id),
  reason: userReportReasonEnum('reason').notNull(),
  description: text('description').notNull(),
  evidenceJson: jsonb('evidence_json').notNull().default({}),
  status: userReportStatusEnum('status').notNull().default('pending'),
  reviewedByUserId: uuid('reviewed_by_user_id')
    .references(() => users.id),
  reviewNotes: text('review_notes'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Indexes for efficient querying
  reporterUserIdIdx: index('user_reports_reporter_user_id_idx').on(table.reporterUserId),
  reportedUserIdIdx: index('user_reports_reported_user_id_idx').on(table.reportedUserId),
  statusIdx: index('user_reports_status_idx').on(table.status),
  createdAtIdx: index('user_reports_created_at_idx').on(table.createdAt),
}));

// Audit events table - captures all sensitive operations
export const eventsAudit = pgTable('events_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  category: auditEventCategoryEnum('category').notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 500 }),
  requestId: varchar('request_id', { length: 64 }),
  payloadJson: jsonb('payload_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Indexes for efficient querying
  actorUserIdIdx: index('events_audit_actor_user_id_idx').on(table.actorUserId),
  categoryIdx: index('events_audit_category_idx').on(table.category),
  eventTypeIdx: index('events_audit_event_type_idx').on(table.eventType),
  entityTypeIdx: index('events_audit_entity_type_idx').on(table.entityType),
  entityIdIdx: index('events_audit_entity_id_idx').on(table.entityId),
  createdAtIdx: index('events_audit_created_at_idx').on(table.createdAt),
  // Composite index for common queries
  categoryCreatedAtIdx: index('events_audit_category_created_at_idx').on(table.category, table.createdAt),
  actorCreatedAtIdx: index('events_audit_actor_created_at_idx').on(table.actorUserId, table.createdAt),
}));

// Types
export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;
export type ModerationAction = typeof moderationActions.$inferSelect;
export type NewModerationAction = typeof moderationActions.$inferInsert;
export type UserReport = typeof userReports.$inferSelect;
export type NewUserReport = typeof userReports.$inferInsert;
export type UserReportReason = 'cheating' | 'harassment' | 'inappropriate_content' | 'spam' | 'other';
export type UserReportStatus = 'pending' | 'in_review' | 'resolved' | 'dismissed';
export type EventAudit = typeof eventsAudit.$inferSelect;
export type NewEventAudit = typeof eventsAudit.$inferInsert;
