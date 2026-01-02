# CodeArena Load Testing Suite

This directory contains k6 load testing scripts for validating CodeArena's performance and SLOs.

## Prerequisites

1. Install k6:
   ```bash
   # macOS
   brew install k6

   # Linux
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update
   sudo apt-get install k6

   # Docker
   docker pull grafana/k6
   ```

2. Ensure the API server is running:
   ```bash
   npm run dev:api
   ```

## Test Scripts

### Health Endpoint Tests (`scripts/health.js`)
Tests basic health endpoints to establish baseline performance.
- Simple health check
- Readiness check (with dependency verification)
- Liveness probe

**SLOs:**
- p95 response time < 50ms
- Success rate > 99.99%

### Match Operations Tests (`scripts/matches.js`)
Tests match creation, joining, and lifecycle operations.
- Match creation
- Match listing
- Queue join/leave
- Match state transitions

**SLOs:**
- Match creation p95 < 500ms
- Match list p95 < 200ms
- Success rate > 99.9%

### Submission Upload Tests (`scripts/submissions.js`)
Tests the multipart upload flow for submissions.
- Upload initialization
- Part upload simulation
- Upload completion

**SLOs:**
- Upload init p95 < 300ms
- Upload complete p95 < 500ms
- Success rate > 99.5%

### General API Tests (`scripts/api-general.js`)
Comprehensive test of all major API endpoints.
- Challenges API
- Leaderboard API
- Tournaments API
- Credits API
- Rewards API

**SLOs:**
- API p95 < 200ms
- Success rate > 99.9%

## Running Tests

### Quick Smoke Test
```bash
k6 run --vus 5 --duration 30s scripts/health.js
```

### Full Test Suite
```bash
# Health tests
k6 run scripts/health.js

# Match operations (simulates 1000 concurrent match starts)
k6 run scripts/matches.js

# Submissions (simulates 500 concurrent uploads)
k6 run scripts/submissions.js

# General API
k6 run scripts/api-general.js
```

### With Custom Configuration
```bash
# Different base URL
k6 run -e BASE_URL=https://api.staging.codearena.io scripts/health.js

# Custom VUs and duration
k6 run --vus 100 --duration 5m scripts/api-general.js
```

### Docker Execution
```bash
docker run -i grafana/k6 run - <scripts/health.js
```

## Test Results

Results are saved to `load-tests/results/`:
- `health-summary.json`
- `matches-summary.json`
- `submissions-summary.json`
- `api-general-summary.json`

## CI Integration

Tests are integrated into GitHub Actions workflow. See `.github/workflows/load-test.yml`.

To run in CI:
```bash
npm run test:load
```

## SLO Definitions

| Endpoint Category | p95 Latency | p99 Latency | Success Rate |
|------------------|-------------|-------------|--------------|
| Health           | 50ms        | 100ms       | 99.99%       |
| Match Start      | 500ms       | 1000ms      | 99.9%        |
| Match List       | 200ms       | 400ms       | 99.9%        |
| Queue Join       | 500ms       | 1000ms      | 99.9%        |
| Upload Init      | 300ms       | 500ms       | 99.5%        |
| Upload Complete  | 500ms       | 1000ms      | 99.5%        |
| General API      | 200ms       | 500ms       | 99.9%        |
| Leaderboard      | 300ms       | 600ms       | 99.9%        |

## Grafana Integration

For real-time visualization, configure k6 to output to Grafana Cloud or InfluxDB:

```bash
# Grafana Cloud
k6 run \
  -o cloud \
  --out json=results.json \
  scripts/matches.js

# InfluxDB
k6 run \
  --out influxdb=http://localhost:8086/k6 \
  scripts/matches.js
```

## Troubleshooting

### API Not Reachable
Ensure the API server is running on the expected port:
```bash
curl http://localhost:3001/api/health
```

### Test Data Issues
Some tests require pre-seeded data (challenges, matches). In development, the API may return 404 for non-existent resources, which is handled gracefully.

### Memory Issues
For high-concurrency tests, ensure k6 has enough memory:
```bash
K6_NO_USAGE_REPORT=true k6 run --compatibility-mode=base scripts/matches.js
```
