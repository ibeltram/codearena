import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://reporivals:reporivals@localhost:5432/reporivals';

async function syncSchema() {
  console.info('Starting database schema sync...');

  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  const db = drizzle(pool, { schema });

  try {
    // Create enums
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE oauth_provider AS ENUM('github', 'google');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM('user', 'admin', 'moderator');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE challenge_category AS ENUM('frontend', 'backend', 'fullstack', 'algorithm', 'devops');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE challenge_difficulty AS ENUM('beginner', 'intermediate', 'advanced', 'expert');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE dispute_status AS ENUM('none', 'open', 'in_review', 'resolved');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE match_mode AS ENUM('ranked', 'invite', 'tournament');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE match_status AS ENUM('created', 'open', 'matched', 'in_progress', 'submission_locked', 'judging', 'finalized', 'archived');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE participant_seat AS ENUM('A', 'B');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE secret_scan_status AS ENUM('pending', 'clean', 'flagged');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE submission_method AS ENUM('zip', 'github_repo');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE judgement_status AS ENUM('queued', 'running', 'success', 'failed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE credit_hold_status AS ENUM('active', 'released', 'consumed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE credit_transaction_type AS ENUM('purchase', 'earn', 'stake_hold', 'stake_release', 'transfer', 'fee', 'refund', 'redemption');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE purchase_status AS ENUM('pending', 'succeeded', 'failed', 'refunded');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE prize_claim_status AS ENUM('pending', 'approved', 'fulfilled', 'denied');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE prize_type AS ENUM('cash', 'crypto', 'hardware', 'saas_bundle');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE tournament_format AS ENUM('single_elimination', 'double_elimination', 'swiss', 'ladder', 'round_robin');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE tournament_status AS ENUM('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE dispute_table_status AS ENUM('open', 'in_review', 'resolved');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE moderation_action_type AS ENUM('warn', 'suspend', 'ban');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE audit_event_category AS ENUM('auth', 'admin', 'moderation', 'payment', 'match', 'submission', 'challenge', 'tournament', 'reward', 'system');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE reward_type AS ENUM('saas_offset', 'compute_credit');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE reward_code_type AS ENUM('single_use', 'multi_use', 'api_generated');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE reward_inventory_status AS ENUM('available', 'reserved', 'redeemed', 'expired');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE reward_redemption_status AS ENUM('pending', 'issued', 'activated', 'expired', 'refunded');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE leaderboard_type AS ENUM('weekly', 'season', 'category');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE leaderboard_payout_status AS ENUM('pending', 'issued', 'claimed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    console.info('✅ Created enums');

    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        email varchar(255) NOT NULL UNIQUE,
        display_name varchar(100) NOT NULL,
        avatar_url varchar(500),
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        last_login_at timestamp with time zone,
        roles user_role[] DEFAULT ARRAY['user']::user_role[] NOT NULL,
        is_banned boolean DEFAULT false NOT NULL,
        is_verified boolean DEFAULT false NOT NULL,
        preferences jsonb DEFAULT '{}'::jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider oauth_provider NOT NULL,
        provider_user_id varchar(255) NOT NULL,
        access_token_encrypted varchar(1000),
        refresh_token_encrypted varchar(1000),
        scopes jsonb DEFAULT '[]'::jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash varchar(64) NOT NULL UNIQUE,
        device_name varchar(255),
        device_type varchar(50),
        ip_address varchar(45),
        user_agent varchar(500),
        last_used_at timestamp with time zone DEFAULT now() NOT NULL,
        expires_at timestamp with time zone NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        revoked_at timestamp with time zone
      );

      CREATE TABLE IF NOT EXISTS challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        slug varchar(100) NOT NULL UNIQUE,
        title varchar(200) NOT NULL,
        description text NOT NULL,
        category challenge_category NOT NULL,
        difficulty challenge_difficulty NOT NULL,
        is_published boolean DEFAULT false NOT NULL,
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS challenge_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
        version_number integer NOT NULL,
        requirements_json jsonb NOT NULL,
        rubric_json jsonb NOT NULL,
        constraints_json jsonb NOT NULL,
        template_ref varchar(500),
        judge_image_ref varchar(500),
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        published_at timestamp with time zone
      );

      CREATE TABLE IF NOT EXISTS matches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        challenge_version_id uuid NOT NULL REFERENCES challenge_versions(id),
        status match_status DEFAULT 'created' NOT NULL,
        mode match_mode NOT NULL,
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        start_at timestamp with time zone,
        end_at timestamp with time zone,
        lock_at timestamp with time zone,
        config_hash varchar(64),
        dispute_status dispute_status DEFAULT 'none' NOT NULL
      );

      CREATE TABLE IF NOT EXISTS match_participants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id),
        seat participant_seat NOT NULL,
        joined_at timestamp with time zone DEFAULT now() NOT NULL,
        ready_at timestamp with time zone,
        submission_id uuid,
        forfeit_at timestamp with time zone
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        content_hash varchar(64) NOT NULL UNIQUE,
        storage_key varchar(500) NOT NULL,
        size_bytes integer NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        manifest_json jsonb NOT NULL,
        secret_scan_status secret_scan_status DEFAULT 'pending' NOT NULL
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id),
        method submission_method NOT NULL,
        artifact_id uuid NOT NULL REFERENCES artifacts(id),
        submitted_at timestamp with time zone DEFAULT now() NOT NULL,
        locked_at timestamp with time zone,
        client_type varchar(50),
        client_version varchar(50),
        source_ref varchar(500)
      );

      CREATE TABLE IF NOT EXISTS judgement_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        started_at timestamp with time zone DEFAULT now() NOT NULL,
        completed_at timestamp with time zone,
        status judgement_status DEFAULT 'queued' NOT NULL,
        judge_version varchar(50) NOT NULL,
        logs_key varchar(500),
        environment_ref varchar(500)
      );

      CREATE TABLE IF NOT EXISTS scores (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        judgement_run_id uuid NOT NULL REFERENCES judgement_runs(id) ON DELETE CASCADE,
        match_id uuid NOT NULL REFERENCES matches(id),
        user_id uuid NOT NULL REFERENCES users(id),
        total_score integer NOT NULL,
        breakdown_json jsonb NOT NULL,
        automated_results_json jsonb NOT NULL,
        ai_judge_results_json jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS credit_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        balance_available integer DEFAULT 0 NOT NULL,
        balance_reserved integer DEFAULT 0 NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS credit_holds (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        account_id uuid NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
        match_id uuid NOT NULL REFERENCES matches(id),
        amount_reserved integer NOT NULL,
        status credit_hold_status DEFAULT 'active' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        released_at timestamp with time zone
      );

      CREATE TABLE IF NOT EXISTS credit_ledger_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        idempotency_key varchar(100) NOT NULL UNIQUE,
        account_id uuid NOT NULL REFERENCES credit_accounts(id),
        counterparty_account_id uuid REFERENCES credit_accounts(id),
        type credit_transaction_type NOT NULL,
        amount integer NOT NULL,
        match_id uuid REFERENCES matches(id),
        metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS purchases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id),
        stripe_payment_intent_id varchar(100) NOT NULL UNIQUE,
        amount_fiat integer NOT NULL,
        currency varchar(3) DEFAULT 'usd' NOT NULL,
        credits_issued integer NOT NULL,
        status purchase_status DEFAULT 'pending' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS seasons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        name varchar(100) NOT NULL,
        start_at timestamp with time zone NOT NULL,
        end_at timestamp with time zone NOT NULL,
        rules_json jsonb DEFAULT '{}'::jsonb NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rankings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        rating integer DEFAULT 1500 NOT NULL,
        deviation real DEFAULT 350 NOT NULL,
        volatility real DEFAULT 0.06 NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tournaments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        name varchar(200) NOT NULL,
        description text,
        format tournament_format NOT NULL,
        status tournament_status DEFAULT 'draft' NOT NULL,
        challenge_id uuid REFERENCES challenges(id),
        max_participants integer DEFAULT 32 NOT NULL,
        min_participants integer DEFAULT 4 NOT NULL,
        registration_start_at timestamp with time zone,
        registration_end_at timestamp with time zone,
        start_at timestamp with time zone NOT NULL,
        end_at timestamp with time zone,
        entry_fee_credits integer DEFAULT 0 NOT NULL,
        prize_pool_json jsonb DEFAULT '{}'::jsonb NOT NULL,
        rules_json jsonb DEFAULT '{}'::jsonb NOT NULL,
        bracket_json jsonb DEFAULT '{}'::jsonb NOT NULL,
        created_by uuid REFERENCES users(id),
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tournament_registrations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id),
        seed integer,
        is_checked_in boolean DEFAULT false NOT NULL,
        eliminated_at timestamp with time zone,
        final_placement integer,
        registered_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tournament_bracket_matches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        match_id uuid REFERENCES matches(id),
        round integer NOT NULL,
        position integer NOT NULL,
        bracket_side varchar(20),
        participant1_id uuid REFERENCES users(id),
        participant2_id uuid REFERENCES users(id),
        winner_id uuid REFERENCES users(id),
        loser_id uuid REFERENCES users(id),
        score1 integer,
        score2 integer,
        status varchar(20) DEFAULT 'pending' NOT NULL,
        scheduled_at timestamp with time zone,
        completed_at timestamp with time zone,
        next_match_id uuid,
        loser_next_match_id uuid,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS prize_claims (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        tournament_id uuid NOT NULL REFERENCES tournaments(id),
        user_id uuid NOT NULL REFERENCES users(id),
        prize_type prize_type NOT NULL,
        amount_or_bundle_ref varchar(500) NOT NULL,
        status prize_claim_status DEFAULT 'pending' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS disputes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        match_id uuid NOT NULL REFERENCES matches(id),
        opened_by_user_id uuid NOT NULL REFERENCES users(id),
        reason text NOT NULL,
        evidence_json jsonb DEFAULT '{}'::jsonb NOT NULL,
        status dispute_table_status DEFAULT 'open' NOT NULL,
        resolution_json jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        actor_user_id uuid REFERENCES users(id),
        category audit_event_category NOT NULL,
        event_type varchar(100) NOT NULL,
        entity_type varchar(100) NOT NULL,
        entity_id uuid NOT NULL,
        ip_address varchar(45),
        user_agent varchar(500),
        request_id varchar(64),
        payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );

      -- Audit event indexes for efficient querying
      CREATE INDEX IF NOT EXISTS events_audit_actor_user_id_idx ON events_audit(actor_user_id);
      CREATE INDEX IF NOT EXISTS events_audit_category_idx ON events_audit(category);
      CREATE INDEX IF NOT EXISTS events_audit_event_type_idx ON events_audit(event_type);
      CREATE INDEX IF NOT EXISTS events_audit_entity_type_idx ON events_audit(entity_type);
      CREATE INDEX IF NOT EXISTS events_audit_entity_id_idx ON events_audit(entity_id);
      CREATE INDEX IF NOT EXISTS events_audit_created_at_idx ON events_audit(created_at);
      CREATE INDEX IF NOT EXISTS events_audit_category_created_at_idx ON events_audit(category, created_at);
      CREATE INDEX IF NOT EXISTS events_audit_actor_created_at_idx ON events_audit(actor_user_id, created_at);

      CREATE TABLE IF NOT EXISTS moderation_actions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        moderator_user_id uuid NOT NULL REFERENCES users(id),
        target_user_id uuid NOT NULL REFERENCES users(id),
        action_type moderation_action_type NOT NULL,
        reason text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS partner_rewards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        partner_slug varchar(50) NOT NULL UNIQUE,
        name varchar(100) NOT NULL,
        logo_url varchar(500),
        description text,
        reward_type reward_type NOT NULL,
        tiers_json jsonb DEFAULT '[]'::jsonb NOT NULL,
        credits_required_min integer NOT NULL,
        credits_required_max integer NOT NULL,
        is_active boolean DEFAULT true NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS partner_rewards_partner_slug_idx ON partner_rewards(partner_slug);
      CREATE INDEX IF NOT EXISTS partner_rewards_is_active_idx ON partner_rewards(is_active);

      CREATE TABLE IF NOT EXISTS reward_inventory (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        partner_reward_id uuid NOT NULL REFERENCES partner_rewards(id) ON DELETE CASCADE,
        tier_slug varchar(50) NOT NULL,
        code text NOT NULL,
        code_type reward_code_type DEFAULT 'single_use' NOT NULL,
        status reward_inventory_status DEFAULT 'available' NOT NULL,
        expires_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS reward_inventory_partner_reward_id_idx ON reward_inventory(partner_reward_id);
      CREATE INDEX IF NOT EXISTS reward_inventory_status_idx ON reward_inventory(status);
      CREATE INDEX IF NOT EXISTS reward_inventory_tier_slug_idx ON reward_inventory(tier_slug);

      CREATE TABLE IF NOT EXISTS reward_redemptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        partner_reward_id uuid NOT NULL REFERENCES partner_rewards(id),
        tier_slug varchar(50) NOT NULL,
        credits_spent integer NOT NULL,
        code_issued text,
        status reward_redemption_status DEFAULT 'pending' NOT NULL,
        issued_at timestamp with time zone,
        activated_at timestamp with time zone,
        expires_at timestamp with time zone,
        partner_confirmation_json jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS reward_redemptions_user_id_idx ON reward_redemptions(user_id);
      CREATE INDEX IF NOT EXISTS reward_redemptions_partner_reward_id_idx ON reward_redemptions(partner_reward_id);
      CREATE INDEX IF NOT EXISTS reward_redemptions_status_idx ON reward_redemptions(status);

      CREATE TABLE IF NOT EXISTS leaderboard_payouts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        leaderboard_type leaderboard_type NOT NULL,
        period_start timestamp with time zone NOT NULL,
        period_end timestamp with time zone NOT NULL,
        rank integer NOT NULL,
        reward_value integer NOT NULL,
        reward_description text NOT NULL,
        status leaderboard_payout_status DEFAULT 'pending' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS leaderboard_payouts_user_id_idx ON leaderboard_payouts(user_id);
      CREATE INDEX IF NOT EXISTS leaderboard_payouts_leaderboard_type_idx ON leaderboard_payouts(leaderboard_type);
      CREATE INDEX IF NOT EXISTS leaderboard_payouts_period_start_idx ON leaderboard_payouts(period_start);
      CREATE INDEX IF NOT EXISTS leaderboard_payouts_status_idx ON leaderboard_payouts(status);
    `);
    console.info('✅ Created tables');

    console.info('🎉 Schema sync completed successfully!');
  } catch (error) {
    console.error('❌ Schema sync failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

syncSchema();
