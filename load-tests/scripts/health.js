/**
 * Health Endpoint Load Test
 *
 * Tests the API health endpoints under load to establish baseline performance.
 * These endpoints should be extremely fast and reliable.
 *
 * SLOs:
 * - p95 response time < 50ms
 * - Success rate > 99.99%
 * - Zero errors under normal load
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const healthCheckDuration = new Trend('health_check_duration', true);
const readinessCheckDuration = new Trend('readiness_check_duration', true);
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  scenarios: {
    // Constant load scenario
    constant_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '2m',
    },
    // Spike scenario
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 200 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 0 },
      ],
      startTime: '2m30s',
    },
  },
  thresholds: {
    // Health endpoint SLOs
    'health_check_duration': ['p(95)<50', 'p(99)<100'],
    'readiness_check_duration': ['p(95)<200', 'p(99)<500'],
    'errors': ['rate<0.0001'], // 99.99% success rate
    'http_req_failed': ['rate<0.0001'],
    'http_req_duration': ['p(95)<200'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  // Test simple health endpoint
  const healthRes = http.get(`${BASE_URL}/api/health`);
  healthCheckDuration.add(healthRes.timings.duration);

  const healthCheck = check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response has status ok': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok';
      } catch {
        return false;
      }
    },
    'health response time < 50ms': (r) => r.timings.duration < 50,
  });

  if (!healthCheck) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(0.1);

  // Test readiness endpoint (more comprehensive check)
  const readyRes = http.get(`${BASE_URL}/api/health/ready`);
  readinessCheckDuration.add(readyRes.timings.duration);

  const readyCheck = check(readyRes, {
    'ready status is 200 or 503': (r) => r.status === 200 || r.status === 503,
    'ready response has checks': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.checks !== undefined;
      } catch {
        return false;
      }
    },
    'ready response time < 200ms': (r) => r.timings.duration < 200,
  });

  if (!readyCheck) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(0.1);

  // Test liveness endpoint
  const liveRes = http.get(`${BASE_URL}/api/health/live`);

  check(liveRes, {
    'live status is 200': (r) => r.status === 200,
    'live response time < 20ms': (r) => r.timings.duration < 20,
  });

  sleep(0.3);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-tests/results/health-summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options) {
  const { metrics, root_group } = data;

  let output = '\n=== Health Endpoint Load Test Summary ===\n\n';

  if (metrics.health_check_duration) {
    output += `Health Check Duration:\n`;
    output += `  p50: ${metrics.health_check_duration.values['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `  p95: ${metrics.health_check_duration.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `  p99: ${metrics.health_check_duration.values['p(99)']?.toFixed(2) || 'N/A'}ms\n\n`;
  }

  if (metrics.readiness_check_duration) {
    output += `Readiness Check Duration:\n`;
    output += `  p50: ${metrics.readiness_check_duration.values['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `  p95: ${metrics.readiness_check_duration.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `  p99: ${metrics.readiness_check_duration.values['p(99)']?.toFixed(2) || 'N/A'}ms\n\n`;
  }

  if (metrics.errors) {
    output += `Error Rate: ${(metrics.errors.values.rate * 100).toFixed(4)}%\n`;
  }

  output += `\nTotal Requests: ${metrics.http_reqs?.values?.count || 'N/A'}\n`;

  return output;
}
