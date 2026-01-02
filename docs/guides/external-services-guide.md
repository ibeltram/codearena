# External Services Setup Guide

This guide covers all external services and third-party integrations used by RepoRivals. Each section includes links, required configuration, and setup instructions.

## Quick Reference

| Service | Category | Required for Dev | Required for Prod | Complexity |
|---------|----------|------------------|-------------------|------------|
| PostgreSQL | Database | Yes | Yes | Low |
| PgBouncer | Database | Yes | Yes | Low |
| Redis | Cache/Queue | Yes | Yes | Low |
| MinIO/S3 | Storage | Yes | Yes | Low |
| Stripe | Payments | Optional | Yes | Medium |
| GitHub OAuth | Auth | Optional | Yes | Medium |
| Google OAuth | Auth | Optional | Optional | Medium |
| OpenAI API | AI Judge | Optional | Optional | Low |
| Anthropic API | AI Judge | Optional | Optional | Low |
| LaunchDarkly | Feature Flags | No | Optional | Medium |
| HashiCorp Vault | Secrets | No | Optional | High |
| AWS Secrets Manager | Secrets | No | Optional | Medium |
| PagerDuty | Alerting | No | Recommended | Medium |
| Opsgenie | Alerting | No | Recommended | Medium |
| OpenTelemetry | Tracing | No | Recommended | Medium |
| Prometheus | Metrics | Optional | Recommended | Low-Medium |
| k6 | Load Testing | Optional | Optional | Low |
| Sentry | Error Tracking | No | Recommended | Low |
| VS Code Marketplace | Publishing | No | Yes | Medium |

---

## Core Infrastructure

These services run locally via Docker Compose for development.

### PostgreSQL

**Purpose**: Primary relational database for all application data.

**Links**:
- Documentation: https://www.postgresql.org/docs/
- Docker Hub: https://hub.docker.com/_/postgres

**Environment Variables**:
```bash
DATABASE_URL=postgresql://codearena:codearena@localhost:5432/codearena
DATABASE_REPLICA_URL=                    # Optional: Read replica for scaling
DB_POOL_MAX=20                           # Optional: Max pool connections
DB_POOL_MIN=2                            # Optional: Min pool connections
```

**Setup**: Automatically configured via `docker-compose.yml`. Run:
```bash
./init.sh infra
```

---

### PgBouncer

**Purpose**: Connection pooling layer for PostgreSQL to handle high concurrency and reduce connection overhead.

**Links**:
- Documentation: https://www.pgbouncer.org/
- GitHub: https://github.com/pgbouncer/pgbouncer

**Environment Variables**:
```bash
PGBOUNCER_ADMIN_URL=                     # Optional: Admin interface URL
```

**Ports**:
- `5432` - Application connections (proxied to PostgreSQL)
- `6432` - Admin interface

**Setup**: Pre-configured in `docker-compose.yml`. The application connects through PgBouncer automatically.

**Configuration**: See `config/postgres/pgbouncer.ini` for pool settings.

---

### Redis

**Purpose**: Caching, session storage, real-time state, pub/sub messaging, and BullMQ job queues.

**Links**:
- Documentation: https://redis.io/docs/
- Docker Hub: https://hub.docker.com/_/redis

**Environment Variables**:
```bash
REDIS_URL=redis://localhost:6379
```

**Setup**: Automatically configured via `docker-compose.yml`.

**Used For**:
- Match state caching
- Real-time leaderboard updates
- Background job queues (BullMQ)
- WebSocket pub/sub

---

### MinIO (S3-Compatible Storage)

**Purpose**: Object storage for submission artifacts, uploads, logs, and challenge templates.

**Links**:
- Documentation: https://min.io/docs/minio/linux/index.html
- Console: http://localhost:9001 (when running)
- Docker Hub: https://hub.docker.com/r/minio/minio

**Environment Variables**:
```bash
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_ARTIFACTS=codearena-artifacts
S3_BUCKET_UPLOADS=codearena-uploads
```

**Ports**:
- `9000` - S3 API
- `9001` - Web Console

