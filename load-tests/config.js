/**
 * k6 Load Testing Configuration
 *
 * Central configuration for all load tests with SLO definitions.
 */

// Environment-specific configuration
export const config = {
  // API base URLs by environment
  urls: {
    local: 'http://localhost:3001',
    staging: process.env.STAGING_API_URL || 'https://api.staging.codearena.io',
    production: process.env.PRODUCTION_API_URL || 'https://api.codearena.io',
  },

  // SLO definitions
  slos: {
    // Health endpoints - must be ultra-fast
    health: {
      p95: 50,
      p99: 100,
      successRate: 0.9999, // 99.99%
    },

    // Match operations - critical path
    matchStart: {
      p95: 500,
      p99: 1000,
      successRate: 0.999, // 99.9%
    },

    // Queue operations
    queueJoin: {
      p95: 500,
      p99: 1000,
      successRate: 0.999,
    },

    // Upload operations
    uploadInit: {
      p95: 300,
      p99: 500,
      successRate: 0.995, // 99.5%
    },
    uploadComplete: {
      p95: 500,
      p99: 1000,
      successRate: 0.995,
    },

    // General API endpoints
    api: {
      p95: 200,
      p99: 500,
      successRate: 0.999,
    },

    // Leaderboard (may use materialized views)
    leaderboard: {
      p95: 300,
      p99: 600,
      successRate: 0.999,
    },
  },

  // Load scenarios
  scenarios: {
    // Smoke test - basic validation
    smoke: {
      vus: 5,
      duration: '30s',
    },

    // Load test - normal expected load
    load: {
      startVUs: 0,
      targetVUs: 200,
      rampUpDuration: '2m',
      steadyStateDuration: '5m',
      rampDownDuration: '1m',
    },

    // Stress test - beyond expected load
    stress: {
      startVUs: 0,
      targetVUs: 500,
      rampUpDuration: '2m',
      steadyStateDuration: '3m',
      rampDownDuration: '1m',
    },

    // Spike test - sudden traffic spike
    spike: {
      startVUs: 0,
      spikeVUs: 1000,
      rampUpDuration: '30s',
      spikeDuration: '2m',
      rampDownDuration: '30s',
    },

    // Soak test - extended duration
    soak: {
      vus: 100,
      duration: '30m',
    },
  },

  // Test data configuration
  testData: {
    // Pre-seeded challenge version for testing
    challengeVersionId: '00000000-0000-0000-0000-000000000001',

    // File sizes for upload tests (in KB)
    fileSizes: {
      min: 50,
      max: 5000,
    },

    // Think time ranges (in seconds)
    thinkTime: {
      min: 0.1,
      max: 1.0,
    },
  },
};

// Export thresholds helper for k6 scripts
export function getThresholds(sloName) {
  const slo = config.slos[sloName];
  if (!slo) return {};

  return {
    [`${sloName}_duration`]: [
      `p(95)<${slo.p95}`,
      `p(99)<${slo.p99}`,
    ],
    errors: [`rate<${1 - slo.successRate}`],
  };
}

// Export scenario builder
export function buildScenario(scenarioName, options = {}) {
  const scenario = config.scenarios[scenarioName];
  if (!scenario) return null;

  switch (scenarioName) {
    case 'smoke':
      return {
        executor: 'constant-vus',
        vus: options.vus || scenario.vus,
        duration: options.duration || scenario.duration,
      };

    case 'load':
      return {
        executor: 'ramping-vus',
        startVUs: scenario.startVUs,
        stages: [
          { duration: scenario.rampUpDuration, target: scenario.targetVUs },
          { duration: scenario.steadyStateDuration, target: scenario.targetVUs },
          { duration: scenario.rampDownDuration, target: 0 },
        ],
      };

    case 'stress':
      return {
        executor: 'ramping-vus',
        startVUs: scenario.startVUs,
        stages: [
          { duration: scenario.rampUpDuration, target: scenario.targetVUs },
          { duration: scenario.steadyStateDuration, target: scenario.targetVUs },
          { duration: scenario.rampDownDuration, target: 0 },
        ],
      };

    case 'spike':
      return {
        executor: 'ramping-vus',
        startVUs: scenario.startVUs,
        stages: [
          { duration: scenario.rampUpDuration, target: scenario.spikeVUs },
          { duration: scenario.spikeDuration, target: scenario.spikeVUs },
          { duration: scenario.rampDownDuration, target: 0 },
        ],
      };

    case 'soak':
      return {
        executor: 'constant-vus',
        vus: options.vus || scenario.vus,
        duration: options.duration || scenario.duration,
      };

    default:
      return null;
  }
}
