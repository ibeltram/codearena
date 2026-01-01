import { pgTable, uuid, varchar, timestamp, integer, real, jsonb, text, boolean } from 'drizzle-orm/pg-core';

import { users } from './users';

// Season status enum
export type SeasonStatus = 'upcoming' | 'active' | 'ended' | 'archived';

// Season rewards configuration type
export interface SeasonRewardTier {
  rankMin: number;
  rankMax: number;
  credits: number;
  badge?: string;
  title?: string;
}

export interface SeasonRules {
  minGamesForRanking: number;
  inactivityPenaltyDays: number;
  placementGames: number;
  ratingDecayFactor?: number;
}

export interface SeasonRewardsConfig {
  tiers: SeasonRewardTier[];
  totalPrizePool?: number;
  distributedAt?: string;
}

// Seasons table
export const seasons = pgTable('seasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('upcoming'),
  rulesJson: jsonb('rules_json').notNull().default({}),
  rewardsJson: jsonb('rewards_json').notNull().default({ tiers: [] }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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

// Season reward payouts table (tracks rewards given to players at season end)
export const seasonRewardPayouts = pgTable('season_reward_payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  seasonId: uuid('season_id')
    .notNull()
    .references(() => seasons.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  finalRank: integer('final_rank').notNull(),
  finalRating: integer('final_rating').notNull(),
  creditsAwarded: integer('credits_awarded').notNull().default(0),
  badgeAwarded: varchar('badge_awarded', { length: 100 }),
  titleAwarded: varchar('title_awarded', { length: 100 }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Types
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type Ranking = typeof rankings.$inferSelect;
export type NewRanking = typeof rankings.$inferInsert;
export type SeasonRewardPayout = typeof seasonRewardPayouts.$inferSelect;
export type NewSeasonRewardPayout = typeof seasonRewardPayouts.$inferInsert;
