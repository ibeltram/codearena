import { pgTable, uuid, varchar, timestamp, integer, real, jsonb } from 'drizzle-orm/pg-core';

import { users } from './users';

// Seasons table
export const seasons = pgTable('seasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  rulesJson: jsonb('rules_json').notNull().default({}),
});

// Rankings table (Glicko-2 rating system)
export const rankings = pgTable('rankings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  seasonId: uuid('season_id')
    .notNull()
    .references(() => seasons.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull().default(1500),
  deviation: real('deviation').notNull().default(350),
  volatility: real('volatility').notNull().default(0.06),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Types
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type Ranking = typeof rankings.$inferSelect;
export type NewRanking = typeof rankings.$inferInsert;
