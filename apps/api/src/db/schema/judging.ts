import { pgTable, uuid, varchar, timestamp, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';

import { matches } from './matches';
import { users } from './users';

// Judgement status enum
export const judgementStatusEnum = pgEnum('judgement_status', ['queued', 'running', 'success', 'failed']);

// Judgement runs table
export const judgementRuns = pgTable('judgement_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: judgementStatusEnum('status').notNull().default('queued'),
  judgeVersion: varchar('judge_version', { length: 50 }).notNull(),
  logsKey: varchar('logs_key', { length: 500 }),
  environmentRef: varchar('environment_ref', { length: 500 }),
});

// Scores table
export const scores = pgTable('scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  judgementRunId: uuid('judgement_run_id')
    .notNull()
    .references(() => judgementRuns.id, { onDelete: 'cascade' }),
  matchId: uuid('match_id')
    .notNull()
    .references(() => matches.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  totalScore: integer('total_score').notNull(),
  breakdownJson: jsonb('breakdown_json').notNull(),
  automatedResultsJson: jsonb('automated_results_json').notNull(),
  aiJudgeResultsJson: jsonb('ai_judge_results_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Types
export type JudgementRun = typeof judgementRuns.$inferSelect;
export type NewJudgementRun = typeof judgementRuns.$inferInsert;
export type Score = typeof scores.$inferSelect;
export type NewScore = typeof scores.$inferInsert;
