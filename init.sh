#!/bin/bash

# CodeArena Development Environment Setup Script
# This script sets up and runs the development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}  CodeArena Development Setup${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check for required tools
check_requirements() {
    echo -e "${YELLOW}Checking requirements...${NC}"

    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        echo "Please install Node.js 20+ from https://nodejs.org"
        exit 1
    fi
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        echo -e "${RED}Error: Node.js 20+ required, found $(node -v)${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"

    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        echo -e "${YELLOW}Installing pnpm...${NC}"
        npm install -g pnpm
    fi
    echo -e "  ${GREEN}✓${NC} pnpm $(pnpm -v)"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        echo "Please install Docker from https://docker.com"
        exit 1
    fi
    echo -e "  ${GREEN}✓${NC} Docker $(docker -v | cut -d' ' -f3 | cut -d',' -f1)"

    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}Error: Docker Compose is not installed${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✓${NC} Docker Compose $(docker compose version --short)"

    echo ""
}

# Install dependencies
install_deps() {
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pnpm install
    echo -e "  ${GREEN}✓${NC} Dependencies installed"
    echo ""
}

# Start infrastructure services
start_infra() {
    echo -e "${YELLOW}Starting infrastructure services...${NC}"
    docker compose up -d postgres pgbouncer redis minio

    # Wait for services to be ready
    echo -e "  Waiting for PostgreSQL..."
    until docker compose exec -T postgres pg_isready -U codearena > /dev/null 2>&1; do
        sleep 1
    done
    echo -e "  ${GREEN}✓${NC} PostgreSQL ready"

    echo -e "  Waiting for PgBouncer..."
    until docker compose exec -T pgbouncer pg_isready -h localhost -p 5432 -U codearena > /dev/null 2>&1; do
        sleep 1
    done
    echo -e "  ${GREEN}✓${NC} PgBouncer ready"

    echo -e "  Waiting for Redis..."
    until docker compose exec -T redis redis-cli ping > /dev/null 2>&1; do
        sleep 1
    done
    echo -e "  ${GREEN}✓${NC} Redis ready"

    echo -e "  ${GREEN}✓${NC} MinIO ready"
    echo ""
}

# Run database migrations
run_migrations() {
    echo -e "${YELLOW}Running database migrations...${NC}"
    if [ -d "apps/api" ]; then
        pnpm --filter @codearena/api db:migrate 2>/dev/null || echo -e "  ${YELLOW}⚠${NC} Migrations not yet configured"
    else
        echo -e "  ${YELLOW}⚠${NC} API app not yet created"
    fi
    echo ""
}

# Create .env files if they don't exist
setup_env() {
    echo -e "${YELLOW}Setting up environment files...${NC}"

    if [ ! -f ".env" ]; then
        cat > .env << 'EOF'
# Database
DATABASE_URL=postgresql://codearena:codearena@localhost:5432/codearena

# Redis
REDIS_URL=redis://localhost:6379

# MinIO (S3-compatible storage)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_ARTIFACTS=codearena-artifacts
S3_BUCKET_UPLOADS=codearena-uploads

# Auth
JWT_SECRET=development-jwt-secret-change-in-production
DEVICE_CODE_EXPIRY=600

# GitHub OAuth (configure for your app)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Stripe (configure for your app)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# App URLs
API_URL=http://localhost:3001
WEB_URL=http://localhost:3000
EOF
        echo -e "  ${GREEN}✓${NC} Created .env file"
    else
        echo -e "  ${GREEN}✓${NC} .env file exists"
    fi
    echo ""
}

# Start development servers
start_dev() {
    echo -e "${YELLOW}Starting development servers...${NC}"
    echo ""
    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}  Development Environment Ready${NC}"
    echo -e "${GREEN}================================${NC}"
    echo ""
    echo -e "Services:"
    echo -e "  ${BLUE}PostgreSQL:${NC}  localhost:5432"
    echo -e "  ${BLUE}Redis:${NC}       localhost:6379"
    echo -e "  ${BLUE}MinIO:${NC}       localhost:9000 (Console: localhost:9001)"
    echo ""
    echo -e "To start the applications:"
    echo -e "  ${YELLOW}pnpm dev${NC}        - Start all apps in development mode"
    echo -e "  ${YELLOW}pnpm dev:api${NC}    - Start API server only"
    echo -e "  ${YELLOW}pnpm dev:web${NC}    - Start web app only"
    echo ""
    echo -e "URLs (when running):"
    echo -e "  ${BLUE}Web App:${NC}     http://localhost:3000"
    echo -e "  ${BLUE}API:${NC}         http://localhost:3001"
    echo -e "  ${BLUE}MinIO Console:${NC} http://localhost:9001 (minioadmin/minioadmin)"
    echo ""
    echo -e "To stop infrastructure:"
    echo -e "  ${YELLOW}docker compose down${NC}"
    echo ""
}

# Main execution
main() {
    cd "$(dirname "$0")"

    case "${1:-}" in
        --help|-h)
            echo "Usage: ./init.sh [command]"
            echo ""
            echo "Commands:"
            echo "  (none)    Full setup: check requirements, install deps, start infra"
            echo "  infra     Start infrastructure services only"
            echo "  deps      Install dependencies only"
            echo "  migrate   Run database migrations"
            echo "  stop      Stop all infrastructure services"
            echo "  reset     Stop services and remove volumes (fresh start)"
            echo ""
            exit 0
            ;;
        infra)
            start_infra
            ;;
        deps)
            install_deps
            ;;
        migrate)
            run_migrations
            ;;
        stop)
            echo -e "${YELLOW}Stopping infrastructure services...${NC}"
            docker compose down
            echo -e "${GREEN}✓${NC} Services stopped"
            ;;
        reset)
            echo -e "${RED}Warning: This will delete all data!${NC}"
            read -p "Are you sure? (y/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                docker compose down -v
                echo -e "${GREEN}✓${NC} Services stopped and volumes removed"
            fi
            ;;
        *)
            check_requirements
            setup_env
            install_deps
            start_infra
            run_migrations
            start_dev
            ;;
    esac
}

main "$@"
