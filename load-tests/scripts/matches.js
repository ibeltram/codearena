/**
 * Match Operations Load Test
 *
 * Tests match creation, joining, and lifecycle operations under concurrent load.
 * This is a critical path that must handle high concurrency during peak times.
 *
 * SLOs:
 * - Match creation p95 < 500ms
 * - Match join p95 < 300ms
 * - Match list p95 < 200ms
 * - Success rate > 99.9%
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const matchCreateDuration = new Trend('match_create_duration', true);
const matchListDuration = new Trend('match_list_duration', true);
const matchGetDuration = new Trend('match_get_duration', true);
const queueJoinDuration = new Trend('queue_join_duration', true);
const matchesCreated = new Counter('matches_created');
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  scenarios: {
    // Simulate 1000 concurrent match starts (as per spec)
    match_start_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 500 },
        { duration: '30s', target: 1000 },
        { duration: '2m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
    // Constant load for steady state
    steady_state: {
      executor: 'constant-vus',
      vus: 200,
      duration: '5m',
      startTime: '5m',
    },
  },
  thresholds: {
    // Match operation SLOs
    'match_create_duration': ['p(95)<500', 'p(99)<1000'],
    'match_list_duration': ['p(95)<200', 'p(99)<400'],
    'match_get_duration': ['p(95)<100', 'p(99)<200'],
    'queue_join_duration': ['p(95)<500', 'p(99)<1000'],
    'errors': ['rate<0.001'], // 99.9% success rate
    'http_req_failed': ['rate<0.01'],
    'http_req_duration': ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Simulated user IDs for testing
function generateUserId() {
  return `test-user-${randomString(8)}-${Date.now()}`;
}

// Challenge version ID (would be pre-seeded in test environment)
const TEST_CHALLENGE_VERSION_ID = __ENV.CHALLENGE_VERSION_ID || '00000000-0000-0000-0000-000000000001';

export function setup() {
  // Verify API is reachable
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error(`API not reachable: ${res.status}`);
  }

  return {
    challengeVersionId: TEST_CHALLENGE_VERSION_ID,
  };
}

export default function (data) {
  const userId = generateUserId();
  const headers = {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
  };

  group('Match List Operations', () => {
    // Test listing matches
    const listRes = http.get(`${BASE_URL}/api/matches?page=1&limit=20`, { headers });
    matchListDuration.add(listRes.timings.duration);

    const listCheck = check(listRes, {
      'list matches status 200': (r) => r.status === 200,
      'list matches has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
      'list matches response time < 200ms': (r) => r.timings.duration < 200,
    });

    if (!listCheck) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  sleep(randomIntBetween(1, 3) / 10);

  group('Match Create Operations', () => {
    // Test creating a match
    const createPayload = JSON.stringify({
      challengeVersionId: data.challengeVersionId,
      mode: 'invite',
      stakeAmount: 0,
      durationMinutes: 30,
    });

    const createRes = http.post(`${BASE_URL}/api/matches`, createPayload, { headers });
    matchCreateDuration.add(createRes.timings.duration);

    const createCheck = check(createRes, {
      'create match status 201 or 400/404': (r) => [201, 400, 404, 422, 403].includes(r.status),
      'create match response time < 500ms': (r) => r.timings.duration < 500,
    });

    if (createRes.status === 201) {
      matchesCreated.add(1);
      errorRate.add(0);

      // Get the created match
      try {
        const body = JSON.parse(createRes.body);
        if (body.id) {
          const getRes = http.get(`${BASE_URL}/api/matches/${body.id}`, { headers });
          matchGetDuration.add(getRes.timings.duration);

          check(getRes, {
            'get match status 200': (r) => r.status === 200,
            'get match response time < 100ms': (r) => r.timings.duration < 100,
          });
        }
      } catch {
        // Ignore parse errors
      }
    } else if (!createCheck) {
      errorRate.add(1);
    }
  });

  sleep(randomIntBetween(1, 3) / 10);

  group('Queue Operations', () => {
    // Test joining matchmaking queue
    const queuePayload = JSON.stringify({
      category: 'frontend',
      difficulty: 'intermediate',
      stakeAmount: 0,
    });

    const queueRes = http.post(`${BASE_URL}/api/matches/queue`, queuePayload, { headers });
    queueJoinDuration.add(queueRes.timings.duration);

    const queueCheck = check(queueRes, {
      'queue join status 200/202 or conflict': (r) => [200, 202, 409, 403, 422].includes(r.status),
      'queue join response time < 500ms': (r) => r.timings.duration < 500,
    });

    if ([200, 202].includes(queueRes.status)) {
      errorRate.add(0);

      // Leave queue after joining
      sleep(0.5);
      http.del(`${BASE_URL}/api/matches/queue`, { headers });
    } else if (!queueCheck) {
      errorRate.add(1);
    }
  });

  sleep(randomIntBetween(5, 10) / 10);
}

export function teardown(data) {
  console.log(`Test completed. Matches created: ${matchesCreated}`);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'load-tests/results/matches-summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const { metrics } = data;

  let output = '\n=== Match Operations Load Test Summary ===\n\n';

  output += 'Match Creation:\n';
  if (metrics.match_create_duration) {
    output += `  p50: ${metrics.match_create_duration.values['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `  p95: ${metrics.match_create_duration.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `  p99: ${metrics.match_create_duration.values['p(99)']?.toFixed(2) || 'N/A'}ms\n\n`;
  }

  output += 'Match List:\n';
  if (metrics.match_list_duration) {
    output += `  p50: ${metrics.match_list_duration.values['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `  p95: ${metrics.match_list_duration.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `  p99: ${metrics.match_list_duration.values['p(99)']?.toFixed(2) || 'N/A'}ms\n\n`;
  }

  output += 'Queue Join:\n';
  if (metrics.queue_join_duration) {
    output += `  p50: ${metrics.queue_join_duration.values['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `  p95: ${metrics.queue_join_duration.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `  p99: ${metrics.queue_join_duration.values['p(99)']?.toFixed(2) || 'N/A'}ms\n\n`;
  }

  if (metrics.errors) {
    output += `Error Rate: ${(metrics.errors.values.rate * 100).toFixed(4)}%\n`;
  }

  if (metrics.matches_created) {
    output += `Matches Created: ${metrics.matches_created.values.count}\n`;
  }

  output += `Total Requests: ${metrics.http_reqs?.values?.count || 'N/A'}\n`;

  return output;
}
