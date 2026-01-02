import 'dotenv/config';
import { db, closeDatabaseConnection } from './index';
import { users, challenges, challengeVersions, seasons, creditAccounts, partnerRewards, rewardInventory } from './schema';

async function seed() {
  console.info('🌱 Starting database seed...');

  try {
    // Create admin user
    const [adminUser] = await db
      .insert(users)
      .values({
        email: 'admin@reporivals.dev',
        displayName: 'Admin',
        roles: ['admin', 'user'],
        isVerified: true,
      })
      .returning();
    console.info('✅ Created admin user:', adminUser.email);

    // Create Iacopo admin user
    const [iacopoAdmin] = await db
      .insert(users)
      .values({
        email: 'iacopo8@gmail.com',
        displayName: 'Iacopo',
        roles: ['admin', 'user'],
        isVerified: true,
      })
      .returning();
    console.info('✅ Created admin user:', iacopoAdmin.email);

    // Create test users
    const testUsers = await db
      .insert(users)
      .values([
        {
          email: 'alice@example.com',
          displayName: 'Alice Developer',
          isVerified: true,
        },
        {
          email: 'bob@example.com',
          displayName: 'Bob Builder',
          isVerified: true,
        },
      ])
      .returning();
    console.info('✅ Created test users:', testUsers.map((u) => u.email).join(', '));

    // Create credit accounts for all users
    await db.insert(creditAccounts).values([
      { userId: adminUser.id, balanceAvailable: 10000 },
      { userId: iacopoAdmin.id, balanceAvailable: 10000 },
      { userId: testUsers[0].id, balanceAvailable: 1000 },
      { userId: testUsers[1].id, balanceAvailable: 1000 },
    ]);
    console.info('✅ Created credit accounts');

    // Create a season
    const [currentSeason] = await db
      .insert(seasons)
      .values({
        name: 'Season 1',
        startAt: new Date(),
        endAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        rulesJson: {
          initialRating: 1500,
          initialDeviation: 350,
          initialVolatility: 0.06,
        },
      })
      .returning();
    console.info('✅ Created season:', currentSeason.name);

    // Create sample challenges
    const [dashboardChallenge] = await db
      .insert(challenges)
      .values({
        slug: 'responsive-dashboard',
        title: 'Build a Responsive Dashboard',
        description:
          'Create a responsive dashboard with data visualization, filters, and a clean layout. ' +
          'Must work on mobile and desktop.',
        category: 'frontend',
        difficulty: 'intermediate',
        isPublished: true,
        createdBy: adminUser.id,
      })
      .returning();

    const [apiChallenge] = await db
      .insert(challenges)
      .values({
        slug: 'rest-api-crud',
        title: 'RESTful API with CRUD',
        description:
          'Build a RESTful API with full CRUD operations, validation, and error handling. ' +
          'Include authentication and rate limiting.',
        category: 'backend',
        difficulty: 'intermediate',
        isPublished: true,
        createdBy: adminUser.id,
      })
      .returning();

    const [algoChallenge] = await db
      .insert(challenges)
      .values({
        slug: 'algorithm-optimization',
        title: 'Optimize the Algorithm',
        description:
          'Given a brute-force solution, optimize it to meet time and space complexity requirements.',
        category: 'algorithm',
        difficulty: 'advanced',
        isPublished: true,
        createdBy: adminUser.id,
      })
      .returning();

    console.info('✅ Created challenges');

    // Create challenge versions
    await db.insert(challengeVersions).values([
      {
        challengeId: dashboardChallenge.id,
        versionNumber: 1,
        requirementsJson: {
          requirements: [
            {
              id: 'R1',
              title: 'Dashboard Layout',
              description: 'Responsive dashboard with sidebar, header, main content cards',
              weight: 25,
              evidence: ['screenshots_optional', 'dom_structure', 'css_breakpoints'],
              tests: ['layout.spec.ts'],
            },
            {
              id: 'R2',
              title: 'Data Visualization',
              description: 'At least 2 charts with mock data and legends',
              weight: 25,
              evidence: ['rendered_charts', 'accessibility_labels'],
              tests: ['charts.spec.ts'],
            },
            {
              id: 'R3',
              title: 'Filtering & State',
              description: 'Filters update displayed values; state management clear',
              weight: 25,
              evidence: ['filter_interactions', 'state_store'],
              tests: ['filters.spec.ts'],
            },
            {
              id: 'R4',
              title: 'Quality',
              description: 'Build passes, lint passes, no critical console errors',
              weight: 25,
              evidence: ['build_log', 'lint_log'],
              tests: ['build.spec.ts', 'lint.spec.ts'],
            },
          ],
          tieBreakers: ['tests_passed', 'critical_errors', 'submit_time'],
        },
        rubricJson: {
          criteria: [
            { id: 'C1', name: 'Functionality', maxScore: 40, description: 'All features work correctly' },
            { id: 'C2', name: 'Code Quality', maxScore: 30, description: 'Clean, maintainable code' },
            { id: 'C3', name: 'UI/UX', maxScore: 30, description: 'Polished, responsive design' },
          ],
        },
        constraintsJson: {
          maxDurationMinutes: 60,
          maxFileSizeBytes: 50 * 1024 * 1024,
          allowedFileTypes: ['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.html'],
          forbiddenPatterns: ['node_modules', '.env'],
        },
        publishedAt: new Date(),
      },
      {
        challengeId: apiChallenge.id,
        versionNumber: 1,
        requirementsJson: {
          requirements: [
            {
              id: 'R1',
              title: 'CRUD Endpoints',
              description: 'Implement all CRUD operations for resources',
              weight: 30,
              evidence: ['api_tests'],
              tests: ['crud.spec.ts'],
            },
            {
              id: 'R2',
              title: 'Validation',
              description: 'Proper input validation and error responses',
              weight: 25,
              evidence: ['validation_tests'],
              tests: ['validation.spec.ts'],
            },
            {
              id: 'R3',
              title: 'Authentication',
              description: 'JWT-based authentication',
              weight: 25,
              evidence: ['auth_tests'],
              tests: ['auth.spec.ts'],
            },
            {
              id: 'R4',
              title: 'Documentation',
              description: 'OpenAPI/Swagger docs or equivalent',
              weight: 20,
              evidence: ['docs_check'],
              tests: ['docs.spec.ts'],
            },
          ],
          tieBreakers: ['tests_passed', 'submit_time'],
        },
        rubricJson: {
          criteria: [
            { id: 'C1', name: 'Functionality', maxScore: 50, description: 'All endpoints work correctly' },
            { id: 'C2', name: 'Code Quality', maxScore: 30, description: 'Clean architecture and patterns' },
            { id: 'C3', name: 'Security', maxScore: 20, description: 'Secure implementation' },
          ],
        },
        constraintsJson: {
          maxDurationMinutes: 90,
          maxFileSizeBytes: 50 * 1024 * 1024,
          allowedFileTypes: ['.ts', '.js', '.json'],
          forbiddenPatterns: ['node_modules', '.env'],
        },
        publishedAt: new Date(),
      },
      {
        challengeId: algoChallenge.id,
        versionNumber: 1,
        requirementsJson: {
          requirements: [
            {
              id: 'R1',
              title: 'Correctness',
              description: 'Algorithm produces correct output for all test cases',
              weight: 40,
              evidence: ['test_results'],
              tests: ['correctness.spec.ts'],
            },
            {
              id: 'R2',
              title: 'Time Complexity',
              description: 'Meets O(n log n) or better time complexity',
              weight: 30,
              evidence: ['performance_tests'],
              tests: ['performance.spec.ts'],
            },
            {
              id: 'R3',
              title: 'Space Complexity',
              description: 'Meets O(n) or better space complexity',
              weight: 30,
              evidence: ['memory_tests'],
              tests: ['memory.spec.ts'],
            },
          ],
          tieBreakers: ['tests_passed', 'execution_time', 'submit_time'],
        },
        rubricJson: {
          criteria: [
            { id: 'C1', name: 'Correctness', maxScore: 50, description: 'Correct solution' },
            { id: 'C2', name: 'Efficiency', maxScore: 50, description: 'Optimal time/space complexity' },
          ],
        },
        constraintsJson: {
          maxDurationMinutes: 45,
          maxFileSizeBytes: 10 * 1024 * 1024,
          allowedFileTypes: ['.ts', '.js', '.py', '.go', '.rs'],
          forbiddenPatterns: ['node_modules'],
        },
        publishedAt: new Date(),
      },
    ]);
    console.info('✅ Created challenge versions');

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

    console.info('🎉 Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

seed();
