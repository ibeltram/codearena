# RepoRivals

A competitive coding platform where builders accept timed challenges, work in their own workflows/IDEs, submit final outputs (repo/zip), and are judged via deterministic automation + rubric + optional AI judge.

## Overview

RepoRivals includes:

1. **VS Code Extension** - Non-invasive matchmaking, timer, and submission (no workflow disruption)
2. **Web App** - Discovery, profiles, rankings, tournaments, wallet, artifacts/diffs, admin
3. **Backend Services** - Identity, matchmaking, submission ingestion, judging sandbox, scoring, credits ledger, rankings

## Tech Stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, shadcn/ui, React Query, Zustand
- **Backend**: Node.js (TypeScript), Fastify, PostgreSQL, Redis, BullMQ
- **Storage**: S3-compatible (MinIO for dev)
- **Extension**: VS Code Extension (TypeScript)
- **Integrations**: Stripe (payments), GitHub OAuth

## Project Structure

```
reporivals/
├── apps/
│   ├── api/          # Backend API (Fastify)
│   ├── web/          # Web app (Next.js)
│   └── extension/    # VS Code extension
├── packages/
│   └── shared/       # Shared types, utils, constants
├── docker-compose.yml
├── init.sh           # Development setup script
└── pnpm-workspace.yaml
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd reporivals

# Run the setup script (installs deps, starts infra)
./init.sh

# Start development servers
pnpm dev
```

### Available Commands

```bash
# Development
pnpm dev          # Start all apps
pnpm dev:api      # Start API only
pnpm dev:web      # Start web app only

# Build
pnpm build        # Build all apps
pnpm typecheck    # Run TypeScript checks
pnpm lint         # Run ESLint

# Database
pnpm db:migrate   # Run migrations
pnpm db:seed      # Seed development data
pnpm db:studio    # Open Drizzle Studio

# Infrastructure
./init.sh infra   # Start Docker services
./init.sh stop    # Stop Docker services
./init.sh reset   # Reset all data (fresh start)
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| Web App | 3000 | Next.js frontend |
| API | 3001 | Fastify backend |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Cache, sessions, queues |
| MinIO | 9000 | S3-compatible storage |
| MinIO Console | 9001 | Storage admin UI |

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL=postgresql://reporivals:reporivals@localhost:5432/reporivals

# Redis
REDIS_URL=redis://localhost:6379

# Storage
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# Auth
JWT_SECRET=your-secret-here
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Payments
STRIPE_SECRET_KEY=your-stripe-secret
STRIPE_WEBHOOK_SECRET=your-webhook-secret
```

## Architecture

### Match Flow

1. User browses challenges (web or extension)
2. Joins match (ranked queue or invite link)
3. Credits staked as holds
4. Match starts with server-authoritative timer
5. User works in their own IDE/workflow
6. Submits via extension (zip) or GitHub repo link
7. Optional: Lock submission before deadline
8. Judging runs in isolated sandbox
9. Scores calculated via rubric
10. Settlement transfers credits to winner

### Key Design Principles

- **Non-invasive**: Extension only acts on explicit commands
- **Reproducible**: Judging uses pinned images and immutable artifacts
- **Transparent**: All scoring based on rubric with evidence
- **Audit-grade**: Double-entry ledger for credits

## Development

### Creating a New Feature

1. Find or create Linear issue
2. Create feature branch from main
3. Implement with tests
4. Submit PR for review
5. Merge after approval

### Code Style

- TypeScript strict mode
- ESLint + Prettier
- Conventional commits

## License

Proprietary - All rights reserved
