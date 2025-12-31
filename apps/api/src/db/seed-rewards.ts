import 'dotenv/config';
import { db, closeDatabaseConnection } from './index';
import { partnerRewards, rewardInventory } from './schema';

async function seedRewards() {
  console.info('🌱 Starting rewards seed...');

  try {
    // Create partner rewards
    const [vercelPartner] = await db
      .insert(partnerRewards)
      .values({
        partnerSlug: 'vercel',
        name: 'Vercel',
        logoUrl: 'https://assets.vercel.com/image/upload/v1588805858/repositories/vercel/logo.png',
        description: 'Hosting and edge compute credits for your Next.js and frontend projects.',
        rewardType: 'saas_offset',
        tiersJson: [
          { slug: 'tier-10', name: '$10 Credit', description: '$10 Vercel credit', creditsRequired: 100, valueDescription: '$10' },
          { slug: 'tier-25', name: '$25 Credit', description: '$25 Vercel credit', creditsRequired: 225, valueDescription: '$25' },
          { slug: 'tier-50', name: '$50 Credit', description: '$50 Vercel credit', creditsRequired: 400, valueDescription: '$50' },
          { slug: 'tier-100', name: '$100 Credit', description: '$100 Vercel credit', creditsRequired: 750, valueDescription: '$100' },
        ],
        creditsRequiredMin: 100,
        creditsRequiredMax: 750,
        isActive: true,
      })
      .returning();

    const [supabasePartner] = await db
      .insert(partnerRewards)
      .values({
        partnerSlug: 'supabase',
        name: 'Supabase',
        logoUrl: 'https://supabase.com/brand-assets/supabase-logo-icon.png',
        description: 'Database and auth platform credits for backend infrastructure.',
        rewardType: 'saas_offset',
        tiersJson: [
          { slug: 'pro-1mo', name: 'Pro 1 Month', description: 'Supabase Pro free for 1 month', creditsRequired: 250, valueDescription: '1 month Pro' },
          { slug: 'pro-3mo', name: 'Pro 3 Months', description: 'Supabase Pro free for 3 months', creditsRequired: 600, valueDescription: '3 months Pro' },
          { slug: 'pro-6mo', name: 'Pro 6 Months', description: 'Supabase Pro free for 6 months', creditsRequired: 1000, valueDescription: '6 months Pro' },
        ],
        creditsRequiredMin: 250,
        creditsRequiredMax: 1000,
        isActive: true,
      })
      .returning();

    const [railwayPartner] = await db
      .insert(partnerRewards)
      .values({
        partnerSlug: 'railway',
        name: 'Railway',
        logoUrl: 'https://railway.app/brand/logo-light.png',
        description: 'App hosting and database credits for full-stack deployment.',
        rewardType: 'saas_offset',
        tiersJson: [
          { slug: 'tier-5', name: '$5 Credit', description: '$5 Railway usage credit', creditsRequired: 50, valueDescription: '$5' },
          { slug: 'tier-10', name: '$10 Credit', description: '$10 Railway usage credit', creditsRequired: 100, valueDescription: '$10' },
          { slug: 'tier-25', name: '$25 Credit', description: '$25 Railway usage credit', creditsRequired: 225, valueDescription: '$25' },
          { slug: 'tier-50', name: '$50 Credit', description: '$50 Railway usage credit', creditsRequired: 400, valueDescription: '$50' },
        ],
        creditsRequiredMin: 50,
        creditsRequiredMax: 400,
        isActive: true,
      })
      .returning();

    const [computePartner] = await db
      .insert(partnerRewards)
      .values({
        partnerSlug: 'compute-pack',
        name: 'Compute Pack',
        logoUrl: null,
        description: 'Sponsored cloud and GPU compute credits from multiple providers.',
        rewardType: 'compute_credit',
        tiersJson: [
          { slug: 'starter', name: 'Starter Pack', description: '$50 combined value across providers', creditsRequired: 500, valueDescription: '$50 compute' },
          { slug: 'builder', name: 'Builder Pack', description: '$200 combined value including GPU access', creditsRequired: 2000, valueDescription: '$200 compute' },
          { slug: 'pro', name: 'Pro Pack', description: '$500 combined value with priority GPU', creditsRequired: 5000, valueDescription: '$500 compute' },
        ],
        creditsRequiredMin: 500,
        creditsRequiredMax: 5000,
        isActive: true,
      })
      .returning();

    console.info('✅ Created partner rewards');

    // Create sample reward inventory codes
    await db.insert(rewardInventory).values([
      { partnerRewardId: vercelPartner.id, tierSlug: 'tier-10', code: 'VERCEL-DEMO-001', codeType: 'single_use', status: 'available' },
      { partnerRewardId: vercelPartner.id, tierSlug: 'tier-10', code: 'VERCEL-DEMO-002', codeType: 'single_use', status: 'available' },
      { partnerRewardId: vercelPartner.id, tierSlug: 'tier-25', code: 'VERCEL-DEMO-003', codeType: 'single_use', status: 'available' },
      { partnerRewardId: supabasePartner.id, tierSlug: 'pro-1mo', code: 'SUPA-DEMO-001', codeType: 'single_use', status: 'available' },
      { partnerRewardId: supabasePartner.id, tierSlug: 'pro-1mo', code: 'SUPA-DEMO-002', codeType: 'single_use', status: 'available' },
      { partnerRewardId: railwayPartner.id, tierSlug: 'tier-5', code: 'RAIL-DEMO-001', codeType: 'single_use', status: 'available' },
      { partnerRewardId: railwayPartner.id, tierSlug: 'tier-10', code: 'RAIL-DEMO-002', codeType: 'single_use', status: 'available' },
      { partnerRewardId: computePartner.id, tierSlug: 'starter', code: 'COMPUTE-DEMO-001', codeType: 'single_use', status: 'available' },
    ]);
    console.info('✅ Created reward inventory codes');

    console.info('🎉 Rewards seed completed successfully!');
  } catch (error) {
    console.error('❌ Rewards seed failed:', error);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

seedRewards();
