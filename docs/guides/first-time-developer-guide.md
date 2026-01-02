# First-Time Developer Guide: CodeArena

Welcome to CodeArena! This guide will help you understand the platform, get your development environment running, and start contributing.

---

## Table of Contents

1. [What Is CodeArena?](#what-is-codearena)
2. [Technology Stack](#technology-stack)
3. [Getting Started](#getting-started)
4. [Project Structure](#project-structure)
5. [Core Concepts](#core-concepts)
6. [The Match Flow](#the-match-flow)
7. [Key Backend Services](#key-backend-services)
8. [Development Workflow](#development-workflow)
9. [Common Tasks](#common-tasks)
10. [Database & Migrations](#database-and-migrations)
11. [API Reference](#api-reference)
12. [Testing](#testing)
13. [Troubleshooting](#troubleshooting)
14. [Where to Find Things](#where-to-find-things)

---

## What Is CodeArena?

CodeArena is a **competitive coding platform** where developers:

- Accept timed programming challenges
- Work in their own IDE/workflow (no disruption)
- Submit solutions via zip upload or GitHub repo
- Get judged automatically via rubrics and optional AI
- Compete for credits and prizes

**The platform has three main components:**

| Component | Description |
|-----------|-------------|
| **Web App** | Next.js frontend for browsing challenges, viewing matches, managing wallet, leaderboards |
| **API** | Fastify backend handling all business logic, authentication, payments, judging |
| **VS Code Extension** | Non-invasive extension for matchmaking, timer display, and submissions |

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 14 (App Router) | Web application |
| **Styling** | Tailwind CSS + shadcn/ui | UI components |
| **State** | React Query + Zustand | Client state management |
| **Backend** | Fastify (Node.js/TypeScript) | REST API server |
| **Database** | PostgreSQL | Primary data store |
| **ORM** | Drizzle | Type-safe database queries |
| **Cache** | Redis | Sessions, queues, rate limiting |
| **Queue** | BullMQ | Background job processing |
| **Storage** | MinIO (S3-compatible) | Artifacts, logs, uploads |
| **Payments** | Stripe | Credit purchases |
| **Auth** | GitHub OAuth, Google OAuth | User authentication |
| **Extension** | VS Code Extension (TypeScript) | IDE integration |

---

## Getting Started

### Prerequisites

Make sure you have installed:

- **Node.js 20** or higher
- **pnpm 8** or higher
- **Docker & Docker Compose**

### Step 1: Clone and Install

```bash
cd codearena
pnpm install
```

### Step 2: Start Infrastructure

```bash
# Run the setup script (starts Docker containers)
./init.sh

# This starts:
# - PostgreSQL on port 5432
# - Redis on port 6379
# - MinIO on port 9000 (console on 9001)
```

### Step 3: Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
# Database
DATABASE_URL=postgresql://reporivals:reporivals@localhost:5432/reporivals

# Redis
REDIS_URL=redis://localhost:6379

# Storage (MinIO)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# Auth
JWT_SECRET=your-secret-here
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Payments (optional for local dev)
STRIPE_SECRET_KEY=your-stripe-secret
STRIPE_WEBHOOK_SECRET=your-webhook-secret
```

### Step 4: Set Up Database

```bash
# Run migrations
pnpm db:migrate

# Seed development data
pnpm db:seed
```

### Step 5: Start Development Servers

```bash
# Start all apps (API + Web)
pnpm dev

# Or start individually:
pnpm dev:api    # API on port 3001
pnpm dev:web    # Web on port 3000
```

### Step 6: Access the Application

| Service | URL |
|---------|-----|
| Web App | http://localhost:3000 |
| API | http://localhost:3001 |
| API Health | http://localhost:3001/api/health |
| MinIO Console | http://localhost:9001 |

---

## Project Structure

```
codearena/
├── apps/
│   ├── api/                    # Backend API (Fastify)
│   │   ├── src/
│   │   │   ├── index.ts       # Server entry point
│   │   │   ├── db/            # Database layer
│   │   │   │   ├── schema/    # Table definitions
│   │   │   │   ├── index.ts   # DB connection
│   │   │   │   ├── migrate.ts # Migration runner
│   │   │   │   └── seed.ts    # Seed data
│   │   │   ├── lib/           # Core business logic
│   │   │   │   ├── match-state-machine.ts
│   │   │   │   ├── scoring-engine.ts
│   │   │   │   ├── staking.ts
│   │   │   │   ├── glicko2.ts
│   │   │   │   ├── judging.ts
│   │   │   │   └── ...
│   │   │   ├── plugins/       # Fastify plugins
│   │   │   │   ├── jwt.ts
│   │   │   │   ├── cors.ts
│   │   │   │   ├── rateLimit.ts
│   │   │   │   └── ...
│   │   │   └── routes/        # API endpoints
│   │   │       ├── auth.ts
│   │   │       ├── challenges.ts
│   │   │       ├── matches.ts
│   │   │       ├── credits.ts
│   │   │       ├── admin/     # Admin routes
│   │   │       └── ...
│   │   └── package.json
│   │
│   ├── web/                   # Frontend (Next.js)
│   │   ├── src/
│   │   │   ├── app/          # App Router pages
│   │   │   │   ├── page.tsx              # Home /
│   │   │   │   ├── layout.tsx            # Root layout
│   │   │   │   ├── challenges/           # /challenges
│   │   │   │   ├── matches/              # /matches
│   │   │   │   ├── wallet/               # /wallet
│   │   │   │   ├── leaderboard/          # /leaderboard
│   │   │   │   ├── tournaments/          # /tournaments
│   │   │   │   ├── rewards/              # /rewards
│   │   │   │   ├── profile/              # /profile/[username]
│   │   │   │   ├── admin/                # /admin/*
│   │   │   │   └── ...
│   │   │   ├── components/   # React components
│   │   │   │   ├── ui/       # shadcn/ui primitives
│   │   │   │   ├── layout/   # Header, MainLayout
│   │   │   │   ├── challenges/
│   │   │   │   ├── matches/
│   │   │   │   ├── wallet/
│   │   │   │   ├── admin/
│   │   │   │   └── ...
│   │   │   └── providers/    # React context providers
│   │   └── package.json
│   │
│   └── extension/            # VS Code Extension
│       ├── src/
│       │   ├── extension.ts  # Extension entry
│       │   ├── services/     # Auth, submission, match
│       │   ├── providers/    # Tree view providers
│       │   └── panels/       # Webview panels
│       └── package.json
│
├── packages/
│   ├── shared/               # Shared types and utilities
│   ├── tsconfig/             # Shared TypeScript configs
│   └── eslint-config/        # Shared ESLint configs
│
├── config/                   # Configuration files
├── docker-compose.yml        # Infrastructure services
├── init.sh                   # Setup script
├── app_spec.txt             # Full application specification
└── pnpm-workspace.yaml      # Monorepo config
```

---

## Core Concepts

### Challenge

A programming task that users compete on.

- Has a **title**, **description**, **difficulty**, **category**
- Contains **requirements** with weights for scoring
- Has **versions** (immutable once published)
- May include a **template** (starter code)

### Challenge Version

An immutable published version of a challenge.

- Matches always reference a specific version
- Contains the **rubric** for judging
- Specifies the **judge image** (container) to use

### Match

A competition instance between participants.

**States:**
```
created → open → matched → in_progress → submission_locked → judging → finalized → archived
```

- Has a **time limit** and **stake amount**
- Can be **ranked**, **invite-only**, or **tournament**

### Submission

A participant's solution for a match.

- Uploaded as **zip** or linked via **GitHub repo + commit**
- Gets normalized into an **artifact**
- Undergoes **secret scanning** before storage

### Artifact

An immutable, content-addressed snapshot of a submission.

- Has a **SHA-256 content hash**
- Stored in S3-compatible storage
- Contains a **manifest** of all files

### Rubric

Scoring criteria for a challenge.

```json
{
  "requirements": [
    {
      "id": "R1",
      "title": "Dashboard Layout",
      "weight": 25,
      "tests": ["layout.spec.ts"]
    }
  ],
  "tie_breakers": ["tests_passed", "submit_time"]
}
```

### Credits

Platform currency for staking and rewards.

- **Utility-only** (non-withdrawable)
- Purchased via Stripe or won in matches
- Held in reserve during active matches
- Redeemable for automation services

### Rankings

Player skill ratings using **Glicko-2** algorithm.

- Rating, deviation, and volatility
- Organized by **seasons**
- Category-specific leaderboards

---

## The Match Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MATCH LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. USER BROWSES CHALLENGES                                          │
│     └─► Web app or VS Code extension                                 │
│                                                                      │
│  2. JOINS MATCH                                                      │
│     ├─► Ranked queue (skill-based matchmaking)                       │
│     ├─► Invite link (direct challenge)                               │
│     └─► Tournament bracket                                           │
│                                                                      │
│  3. CREDITS STAKED                                                   │
│     └─► Amount held in reserve (credit_holds table)                  │
│                                                                      │
│  4. MATCH STARTS                                                     │
│     ├─► Server-authoritative timer begins                            │
│     └─► Both participants notified via WebSocket                     │
│                                                                      │
│  5. USER WORKS                                                       │
│     └─► In their own IDE, no platform disruption                     │
│                                                                      │
│  6. SUBMISSION                                                       │
│     ├─► Via extension: zip package with file preview                 │
│     └─► Via web: GitHub repo + commit reference                      │
│                                                                      │
│  7. LOCK (optional)                                                  │
│     └─► Explicit confirmation, submission becomes immutable          │
│                                                                      │
│  8. DEADLINE                                                         │
│     └─► All submissions locked, judging begins                       │
│                                                                      │
│  9. JUDGING                                                          │
│     ├─► Runs in isolated sandbox                                     │
│     ├─► Automated tests execute                                      │
│     ├─► Rubric scoring applied                                       │
│     └─► Optional AI judge for subjective criteria                    │
│                                                                      │
│  10. SETTLEMENT                                                      │
│      ├─► Winner receives loser's stake (minus platform fee)          │
│      ├─► Ties split stakes                                           │
│      └─► Rankings updated via Glicko-2                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Backend Services

### Match State Machine
**File:** `apps/api/src/lib/match-state-machine.ts`

Manages match lifecycle with valid state transitions:
- Enforces timing rules
- Prevents invalid transitions
- Emits events for real-time updates

### Scoring Engine
**File:** `apps/api/src/lib/scoring-engine.ts`

Processes judging results:
- Applies rubric weights to test results
- Calculates total scores
- Handles tie-breakers

### Staking System
**File:** `apps/api/src/lib/staking.ts`

Manages credits for matches:
- Creates holds when joining
- Releases on cancellation
- Settles atomically on finalization

### Glicko-2 Rating
**File:** `apps/api/src/lib/glicko2.ts`

Player rating calculations:
- Updates after each match
- Accounts for rating deviation
- Powers skill-based matchmaking

### Judging Pipeline
**File:** `apps/api/src/lib/judging.ts`

Orchestrates the judging process:
- Queues sandbox jobs
- Runs tests in isolation
- Collects results and logs

### Collusion Detection
**File:** `apps/api/src/lib/collusion-detection.ts`

Anti-abuse measures:
- Detects suspicious patterns
- Opponent throttling
- Stake caps by rank

---

## Development Workflow

### Running Locally

```bash
# Start everything
pnpm dev

# Watch for changes - servers auto-reload
```

### Making Changes

1. **Edit code** in `apps/api/` or `apps/web/`
2. **Save** - hot reload picks up changes
3. **Test** in browser at http://localhost:3000
4. **Check API** at http://localhost:3001

### Code Style

- TypeScript strict mode enabled
- ESLint + Prettier for formatting
- Run `pnpm lint` to check
- Run `pnpm typecheck` to verify types

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "Add my feature"

# Push and create PR
git push -u origin feature/my-feature
```

---

## Common Tasks

### Adding a New API Endpoint

1. Create or edit route file:
```typescript
// apps/api/src/routes/my-route.ts
import { FastifyInstance } from 'fastify';

export async function myRoutes(app: FastifyInstance) {
  app.get('/api/my-endpoint', async (request, reply) => {
    return { message: 'Hello!' };
  });
}
```

2. Register in `apps/api/src/routes/index.ts`:
```typescript
import { myRoutes } from './my-route';

export async function registerRoutes(app: FastifyInstance) {
  // ... existing routes
  app.register(myRoutes);
}
```

### Adding a New Page

Create file in `apps/web/src/app/`:

```typescript
// apps/web/src/app/my-page/page.tsx
export default function MyPage() {
  return (
    <div>
      <h1>My Page</h1>
    </div>
  );
}
```

Now accessible at http://localhost:3000/my-page

### Adding a New Component

```typescript
// apps/web/src/components/my-component.tsx
interface MyComponentProps {
  title: string;
}

export function MyComponent({ title }: MyComponentProps) {
  return <div className="p-4">{title}</div>;
}
```

### Adding a shadcn/ui Component

```bash
cd apps/web
npx shadcn-ui add button
npx shadcn-ui add dialog
npx shadcn-ui add form
```

### Adding a Database Table

1. Create schema file:
```typescript
// apps/api/src/db/schema/my-table.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

2. Export from index:
```typescript
// apps/api/src/db/schema/index.ts
export * from './my-table';
```

3. Run migration:
```bash
pnpm db:migrate
```

---

## Database and Migrations

### Schema Overview

| Area | Tables |
|------|--------|
| **Users** | users, oauth_accounts |
| **Challenges** | challenges, challenge_versions |
| **Matches** | matches, match_participants |
| **Submissions** | submissions, artifacts |
| **Judging** | judgement_runs, scores |
| **Credits** | credit_accounts, credit_holds, credit_ledger_entries |
| **Rankings** | rankings, seasons |
| **Tournaments** | tournaments, prize_claims |
| **Rewards** | partner_rewards, reward_inventory, reward_redemptions |
| **Moderation** | disputes, moderation_actions, events_audit |

### Database Commands

```bash
# Run pending migrations
pnpm db:migrate

# Seed development data
pnpm db:seed

# Open Drizzle Studio (database GUI)
pnpm db:studio

# Generate migration from schema changes
pnpm db:generate
```

### Connecting to Database

```bash
# Via psql
psql postgresql://reporivals:reporivals@localhost:5432/reporivals

# Or use Drizzle Studio
pnpm db:studio
```

---

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/me` | GET | Get current user |
| `/api/auth/logout` | POST | Logout |
| `/api/auth/github` | GET | GitHub OAuth start |
| `/api/auth/github/callback` | GET | GitHub OAuth callback |
| `/api/auth/google` | GET | Google OAuth start |
| `/api/auth/device/start` | POST | Device code flow (extension) |
| `/api/auth/device/confirm` | POST | Confirm device code |

### Challenges

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/challenges` | GET | List challenges |
| `/api/challenges/:slug` | GET | Get challenge by slug |
| `/api/challenges/:id/versions` | GET | Get challenge versions |

### Matches

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/matches` | POST | Create invite match |
| `/api/matches/queue` | POST | Join ranked queue |
| `/api/matches/:id` | GET | Get match details |
| `/api/matches/:id/join` | POST | Join a match |
| `/api/matches/:id/ready` | POST | Mark ready |
| `/api/matches/:id/forfeit` | POST | Forfeit match |
| `/api/matches/:id/events` | GET | WebSocket events |

### Credits

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/credits/balance` | GET | Get credit balance |
| `/api/credits/history` | GET | Transaction history |

### Admin (requires admin role)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/challenges` | POST | Create challenge |
| `/api/admin/challenges/:id/publish` | POST | Publish challenge |
| `/api/admin/disputes` | GET | List disputes |
| `/api/admin/disputes/:id/resolve` | POST | Resolve dispute |

---

## Testing

### Manual Testing

1. Start the app: `pnpm dev`
2. Open http://localhost:3000
3. Test features through the UI

### API Testing with curl

```bash
# Health check
curl http://localhost:3001/api/health

# Get challenges (public)
curl http://localhost:3001/api/challenges

# Authenticated request
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/auth/me
```

### TypeScript Checks

```bash
# Check all packages
pnpm typecheck

# Check specific app
cd apps/api && pnpm typecheck
```

### Linting

```bash
# Lint all packages
pnpm lint

# Fix auto-fixable issues
pnpm lint --fix
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000
lsof -i :3001

# Kill the process
kill -9 <PID>

# Or kill Next.js dev server specifically
pkill -f "next dev"
```

### Database Connection Failed

```bash
# Check if Docker containers are running
docker ps

# Restart infrastructure
./init.sh infra

# Check database is accessible
psql postgresql://reporivals:reporivals@localhost:5432/reporivals
```

### pnpm Install Fails

```bash
# Clear cache
pnpm store prune

# Remove node_modules and reinstall
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

### TypeScript Errors After Pulling

```bash
# Reinstall and rebuild
pnpm install
pnpm build
```

### API Returns 401 Unauthorized

- Check JWT_SECRET is set in `.env`
- Verify your token hasn't expired
- Check if the route requires authentication
- Check if user has the required role

### Redis Connection Failed

```bash
# Check Redis is running
docker ps | grep redis

# Restart Redis
docker compose restart redis
```

---

## Where to Find Things

### By Feature

| Feature | Backend | Frontend |
|---------|---------|----------|
| Authentication | `routes/auth.ts`, `auth-github.ts`, `auth-google.ts` | `app/login/` |
| Challenges | `routes/challenges.ts` | `app/challenges/`, `components/challenges/` |
| Matches | `routes/matches.ts`, `lib/match-state-machine.ts` | `app/matches/`, `components/matches/` |
| Submissions | `routes/submissions.ts`, `lib/artifact-processor.ts` | `components/artifact/` |
| Credits/Wallet | `routes/credits.ts`, `lib/staking.ts` | `app/wallet/`, `components/wallet/` |
| Payments | `routes/payments.ts`, `lib/stripe.ts` | `components/wallet/credit-packages.tsx` |
| Ratings | `lib/glicko2.ts`, `lib/rating-service.ts` | `app/leaderboard/` |
| Judging | `lib/judging.ts`, `lib/scoring-engine.ts` | `components/matches/judging-results.tsx` |
| Rewards | `routes/rewards.ts` | `app/rewards/`, `components/rewards/` |
| Tournaments | `routes/tournaments.ts` | `app/tournaments/` |
| Admin | `routes/admin/*` | `app/admin/*`, `components/admin/*` |

### By File Type

| Type | Location |
|------|----------|
| API routes | `apps/api/src/routes/` |
| Business logic | `apps/api/src/lib/` |
| Database schemas | `apps/api/src/db/schema/` |
| Fastify plugins | `apps/api/src/plugins/` |
| React pages | `apps/web/src/app/` |
| React components | `apps/web/src/components/` |
| UI primitives | `apps/web/src/components/ui/` |
| Shared types | `packages/shared/src/types/` |
| Extension code | `apps/extension/src/` |

---

## Next Steps

1. **Run the app locally** - Follow Getting Started above
2. **Explore the UI** - Click through all pages
3. **Read `app_spec.txt`** - Full requirements document
4. **Check the database** - Run `pnpm db:studio`
5. **Make a small change** - Edit a component, see hot reload
6. **Read the API routes** - Understand the endpoints

Welcome to the team!