**Auto-Created Buckets**:
- `reporivals-artifacts` - Submission artifacts
- `reporivals-uploads` - User uploads
- `reporivals-logs` - System logs
- `reporivals-templates` - Challenge templates

**Production Note**: For production, replace with AWS S3, Google Cloud Storage, or DigitalOcean Spaces. Just update `S3_ENDPOINT` and credentials.

---

## Authentication

### GitHub OAuth

**Purpose**: Primary authentication method via GitHub OAuth 2.0.

**Links**:
- OAuth App Settings: https://github.com/settings/developers
- Documentation: https://docs.github.com/en/developers/apps/building-oauth-apps

**Environment Variables**:
```bash
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_CALLBACK_URL=http://localhost:3001/auth/github/callback
```

**Setup Guide**:

1. **Create OAuth App**:
   - Go to https://github.com/settings/developers
   - Click "New OAuth App"
   - Fill in:
     - **Application name**: `RepoRivals (Development)`
     - **Homepage URL**: `http://localhost:3000`
     - **Authorization callback URL**: `http://localhost:3001/auth/github/callback`
   - Click "Register application"

2. **Get Credentials**:
   - Copy the **Client ID**
   - Click "Generate a new client secret"
   - Copy the **Client Secret** immediately (shown only once)

3. **Configure Environment**:
   ```bash
   GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxx
   GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   GITHUB_CALLBACK_URL=http://localhost:3001/auth/github/callback
   ```

4. **Production Setup**:
   - Create a separate OAuth App for production
   - Update callback URL to your production domain
   - Never share secrets between environments

---

### Google OAuth

**Purpose**: Alternative authentication via Google OAuth 2.0 with PKCE.

**Links**:
- Google Cloud Console: https://console.cloud.google.com/
- OAuth Documentation: https://developers.google.com/identity/protocols/oauth2

**Environment Variables**:
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
```

**Setup Guide**:

1. **Create Project** (if needed):
   - Go to https://console.cloud.google.com/
   - Create a new project or select existing

2. **Enable OAuth Consent Screen**:
   - Navigate to "APIs & Services" > "OAuth consent screen"
   - Choose "External" user type
   - Fill in app information:
     - **App name**: `RepoRivals`
     - **User support email**: Your email
     - **Developer contact**: Your email
   - Add scopes: `email`, `profile`, `openid`
   - Save

3. **Create OAuth Credentials**:
   - Navigate to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Web application"
   - Name: `RepoRivals Web Client`
   - Authorized redirect URIs: `http://localhost:3001/auth/google/callback`
   - Click "Create"

4. **Get Credentials**:
   - Copy **Client ID** and **Client Secret**
   - Download JSON for backup

---

## Payments

### Stripe

**Purpose**: Credit purchases, payment processing, and webhook handling for transactions.

**Links**:
- Dashboard: https://dashboard.stripe.com/
- API Documentation: https://stripe.com/docs/api
- Test Mode: https://dashboard.stripe.com/test/apikeys
- Webhook Documentation: https://stripe.com/docs/webhooks

**Environment Variables**:
```bash
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

**Setup Guide**:

1. **Create Stripe Account**:
   - Sign up at https://dashboard.stripe.com/register
   - Complete business verification (for production)

2. **Get API Keys**:
   - Go to https://dashboard.stripe.com/test/apikeys (test mode)
   - Copy the **Secret key** (starts with `sk_test_`)
   - Never expose this key in client-side code

3. **Set Up Webhooks**:
   - Go to https://dashboard.stripe.com/test/webhooks
   - Click "Add endpoint"
   - Endpoint URL: `https://your-domain.com/webhooks/stripe`
   - Select events:
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `charge.refunded`
   - Copy the **Signing secret** (starts with `whsec_`)

4. **Local Development with Stripe CLI**:
   ```bash
   # Install Stripe CLI
   brew install stripe/stripe-cli/stripe

   # Login
   stripe login

   # Forward webhooks to localhost
   stripe listen --forward-to localhost:3001/webhooks/stripe

   # The CLI will output a webhook signing secret - use this for local dev
   ```

