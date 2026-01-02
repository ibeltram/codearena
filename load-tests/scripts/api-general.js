/**
 * General API Load Test
 *
 * Tests all major API endpoints under concurrent load.
 * This is the comprehensive test that validates overall API performance.
 *
 * SLOs:
 * - API p95 < 200ms (general endpoints)
 * - API p99 < 500ms
 * - Success rate > 99.9%
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const challengesDuration = new Trend('challenges_duration', true);
const leaderboardDuration = new Trend('leaderboard_duration', true);
const tournamentsDuration = new Trend('tournaments_duration', true);
const creditsDuration = new Trend('credits_duration', true);
const rewardsDuration = new Trend('rewards_duration', true);
const errorRate = new Rate('errors');
const requestsTotal = new Counter('requests_total');

// Test configuration
export const options = {
  scenarios: {
    // Smoke test
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
    },
    // Load test
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '3m', target: 100 },
        { duration: '1m', target: 200 },
        { duration: '3m', target: 200 },
        { duration: '1m', target: 0 },
      ],
      startTime: '1m',
    },
    // Stress test
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 300 },
        { duration: '2m', target: 500 },
        { duration: '1m', target: 0 },
      ],
      startTime: '10m',
    },
  },
  thresholds: {
    // General API SLOs
    'challenges_duration': ['p(95)<200', 'p(99)<500'],
    'leaderboard_duration': ['p(95)<300', 'p(99)<600'],
    'tournaments_duration': ['p(95)<200', 'p(99)<500'],
    'credits_duration': ['p(95)<200', 'p(99)<400'],
    'rewards_duration': ['p(95)<200', 'p(99)<500'],
    'errors': ['rate<0.001'], // 99.9% success rate
    'http_req_failed': ['rate<0.01'],
    'http_req_duration': ['p(95)<200'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

function generateUserId() {
  return `test-user-${randomString(8)}-${Date.now()}`;
}

export function setup() {
  // Verify API is reachable
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error(`API not reachable: ${res.status}`);
  }

  return {};
}

export default function () {
  const userId = generateUserId();
  const headers = {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
  };

  // Test Challenges endpoints
  group('Challenges API', () => {
    const res = http.get(`${BASE_URL}/api/challenges?page=1&limit=20`, { headers });
    challengesDuration.add(res.timings.duration);
    requestsTotal.add(1);

    const passed = check(res, {
      'challenges status 200': (r) => r.status === 200,
      'challenges response time < 200ms': (r) => r.timings.duration < 200,
      'challenges has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });

    if (!passed) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  sleep(randomIntBetween(1, 3) / 10);

  // Test Leaderboard/Rankings endpoints
  group('Leaderboard API', () => {
    const res = http.get(`${BASE_URL}/api/ratings/leaderboard?page=1&limit=50`, { headers });
    leaderboardDuration.add(res.timings.duration);
    requestsTotal.add(1);

    const passed = check(res, {
      'leaderboard status 200': (r) => r.status === 200,
      'leaderboard response time < 300ms': (r) => r.timings.duration < 300,
    });

    if (!passed) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  sleep(randomIntBetween(1, 3) / 10);

  // Test Tournaments endpoints
  group('Tournaments API', () => {
    const res = http.get(`${BASE_URL}/api/tournaments?page=1&limit=20`, { headers });
    tournamentsDuration.add(res.timings.duration);
    requestsTotal.add(1);

    const passed = check(res, {
      'tournaments status 200': (r) => r.status === 200,
      'tournaments response time < 200ms': (r) => r.timings.duration < 200,
    });

    if (!passed) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  sleep(randomIntBetween(1, 3) / 10);

  // Test Credits/Wallet endpoints
  group('Credits API', () => {
    const res = http.get(`${BASE_URL}/api/credits/balance`, { headers });
    creditsDuration.add(res.timings.duration);
    requestsTotal.add(1);

    const passed = check(res, {
      'credits status 200 or 401/403': (r) => [200, 401, 403].includes(r.status),
      'credits response time < 200ms': (r) => r.timings.duration < 200,
    });

    if (!passed) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  sleep(randomIntBetween(1, 3) / 10);

  // Test Rewards endpoints
  group('Rewards API', () => {
    const res = http.get(`${BASE_URL}/api/rewards/partners`, { headers });
    rewardsDuration.add(res.timings.duration);
    requestsTotal.add(1);

    const passed = check(res, {
      'rewards status 200': (r) => r.status === 200,
      'rewards response time < 200ms': (r) => r.timings.duration < 200,
    });

    if (!passed) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  sleep(randomIntBetween(2, 5) / 10);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'load-tests/results/api-general-summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const { metrics } = data;

  let output = '\n=== General API Load Test Summary ===\n\n';

  const endpoints = [
    { name: 'Challenges', metric: 'challenges_duration' },
    { name: 'Leaderboard', metric: 'leaderboard_duration' },
    { name: 'Tournaments', metric: 'tournaments_duration' },
    { name: 'Credits', metric: 'credits_duration' },
    { name: 'Rewards', metric: 'rewards_duration' },
  ];

  endpoints.forEach(({ name, metric }) => {
    if (metrics[metric]) {
      output += `${name}:\n`;
      output += `  p50: ${metrics[metric].values['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
      output += `  p95: ${metrics[metric].values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
      output += `  p99: ${metrics[metric].values['p(99)']?.toFixed(2) || 'N/A'}ms\n\n`;
    }
  });

  if (metrics.errors) {
    output += `Error Rate: ${(metrics.errors.values.rate * 100).toFixed(4)}%\n`;
  }

  if (metrics.requests_total) {
    output += `Total Endpoint Requests: ${metrics.requests_total.values.count}\n`;
  }

  output += `Total HTTP Requests: ${metrics.http_reqs?.values?.count || 'N/A'}\n`;

  return output;
}
