import { pgTable, uuid, varchar, timestamp, integer, jsonb, pgEnum, boolean, text } from 'drizzle-orm/pg-core';

import { matches } from './matches';
import { users } from './users';

// Submission method enum
export const submissionMethodEnum = pgEnum('submission_method', ['zip', 'github_repo']);

// Secret scan status enum
export const secretScanStatusEnum = pgEnum('secret_scan_status', ['pending', 'clean', 'flagged', 'acknowledged']);

// Secret finding severity enum
export const secretSeverityEnum = pgEnum('secret_severity', ['high', 'medium', 'low']);

// Secret finding type enum
export const secretTypeEnum = pgEnum('secret_type', [
  'env_file',
  'api_key',
  'private_key',
  'credential_file',
  'aws_credentials',
  'database_url',
  'jwt_secret',
  'oauth_token',
  'github_token',
  'stripe_key',
  'password_in_code',
]);

// Artifacts table
export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentHash: varchar('content_hash', { length: 64 }).notNull().unique(),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  manifestJson: jsonb('manifest_json').notNull(),
  secretScanStatus: secretScanStatusEnum('secret_scan_status').notNull().default('pending'),
  // Scan metadata
  scannedAt: timestamp('scanned_at', { withTimezone: true }),
  scannedFiles: integer('scanned_files'),
  skippedFiles: integer('skipped_files'),
  // Acknowledgment tracking
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id),
  acknowledgmentNote: text('acknowledgment_note'),
  // Whether artifact can be viewed publicly (false if flagged and not acknowledged)
  isPublicViewable: boolean('is_public_viewable').notNull().default(true),
});

// Secret findings table - stores individual secrets found in artifacts
export const secretFindings = pgTable('secret_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  artifactId: uuid('artifact_id')
    .notNull()
    .references(() => artifacts.id, { onDelete: 'cascade' }),
  filePath: varchar('file_path', { length: 1000 }).notNull(),
  lineNumber: integer('line_number'),
  secretType: secretTypeEnum('secret_type').notNull(),
  severity: secretSeverityEnum('severity').notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  evidence: varchar('evidence', { length: 500 }), // Redacted snippet
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
export type SecretFinding = typeof secretFindings.$inferSelect;
export type NewSecretFinding = typeof secretFindings.$inferInsert;