5. **Test Cards**:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - Requires Auth: `4000 0025 0000 3155`
   - Use any future expiry and any CVC

**Production Checklist**:
- [ ] Switch to live API keys
- [ ] Configure production webhook endpoint
- [ ] Set up Stripe Radar for fraud protection
- [ ] Configure receipt emails

---

## AI Services

### OpenAI API

**Purpose**: LLM-powered code evaluation and AI judging.

**Links**:
- Platform: https://platform.openai.com/
- API Keys: https://platform.openai.com/api-keys
- Documentation: https://platform.openai.com/docs
- Pricing: https://openai.com/pricing

**Environment Variables**:
```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
```

**Setup Guide**:

1. **Create Account**:
   - Sign up at https://platform.openai.com/
   - Add payment method for API usage

2. **Generate API Key**:
   - Go to https://platform.openai.com/api-keys
   - Click "Create new secret key"
   - Name it (e.g., "RepoRivals Production")
   - Copy immediately (shown only once)

3. **Set Usage Limits** (recommended):
   - Go to Settings > Limits
   - Set monthly spending cap
   - Configure usage alerts

**Model Used**: `gpt-4o` (configurable in `apps/api/src/lib/ai-judge.ts`)

---

### Anthropic API

**Purpose**: Alternative LLM provider for AI-powered code evaluation.

**Links**:
- Console: https://console.anthropic.com/
- API Keys: https://console.anthropic.com/settings/keys
- Documentation: https://docs.anthropic.com/
- Pricing: https://www.anthropic.com/pricing

**Environment Variables**:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
```

**Setup Guide**:

1. **Create Account**:
   - Sign up at https://console.anthropic.com/
   - Complete verification and add payment

2. **Generate API Key**:
   - Go to https://console.anthropic.com/settings/keys
   - Click "Create Key"
   - Copy the key immediately

**Model Used**: `claude-3-5-sonnet-20241022` (configurable in `apps/api/src/lib/ai-judge.ts`)

---

## Feature Management

### LaunchDarkly

**Purpose**: Feature flag management with targeting, rollouts, and experimentation.

**Links**:
- Dashboard: https://app.launchdarkly.com/
- Documentation: https://docs.launchdarkly.com/
- SDK Docs: https://docs.launchdarkly.com/sdk/server-side/node-js

**Environment Variables**:
```bash
LAUNCHDARKLY_SDK_KEY=sdk-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Optional: Environment variable overrides for individual flags
FEATURE_FLAG_AI_JUDGE=true
FEATURE_FLAG_NEW_MATCH_UI=false
```

**Setup Guide**:

1. **Create Account**:
   - Sign up at https://launchdarkly.com/
   - Create a project (e.g., "RepoRivals")

2. **Create Environments**:
   - Development, Staging, Production
   - Each environment gets its own SDK key

3. **Get SDK Key**:
   - Go to Account Settings > Projects
   - Select your project
   - Copy the **SDK key** for your environment
   - Note: This is server-side; never expose in client code

4. **Create Feature Flags**:
   - Go to Feature Flags > Create Flag
   - Suggested flags:
     - `ai-judge` - Enable AI judging
     - `new-match-ui` - New match interface
     - `websocket-v2` - Updated WebSocket protocol
     - `advanced-analytics` - Premium analytics features

5. **Local Development Without LaunchDarkly**:
   - Use environment variable overrides:
     ```bash
     FEATURE_FLAG_AI_JUDGE=true
     FEATURE_FLAG_NEW_MATCH_UI=false
     ```
   - Falls back to local flag configuration when SDK not configured

---

## Secrets Management

Choose one provider based on your infrastructure.

### HashiCorp Vault

**Purpose**: Enterprise-grade secrets storage with rotation, audit logging, and dynamic secrets.

**Links**:
- Documentation: https://developer.hashicorp.com/vault/docs
- Download: https://developer.hashicorp.com/vault/downloads
- Learn: https://developer.hashicorp.com/vault/tutorials

**Environment Variables**:
```bash
SECRETS_PROVIDER=vault
VAULT_ADDR=https://vault.your-domain.com:8200
VAULT_TOKEN=hvs.xxxxxxxxxxxx                    # Direct token auth

