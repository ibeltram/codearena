import { pgTable, uuid, varchar, timestamp, integer, jsonb, pgEnum, text, boolean, index } from 'drizzle-orm/pg-core';

import { users } from './users';

// Reward type enum (saas_offset or compute_credit)
export const rewardTypeEnum = pgEnum('reward_type', ['saas_offset', 'compute_credit']);

// Reward code type enum
export const rewardCodeTypeEnum = pgEnum('reward_code_type', ['single_use', 'multi_use', 'api_generated']);

// Reward inventory status enum
export const rewardInventoryStatusEnum = pgEnum('reward_inventory_status', [
  'available',
  'reserved',
  'redeemed',
  'expired',
]);

// Reward redemption status enum
export const rewardRedemptionStatusEnum = pgEnum('reward_redemption_status', [
  'pending',
  'issued',
  'activated',
  'expired',
  'refunded',
]);

// Leaderboard type enum
export const leaderboardTypeEnum = pgEnum('leaderboard_type', ['weekly', 'season', 'category']);

// Leaderboard payout status enum
export const leaderboardPayoutStatusEnum = pgEnum('leaderboard_payout_status', [
  'pending',
  'issued',
  'claimed',
]);

// Partner rewards table - stores partner information and reward tiers
export const partnerRewards = pgTable(
  'partner_rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partnerSlug: varchar('partner_slug', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    logoUrl: varchar('logo_url', { length: 500 }),
    description: text('description'),
    rewardType: rewardTypeEnum('reward_type').notNull(),
    // JSON array of tier objects: { slug, name, description, credits_required, value_description }
    tiersJson: jsonb('tiers_json').notNull().default([]),
    creditsRequiredMin: integer('credits_required_min').notNull(),
    creditsRequiredMax: integer('credits_required_max').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partnerSlugIdx: index('partner_rewards_partner_slug_idx').on(table.partnerSlug),
    isActiveIdx: index('partner_rewards_is_active_idx').on(table.isActive),
  })
);

// Reward inventory table - stores individual reward codes
export const rewardInventory = pgTable(
  'reward_inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partnerRewardId: uuid('partner_reward_id')
      .notNull()
      .references(() => partnerRewards.id, { onDelete: 'cascade' }),
    tierSlug: varchar('tier_slug', { length: 50 }).notNull(),
    // Code is stored encrypted - actual encryption happens at application layer
    code: text('code').notNull(),
    codeType: rewardCodeTypeEnum('code_type').notNull().default('single_use'),
    status: rewardInventoryStatusEnum('status').notNull().default('available'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partnerRewardIdIdx: index('reward_inventory_partner_reward_id_idx').on(table.partnerRewardId),
    statusIdx: index('reward_inventory_status_idx').on(table.status),
    tierSlugIdx: index('reward_inventory_tier_slug_idx').on(table.tierSlug),
  })
);

// Reward redemptions table - tracks user redemptions
export const rewardRedemptions = pgTable(
  'reward_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    partnerRewardId: uuid('partner_reward_id')
      .notNull()
      .references(() => partnerRewards.id),
    tierSlug: varchar('tier_slug', { length: 50 }).notNull(),
    creditsSpent: integer('credits_spent').notNull(),
    // Code issued to the user (encrypted)
    codeIssued: text('code_issued'),
    status: rewardRedemptionStatusEnum('status').notNull().default('pending'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // Partner confirmation data (webhook response, etc.)
    partnerConfirmationJson: jsonb('partner_confirmation_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('reward_redemptions_user_id_idx').on(table.userId),
    partnerRewardIdIdx: index('reward_redemptions_partner_reward_id_idx').on(table.partnerRewardId),
    statusIdx: index('reward_redemptions_status_idx').on(table.status),
  })
);

// Leaderboard payouts table - tracks automatic rewards for top performers
export const leaderboardPayouts = pgTable(
  'leaderboard_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    leaderboardType: leaderboardTypeEnum('leaderboard_type').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    rank: integer('rank').notNull(),
    rewardValue: integer('reward_value').notNull(), // in cents or credits
    rewardDescription: text('reward_description').notNull(),
    status: leaderboardPayoutStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('leaderboard_payouts_user_id_idx').on(table.userId),
    leaderboardTypeIdx: index('leaderboard_payouts_leaderboard_type_idx').on(table.leaderboardType),
    periodStartIdx: index('leaderboard_payouts_period_start_idx').on(table.periodStart),
    statusIdx: index('leaderboard_payouts_status_idx').on(table.status),
  })
);

// Types
export type PartnerReward = typeof partnerRewards.$inferSelect;
export type NewPartnerReward = typeof partnerRewards.$inferInsert;
export type RewardInventory = typeof rewardInventory.$inferSelect;
export type NewRewardInventory = typeof rewardInventory.$inferInsert;
export type RewardRedemption = typeof rewardRedemptions.$inferSelect;
export type NewRewardRedemption = typeof rewardRedemptions.$inferInsert;
export type LeaderboardPayout = typeof leaderboardPayouts.$inferSelect;
export type NewLeaderboardPayout = typeof leaderboardPayouts.$inferInsert;

// Tier type for tiersJson field
export interface RewardTier {
  slug: string;
  name: string;
  description: string;
  creditsRequired: number;
  valueDescription: string;
}
