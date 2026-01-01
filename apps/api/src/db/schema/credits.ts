import { pgTable, uuid, varchar, timestamp, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';

import { matches } from './matches';
import { users } from './users';

// Credit hold status enum
export const creditHoldStatusEnum = pgEnum('credit_hold_status', ['active', 'released', 'consumed']);

// Credit transaction type enum
export const creditTransactionTypeEnum = pgEnum('credit_transaction_type', [
  'purchase',
  'earn',
  'stake_hold',
  'stake_release',
  'transfer',
  'fee',
  'refund',
  'redemption',
]);

// Purchase status enum
export const purchaseStatusEnum = pgEnum('purchase_status', [
  'pending',
  'succeeded',
  'failed',
  'refunded',
]);

// Credit accounts table
export const creditAccounts = pgTable('credit_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  balanceAvailable: integer('balance_available').notNull().default(0),
  balanceReserved: integer('balance_reserved').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Credit holds table
export const creditHolds = pgTable('credit_holds', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => creditAccounts.id, { onDelete: 'cascade' }),
  matchId: uuid('match_id')
    .references(() => matches.id),  // Nullable for non-match holds (e.g., automation)
  amountReserved: integer('amount_reserved').notNull(),
  status: creditHoldStatusEnum('status').notNull().default('active'),
  reason: varchar('reason', { length: 255 }), // Description for non-match holds
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
});

// Credit ledger entries table
export const creditLedgerEntries = pgTable('credit_ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: varchar('idempotency_key', { length: 100 }).notNull().unique(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => creditAccounts.id),
  counterpartyAccountId: uuid('counterparty_account_id').references(() => creditAccounts.id),
  type: creditTransactionTypeEnum('type').notNull(),
  amount: integer('amount').notNull(),
  matchId: uuid('match_id').references(() => matches.id),
  metadataJson: jsonb('metadata_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Purchases table
export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 100 }).notNull().unique(),
  amountFiat: integer('amount_fiat').notNull(), // in cents
  currency: varchar('currency', { length: 3 }).notNull().default('usd'),
  creditsIssued: integer('credits_issued').notNull(),
  status: purchaseStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Types
export type CreditAccount = typeof creditAccounts.$inferSelect;
export type NewCreditAccount = typeof creditAccounts.$inferInsert;
export type CreditHold = typeof creditHolds.$inferSelect;
export type NewCreditHold = typeof creditHolds.$inferInsert;
export type CreditLedgerEntry = typeof creditLedgerEntries.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedgerEntries.$inferInsert;
export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