# Or use AppRole authentication (recommended for production):
VAULT_ROLE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VAULT_SECRET_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Optional:
VAULT_NAMESPACE=admin                            # Enterprise only
VAULT_MOUNT_PATH=secret                          # KV secrets engine mount
```

**Setup Guide**:

1. **Install Vault** (for local dev):
   ```bash
   # macOS
   brew install vault

   # Start dev server
   vault server -dev

   # Note the root token and unseal key
   ```

2. **Enable KV Secrets Engine**:
   ```bash
   export VAULT_ADDR='http://127.0.0.1:8200'
   export VAULT_TOKEN='your-root-token'

   vault secrets enable -path=secret kv-v2
   ```

3. **Store Secrets**:
   ```bash
   # Store database credentials
   vault kv put secret/reporivals/database \
     url="postgresql://user:pass@host:5432/db"

   # Store API keys
   vault kv put secret/reporivals/stripe \
     secret_key="sk_live_xxx" \
     webhook_secret="whsec_xxx"
   ```

4. **Create AppRole** (production):
   ```bash
   # Enable AppRole
   vault auth enable approle

   # Create policy
   vault policy write reporivals-policy - <<EOF
   path "secret/data/reporivals/*" {
     capabilities = ["read"]
   }
   EOF

   # Create role
   vault write auth/approle/role/reporivals \
     token_policies="reporivals-policy" \
     token_ttl=1h \
     token_max_ttl=4h

   # Get role-id and secret-id
   vault read auth/approle/role/reporivals/role-id
   vault write -f auth/approle/role/reporivals/secret-id
   ```

---

### AWS Secrets Manager

**Purpose**: AWS-managed secrets storage with automatic rotation.

**Links**:
- Documentation: https://docs.aws.amazon.com/secretsmanager/
- Console: https://console.aws.amazon.com/secretsmanager/
- Pricing: https://aws.amazon.com/secrets-manager/pricing/

**Environment Variables**:
```bash
SECRETS_PROVIDER=aws
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_SECRET_PREFIX=codearena                     # Prefix for all secrets
```

**Setup Guide**:

1. **Create IAM User/Role**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "secretsmanager:GetSecretValue",
           "secretsmanager:DescribeSecret"
         ],
         "Resource": "arn:aws:secretsmanager:*:*:secret:codearena/*"
       }
     ]
   }
   ```

2. **Create Secrets** (via CLI):
   ```bash
   aws secretsmanager create-secret \
     --name codearena/database \
     --secret-string '{"url":"postgresql://user:pass@host:5432/db"}'

   aws secretsmanager create-secret \
     --name codearena/stripe \
     --secret-string '{"secret_key":"sk_live_xxx","webhook_secret":"whsec_xxx"}'
   ```

3. **Or via Console**:
   - Go to Secrets Manager
   - Click "Store a new secret"
   - Choose "Other type of secret"
   - Enter key-value pairs
   - Name with prefix: `codearena/your-secret-name`

---

## Alerting & Monitoring

### PagerDuty

**Purpose**: On-call alerting and incident management.

**Links**:
- Dashboard: https://app.pagerduty.com/
- Documentation: https://developer.pagerduty.com/docs
- Events API: https://developer.pagerduty.com/docs/events-api-v2/overview/

**Environment Variables**:
```bash
ALERTING_ENABLED=true
ALERTING_PROVIDER=pagerduty
PAGERDUTY_ROUTING_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAGERDUTY_API_URL=https://events.pagerduty.com/v2/enqueue
```

**Setup Guide**:

1. **Create Account**:
   - Sign up at https://www.pagerduty.com/
   - Set up your on-call schedules

2. **Create Service**:
   - Go to Services > Service Directory
   - Click "New Service"
   - Name: "RepoRivals API"
   - Select escalation policy

3. **Get Integration Key**:
   - In the service, go to Integrations
   - Click "Add Integration"
   - Select "Events API V2"
   - Copy the **Integration Key** (this is your routing key)

