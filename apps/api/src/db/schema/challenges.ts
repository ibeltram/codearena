import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';

import { users } from './users';

// Challenge category enum
export const challengeCategoryEnum = pgEnum('challenge_category', [
  'frontend',
  'backend',
  'fullstack',
  'algorithm',
  'devops',
]);

// Challenge difficulty enum
export const challengeDifficultyEnum = pgEnum('challenge_difficulty', [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);

// Challenges table
export const challenges = pgTable('challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description').notNull(),
  category: challengeCategoryEnum('category').notNull(),
  difficulty: challengeDifficultyEnum('difficulty').notNull(),
  isPublished: boolean('is_published').notNull().default(false),
  defaultVersionId: uuid('default_version_id'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Challenge versions table
export const challengeVersions = pgTable('challenge_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id')
    .notNull()
    .references(() => challenges.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  requirementsJson: jsonb('requirements_json').notNull(),
  rubricJson: jsonb('rubric_json').notNull(),
  constraintsJson: jsonb('constraints_json').notNull(),
  templateRef: varchar('template_ref', { length: 500 }),
  judgeImageRef: varchar('judge_image_ref', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

// Types
export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
export type ChallengeVersion = typeof challengeVersions.$inferSelect;
export type NewChallengeVersion = typeof challengeVersions.$inferInsert;
