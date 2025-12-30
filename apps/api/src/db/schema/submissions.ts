import { pgTable, uuid, varchar, timestamp, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';

import { matches } from './matches';
import { users } from './users';

// Submission method enum
export const submissionMethodEnum = pgEnum('submission_method', ['zip', 'github_repo']);

// Secret scan status enum
export const secretScanStatusEnum = pgEnum('secret_scan_status', ['pending', 'clean', 'flagged']);

// Artifacts table
export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentHash: varchar('content_hash', { length: 64 }).notNull().unique(),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  manifestJson: jsonb('manifest_json').notNull(),
  secretScanStatus: secretScanStatusEnum('secret_scan_status').notNull().default('pending'),
});

// Submissions table
export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  method: submissionMethodEnum('method').notNull(),
  artifactId: uuid('artifact_id')
    .notNull()
    .references(() => artifacts.id),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  clientType: varchar('client_type', { length: 50 }),
  clientVersion: varchar('client_version', { length: 50 }),
  sourceRef: varchar('source_ref', { length: 500 }),
});

// Types
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