4. **Configure Escalation Policy**:
   - Go to People > Escalation Policies
   - Create or edit policy for your service
   - Add team members and escalation rules

---

### Opsgenie

**Purpose**: Alternative on-call alerting and incident management (Atlassian).

**Links**:
- Dashboard: https://app.opsgenie.com/
- Documentation: https://docs.opsgenie.com/
- API Documentation: https://docs.opsgenie.com/docs/alert-api

**Environment Variables**:
```bash
ALERTING_ENABLED=true
ALERTING_PROVIDER=opsgenie
OPSGENIE_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
OPSGENIE_API_URL=https://api.opsgenie.com/v2/alerts
OPSGENIE_RESPONDERS=[{"type":"team","name":"Platform"}]
```

**Setup Guide**:

1. **Create Account**:
   - Sign up at https://www.atlassian.com/software/opsgenie

2. **Create API Integration**:
   - Go to Settings > Integrations
   - Click "Add Integration"
   - Select "API"
   - Name: "RepoRivals API"
   - Copy the **API Key**

3. **Configure Teams**:
   - Go to Teams
   - Create team (e.g., "Platform")
   - Add members and on-call schedules

4. **Set Responders**:
   ```bash
   # Team responder
   OPSGENIE_RESPONDERS='[{"type":"team","name":"Platform"}]'

   # User responder
   OPSGENIE_RESPONDERS='[{"type":"user","username":"admin@example.com"}]'

   # Multiple responders
   OPSGENIE_RESPONDERS='[{"type":"team","name":"Platform"},{"type":"user","username":"oncall@example.com"}]'
   ```

---

### OpenTelemetry (Distributed Tracing)

**Purpose**: Distributed tracing for HTTP, PostgreSQL, Redis, and Fastify requests.

**Links**:
- OpenTelemetry: https://opentelemetry.io/docs/
- Collector: https://opentelemetry.io/docs/collector/
- Jaeger (free backend): https://www.jaegertracing.io/
- Grafana Tempo: https://grafana.com/oss/tempo/

**Environment Variables**:
```bash
OTEL_ENABLED=true
OTEL_SERVICE_NAME=reporivals-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_HEADERS={}                    # JSON object for auth headers
OTEL_SAMPLE_RATE=0.1                             # 10% sampling in production
OTEL_DEBUG=false
```

**Setup with Jaeger** (local development):

1. **Run Jaeger**:
   ```bash
   docker run -d --name jaeger \
     -p 16686:16686 \
     -p 4318:4318 \
     jaegertracing/jaeger:2 \
     --collector.otlp.grpc.host-port=:4317 \
     --collector.otlp.http.host-port=:4318
   ```

2. **Configure Environment**:
   ```bash
   OTEL_ENABLED=true
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   ```

3. **View Traces**:
   - Open http://localhost:16686

**Production Options**:
- **Grafana Tempo** (self-hosted)
- **Honeycomb** (SaaS)
- **Datadog APM** (SaaS)
- **New Relic** (SaaS)

---

### Prometheus (Metrics)

**Purpose**: Application metrics collection and SLI tracking.

**Links**:
- Documentation: https://prometheus.io/docs/
- Download: https://prometheus.io/download/
- Grafana Dashboards: https://grafana.com/grafana/dashboards/

**Metrics Endpoint**: `GET /metrics` on the API (port 3001)

**Custom Metrics Exposed**:
- `reporivals_match_start_total` - Matches started
- `reporivals_match_complete_total` - Matches completed
- `reporivals_active_matches` - Currently active matches
- `reporivals_upload_total` - File uploads
- `reporivals_judging_duration_seconds` - Judging time histogram
- `reporivals_payment_total` - Payment transactions

**Setup Guide**:

1. **Run Prometheus** (local):
   ```bash
   docker run -d --name prometheus \
     -p 9090:9090 \
     -v $(pwd)/config/alerting/prometheus.yml:/etc/prometheus/prometheus.yml \
     prom/prometheus
   ```

2. **Configure Scraping** (`config/alerting/prometheus.yml`):
   ```yaml
   scrape_configs:
     - job_name: 'reporivals-api'
       static_configs:
         - targets: ['host.docker.internal:3001']
   ```

3. **View Metrics**:
   - Open http://localhost:9090

4. **Add Grafana** (optional):
   ```bash
   docker run -d --name grafana \
     -p 3000:3000 \
     grafana/grafana
   ```

---

## Testing

### k6 (Load Testing)

**Purpose**: Performance and load testing with SLO validation.

**Links**:
- Documentation: https://grafana.com/docs/k6/
- Installation: https://grafana.com/docs/k6/latest/set-up/install-k6/
- GitHub: https://github.com/grafana/k6

**Environment Variables**:
```bash
STAGING_API_URL=https://staging-api.reporivals.com
PRODUCTION_API_URL=https://api.reporivals.com
```

**Setup Guide**:

1. **Install k6**:
   ```bash
   # macOS
   brew install k6

   # Linux
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update
   sudo apt-get install k6
   ```

2. **Run Tests**:
   ```bash
   # Run smoke test
   k6 run load-tests/scripts/smoke.js

   # Run load test
   k6 run load-tests/scripts/load.js

   # Run stress test
   k6 run load-tests/scripts/stress.js
   ```

3. **Test Scripts Location**: `load-tests/scripts/`

---

## Error Tracking

### Sentry (VS Code Extension)

**Purpose**: Error tracking and monitoring for the VS Code extension.

**Links**:
- Dashboard: https://sentry.io/
- Documentation: https://docs.sentry.io/
- VS Code Extension SDK: https://docs.sentry.io/platforms/javascript/

**VS Code Extension Settings**:
```json
{
  "reporivals.telemetry.enabled": true,
  "reporivals.telemetry.sentryDsn": "https://xxx@o123.ingest.sentry.io/456"
}
```

**Setup Guide**:

1. **Create Sentry Project**:
   - Sign up at https://sentry.io/
   - Create new project > JavaScript (Browser)

2. **Get DSN**:
   - Go to Project Settings > Client Keys (DSN)
   - Copy the DSN URL

3. **Configure Extension**:
   - Users can enable in VS Code settings
   - DSN is configured in extension settings

---

## Extension Publishing

### VS Code Marketplace

**Purpose**: Publishing the RepoRivals VS Code extension.

**Links**:
- Marketplace: https://marketplace.visualstudio.com/
- Publisher Management: https://marketplace.visualstudio.com/manage
- Publishing Docs: https://code.visualstudio.com/api/working-with-extensions/publishing-extension

**Setup Guide**:

1. **Create Publisher Account**:
   - Go to https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft account
   - Create publisher (e.g., "reporivals")

2. **Generate Personal Access Token**:
   - Go to Azure DevOps: https://dev.azure.com/
   - User Settings > Personal Access Tokens
   - New Token:
     - Name: "VS Code Publishing"
     - Organization: All accessible organizations
     - Scopes: Marketplace > Manage

3. **Install VSCE**:
   ```bash
   npm install -g @vscode/vsce
   ```

4. **Login to Publisher**:
   ```bash
   vsce login reporivals
   # Paste your PAT when prompted
   ```

5. **Publish Extension**:
   ```bash
   cd apps/extension
   vsce package    # Creates .vsix file
   vsce publish    # Publishes to marketplace
   ```

6. **CI/CD Publishing**: See `.github/workflows/` for automated publishing.

---

## Environment File Template

Create your `.env` from this template:

```bash
# ===========================================
# CORE INFRASTRUCTURE (Required for Development)
# ===========================================

# Database (via PgBouncer)
DATABASE_URL=postgresql://codearena:codearena@localhost:5432/codearena

# Redis
REDIS_URL=redis://localhost:6379

# S3 Storage (MinIO locally)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_ARTIFACTS=codearena-artifacts
S3_BUCKET_UPLOADS=codearena-uploads

# ===========================================
# AUTHENTICATION
# ===========================================

# JWT
JWT_SECRET=development-jwt-secret-change-in-production
DEVICE_CODE_EXPIRY=600

# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:3001/auth/github/callback

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback

# ===========================================
# PAYMENTS
# ===========================================

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# ===========================================
# AI SERVICES (Optional)
# ===========================================

# OpenAI (for AI Judge)
# OPENAI_API_KEY=sk-...

# Anthropic (alternative AI Judge)
# ANTHROPIC_API_KEY=sk-ant-...

# ===========================================
# FEATURE FLAGS (Optional)
# ===========================================

# LaunchDarkly
# LAUNCHDARKLY_SDK_KEY=sdk-...

# Or use environment variable overrides:
# FEATURE_FLAG_AI_JUDGE=true
# FEATURE_FLAG_NEW_MATCH_UI=false

# ===========================================
# SECRETS MANAGEMENT (Production)
# ===========================================

SECRETS_PROVIDER=local
# Options: local, vault, aws

# Vault Configuration
# VAULT_ADDR=https://vault.example.com:8200
# VAULT_TOKEN=hvs.xxxxx
# VAULT_ROLE_ID=
# VAULT_SECRET_ID=

# AWS Secrets Manager Configuration
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_SECRET_PREFIX=codearena

# Secrets Cache
SECRETS_CACHE_ENABLED=true
SECRETS_CACHE_TTL=300
SECRETS_AUDIT_ENABLED=true
SECRETS_AUDIT_LEVEL=info

# ===========================================
# ALERTING (Production)
# ===========================================

ALERTING_ENABLED=false
ALERTING_PROVIDER=none
# Options: none, pagerduty, opsgenie

# PagerDuty
# PAGERDUTY_ROUTING_KEY=
# PAGERDUTY_API_URL=https://events.pagerduty.com/v2/enqueue

# Opsgenie
# OPSGENIE_API_KEY=
# OPSGENIE_API_URL=https://api.opsgenie.com/v2/alerts
# OPSGENIE_RESPONDERS=[{"type":"team","name":"Platform"}]

# ===========================================
# OBSERVABILITY (Production)
# ===========================================

# OpenTelemetry
OTEL_ENABLED=false
OTEL_SERVICE_NAME=reporivals-api
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
# OTEL_SAMPLE_RATE=0.1

# ===========================================
# APP URLS
# ===========================================

API_URL=http://localhost:3001
WEB_URL=http://localhost:3000
RUNBOOK_BASE_URL=https://docs.reporivals.com/runbooks
ESCALATION_TIMEOUT_MINUTES=15
```

---

## Troubleshooting

### Common Issues

**Docker services won't start**:
```bash
# Check Docker is running
docker ps

# Reset everything
./init.sh reset
./init.sh infra
```

**GitHub OAuth callback error**:
- Verify callback URL matches exactly (including trailing slashes)
- Check CLIENT_ID and CLIENT_SECRET are correct
- Ensure the OAuth app isn't in suspended state

**Stripe webhook signature mismatch**:
- Use the webhook secret from `stripe listen` for local dev
- Ensure you're using the correct secret for the environment

**Vault connection refused**:
- Check VAULT_ADDR is accessible
- Verify token isn't expired
- For AppRole, ensure secret-id hasn't expired

**OpenTelemetry traces not appearing**:
- Check OTEL_ENABLED=true
- Verify OTLP endpoint is accessible
- Check collector/Jaeger logs for errors

---

## Production Checklist

Before going live, ensure:

- [ ] All secrets moved to Vault or AWS Secrets Manager
- [ ] Production API keys for Stripe, OAuth providers
- [ ] Alerting configured with PagerDuty or Opsgenie
- [ ] OpenTelemetry connected to production backend
- [ ] Prometheus/Grafana dashboards set up
- [ ] Sentry configured for error tracking
- [ ] Feature flags tested and configured
- [ ] Load tests passed with production-like traffic
- [ ] Database backups configured
- [ ] S3 bucket policies and CORS configured
- [ ] SSL/TLS certificates in place
- [ ] Rate limiting configured
- [ ] Health checks verified
