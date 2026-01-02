/**
 * Alerting Integration for RepoRivals
 *
 * Supports PagerDuty and Opsgenie for on-call alerting.
 * Includes:
 * - Alert rules for SLO breaches
 * - Runbook links in alert metadata
 * - Escalation policies
 * - Test alert functionality
 */

import { env } from './env';
import { logger } from './logger';

// ============================================================================
// Types
// ============================================================================

export type AlertSeverity = 'critical' | 'error' | 'warning' | 'info';
export type AlertProvider = 'pagerduty' | 'opsgenie' | 'none';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  threshold: number;
  severity: AlertSeverity;
  runbookUrl: string;
  evaluationInterval: number; // seconds
  forDuration: number; // seconds to wait before alerting
  labels: Record<string, string>;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  description: string;
  severity: AlertSeverity;
  source: string;
  timestamp: Date;
  runbookUrl: string;
  labels: Record<string, string>;
  details: Record<string, any>;
}

export interface AlertingConfig {
  provider: AlertProvider;
  pagerduty?: {
    routingKey: string;
    apiUrl: string;
  };
  opsgenie?: {
    apiKey: string;
    apiUrl: string;
    responders?: Array<{
      type: 'team' | 'user' | 'escalation' | 'schedule';
      id?: string;
      name?: string;
    }>;
  };
  defaultRunbookBaseUrl: string;
  escalationTimeoutMinutes: number;
  enabled: boolean;
}

interface PagerDutyEvent {
  routing_key: string;
  event_action: 'trigger' | 'acknowledge' | 'resolve';
  dedup_key?: string;
  payload: {
    summary: string;
    source: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    timestamp: string;
    component?: string;
    group?: string;
    class?: string;
    custom_details?: Record<string, any>;
  };
  links?: Array<{ href: string; text: string }>;
  images?: Array<{ src: string; href?: string; alt?: string }>;
}

interface OpsgenieAlert {
  message: string;
  description?: string;
  responders?: Array<{
    type: 'team' | 'user' | 'escalation' | 'schedule';
    id?: string;
    name?: string;
  }>;
  visibleTo?: Array<{ type: 'team' | 'user'; id?: string; name?: string }>;
  alias?: string;
  tags?: string[];
  details?: Record<string, string>;
  entity?: string;
  source?: string;
  priority?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  note?: string;
}

// ============================================================================
// Configuration
// ============================================================================

function getAlertingConfig(): AlertingConfig {
  const provider = (process.env.ALERTING_PROVIDER as AlertProvider) || 'none';

  return {
    provider,
    pagerduty:
      provider === 'pagerduty'
        ? {
            routingKey: process.env.PAGERDUTY_ROUTING_KEY || '',
            apiUrl:
              process.env.PAGERDUTY_API_URL ||
              'https://events.pagerduty.com/v2/enqueue',
          }
        : undefined,
    opsgenie:
      provider === 'opsgenie'
        ? {
            apiKey: process.env.OPSGENIE_API_KEY || '',
            apiUrl:
              process.env.OPSGENIE_API_URL ||
              'https://api.opsgenie.com/v2/alerts',
            responders: parseOpsgenieResponders(),
          }
        : undefined,
    defaultRunbookBaseUrl:
      process.env.RUNBOOK_BASE_URL ||
      'https://docs.reporivals.com/runbooks',
    escalationTimeoutMinutes: parseInt(
      process.env.ESCALATION_TIMEOUT_MINUTES || '15',
      10
    ),
    enabled: process.env.ALERTING_ENABLED === 'true',
  };
}

function parseOpsgenieResponders(): Array<{
  type: 'team' | 'user' | 'escalation' | 'schedule';
  id?: string;
  name?: string;
}> {
  const respondersJson = process.env.OPSGENIE_RESPONDERS;
  if (!respondersJson) return [];

  try {
    return JSON.parse(respondersJson);
  } catch {
    logger.warn('Failed to parse OPSGENIE_RESPONDERS, using empty array');
    return [];
  }
}

// ============================================================================
// Alert Rules - SLO Breach Detection
// ============================================================================

/**
 * Predefined alert rules for SLO breaches
 */
export const alertRules: AlertRule[] = [
  {
    id: 'match-start-success-low',
    name: 'Match Start Success Rate Below SLO',
    description:
      'Match start success rate has dropped below 99.9% threshold',
    condition:
      'sum(rate(reporivals_match_start_total{status="success"}[5m])) / sum(rate(reporivals_match_start_total[5m])) < 0.999',
    threshold: 0.999,
    severity: 'critical',
    runbookUrl: '/match-start-failures',
    evaluationInterval: 60,
    forDuration: 300, // 5 minutes
    labels: {
      service: 'reporivals',
      component: 'matchmaking',
      slo: 'match_start_success',
    },
  },
  {
    id: 'judging-latency-high',
    name: 'Judging Latency Above SLO',
    description:
      'Judging p95 latency has exceeded 5 minute threshold',
    condition:
      'histogram_quantile(0.95, sum(rate(reporivals_judging_duration_seconds_bucket[10m])) by (le)) > 300',
    threshold: 300, // 5 minutes in seconds
    severity: 'critical',
    runbookUrl: '/judging-latency',
    evaluationInterval: 60,
    forDuration: 300,
    labels: {
      service: 'reporivals',
      component: 'judging',
      slo: 'judging_latency_p95',
    },
  },
  {
    id: 'upload-success-low',
    name: 'Upload Success Rate Below Threshold',
    description:
      'Submission upload success rate has dropped below 99% threshold',
    condition:
      'sum(rate(reporivals_upload_total{status="success"}[5m])) / sum(rate(reporivals_upload_total[5m])) < 0.99',
    threshold: 0.99,
    severity: 'error',
    runbookUrl: '/upload-failures',
    evaluationInterval: 60,
    forDuration: 300,
    labels: {
      service: 'reporivals',
      component: 'submissions',
      slo: 'upload_success',
    },
  },
  {
    id: 'payment-failures',
    name: 'Payment Failure Rate High',
    description:
      'Payment failure rate has exceeded acceptable threshold',
    condition:
      'sum(rate(reporivals_payment_total{status="failure"}[5m])) / sum(rate(reporivals_payment_total[5m])) > 0.05',
    threshold: 0.05, // 5% failure rate
    severity: 'critical',
    runbookUrl: '/payment-failures',
    evaluationInterval: 60,
    forDuration: 180, // 3 minutes
    labels: {
      service: 'reporivals',
      component: 'payments',
      slo: 'payment_success',
    },
  },
  {
    id: 'judging-queue-backlog',
    name: 'Judging Queue Backlog',
    description:
      'Judging queue has grown beyond acceptable threshold',
    condition: 'reporivals_judging_queue_size > 100',
    threshold: 100,
    severity: 'warning',
    runbookUrl: '/judging-queue-backlog',
    evaluationInterval: 60,
    forDuration: 600, // 10 minutes
    labels: {
      service: 'reporivals',
      component: 'judging',
      slo: 'queue_size',
    },
  },
  {
    id: 'api-error-rate-high',
    name: 'API Error Rate High',
    description:
      'API 5xx error rate has exceeded acceptable threshold',
    condition:
      'sum(rate(reporivals_http_request_total{status_code=~"5.."}[5m])) / sum(rate(reporivals_http_request_total[5m])) > 0.01',
    threshold: 0.01, // 1% error rate
    severity: 'error',
    runbookUrl: '/api-errors',
    evaluationInterval: 60,
    forDuration: 300,
    labels: {
      service: 'reporivals',
      component: 'api',
      slo: 'error_rate',
    },
  },
  {
    id: 'active-matches-high',
    name: 'Active Matches Near Capacity',
    description:
      'Number of active matches is approaching system capacity',
    condition: 'reporivals_active_matches > 500',
    threshold: 500,
    severity: 'warning',
    runbookUrl: '/capacity-planning',
    evaluationInterval: 60,
    forDuration: 300,
    labels: {
      service: 'reporivals',
      component: 'matchmaking',
      slo: 'capacity',
    },
  },
  {
    id: 'websocket-connections-high',
    name: 'WebSocket Connections Near Limit',
    description:
      'Number of WebSocket connections is approaching limit',
    condition: 'reporivals_websocket_connections_active > 10000',
    threshold: 10000,
    severity: 'warning',
    runbookUrl: '/websocket-scaling',
    evaluationInterval: 60,
    forDuration: 300,
    labels: {
      service: 'reporivals',
      component: 'realtime',
      slo: 'connections',
    },
  },
];

// ============================================================================
// Alerting Service
// ============================================================================

class AlertingService {
  private config: AlertingConfig;

  constructor() {
    this.config = getAlertingConfig();
  }

  /**
   * Send an alert to the configured provider
   */
  async sendAlert(alert: Alert): Promise<boolean> {
    if (!this.config.enabled) {
      logger.info({ alert }, 'Alerting disabled, skipping alert');
      return true;
    }

    const fullRunbookUrl = this.buildRunbookUrl(alert.runbookUrl);
    const alertWithFullRunbook = { ...alert, runbookUrl: fullRunbookUrl };

    switch (this.config.provider) {
      case 'pagerduty':
        return this.sendPagerDutyAlert(alertWithFullRunbook);
      case 'opsgenie':
        return this.sendOpsgenieAlert(alertWithFullRunbook);
      case 'none':
      default:
        logger.info({ alert: alertWithFullRunbook }, 'No alerting provider configured');
        return true;
    }
  }

  /**
   * Resolve an existing alert
   */
  async resolveAlert(alertId: string, ruleId: string): Promise<boolean> {
    if (!this.config.enabled) {
      return true;
    }

    switch (this.config.provider) {
      case 'pagerduty':
        return this.resolvePagerDutyAlert(alertId, ruleId);
      case 'opsgenie':
        return this.resolveOpsgenieAlert(alertId);
      case 'none':
      default:
        return true;
    }
  }

  /**
   * Send a test alert to verify configuration
   */
  async sendTestAlert(): Promise<{ success: boolean; message: string }> {
    const testAlert: Alert = {
      id: `test-${Date.now()}`,
      ruleId: 'test-alert',
      ruleName: 'Test Alert',
      description: 'This is a test alert to verify alerting configuration',
      severity: 'info',
      source: 'reporivals-api-test',
      timestamp: new Date(),
      runbookUrl: '/test-alerts',
      labels: {
        service: 'reporivals',
        environment: env.NODE_ENV,
        test: 'true',
      },
      details: {
        triggeredBy: 'manual-test',
        timestamp: new Date().toISOString(),
      },
    };

    try {
      const success = await this.sendAlert(testAlert);

      if (success) {
        // Auto-resolve test alert after 5 seconds
        setTimeout(async () => {
          await this.resolveAlert(testAlert.id, testAlert.ruleId);
        }, 5000);
      }

      return {
        success,
        message: success
          ? `Test alert sent successfully to ${this.config.provider}`
          : 'Failed to send test alert',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Error sending test alert: ${message}` };
    }
  }

  /**
   * Get all configured alert rules
   */
  getAlertRules(): AlertRule[] {
    return alertRules;
  }

  /**
   * Get alerting configuration (with secrets redacted)
   */
  getConfig(): Omit<AlertingConfig, 'pagerduty' | 'opsgenie'> & {
    pagerduty?: { configured: boolean };
    opsgenie?: { configured: boolean };
  } {
    return {
      provider: this.config.provider,
      defaultRunbookBaseUrl: this.config.defaultRunbookBaseUrl,
      escalationTimeoutMinutes: this.config.escalationTimeoutMinutes,
      enabled: this.config.enabled,
      pagerduty: this.config.pagerduty
        ? { configured: !!this.config.pagerduty.routingKey }
        : undefined,
      opsgenie: this.config.opsgenie
        ? { configured: !!this.config.opsgenie.apiKey }
        : undefined,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private buildRunbookUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    return `${this.config.defaultRunbookBaseUrl}${path}`;
  }

  private mapSeverityToPagerDuty(severity: AlertSeverity): 'critical' | 'error' | 'warning' | 'info' {
    return severity;
  }

  private mapSeverityToOpsgeniePriority(severity: AlertSeverity): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' {
    switch (severity) {
      case 'critical':
        return 'P1';
      case 'error':
        return 'P2';
      case 'warning':
        return 'P3';
      case 'info':
        return 'P5';
      default:
        return 'P3';
    }
  }

  private async sendPagerDutyAlert(alert: Alert): Promise<boolean> {
    if (!this.config.pagerduty?.routingKey) {
      logger.error('PagerDuty routing key not configured');
      return false;
    }

    const event: PagerDutyEvent = {
      routing_key: this.config.pagerduty.routingKey,
      event_action: 'trigger',
      dedup_key: `${alert.ruleId}-${alert.id}`,
      payload: {
        summary: `[${alert.severity.toUpperCase()}] ${alert.ruleName}: ${alert.description}`,
        source: alert.source,
        severity: this.mapSeverityToPagerDuty(alert.severity),
        timestamp: alert.timestamp.toISOString(),
        component: alert.labels.component,
        group: alert.labels.service,
        class: alert.ruleId,
        custom_details: {
          ...alert.details,
          labels: alert.labels,
          environment: env.NODE_ENV,
        },
      },
      links: [
        {
          href: alert.runbookUrl,
          text: 'Runbook',
        },
      ],
    };

    try {
      const response = await fetch(this.config.pagerduty.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text }, 'PagerDuty API error');
        return false;
      }

      const result = await response.json();
      logger.info(
        { alertId: alert.id, dedupKey: event.dedup_key, result },
        'PagerDuty alert sent'
      );
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to send PagerDuty alert');
      return false;
    }
  }

  private async resolvePagerDutyAlert(alertId: string, ruleId: string): Promise<boolean> {
    if (!this.config.pagerduty?.routingKey) {
      return false;
    }

    const event: PagerDutyEvent = {
      routing_key: this.config.pagerduty.routingKey,
      event_action: 'resolve',
      dedup_key: `${ruleId}-${alertId}`,
      payload: {
        summary: 'Alert resolved',
        source: 'reporivals-api',
        severity: 'info',
        timestamp: new Date().toISOString(),
      },
    };

    try {
      const response = await fetch(this.config.pagerduty.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      return response.ok;
    } catch (error) {
      logger.error({ error }, 'Failed to resolve PagerDuty alert');
      return false;
    }
  }

  private async sendOpsgenieAlert(alert: Alert): Promise<boolean> {
    if (!this.config.opsgenie?.apiKey) {
      logger.error('Opsgenie API key not configured');
      return false;
    }

    const opsgenieAlert: OpsgenieAlert = {
      message: `[${alert.severity.toUpperCase()}] ${alert.ruleName}`,
      description: `${alert.description}\n\nRunbook: ${alert.runbookUrl}`,
      alias: `${alert.ruleId}-${alert.id}`,
      source: alert.source,
      priority: this.mapSeverityToOpsgeniePriority(alert.severity),
      tags: [
        alert.severity,
        alert.labels.component || '',
        alert.labels.service || '',
        env.NODE_ENV,
      ].filter(Boolean),
      details: {
        ruleId: alert.ruleId,
        runbookUrl: alert.runbookUrl,
        environment: env.NODE_ENV,
        ...Object.entries(alert.labels).reduce(
          (acc, [k, v]) => ({ ...acc, [`label_${k}`]: v }),
          {}
        ),
        ...Object.entries(alert.details).reduce(
          (acc, [k, v]) => ({ ...acc, [k]: String(v) }),
          {}
        ),
      },
      responders: this.config.opsgenie.responders,
      note: `Triggered at ${alert.timestamp.toISOString()}`,
    };

    try {
      const response = await fetch(this.config.opsgenie.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `GenieKey ${this.config.opsgenie.apiKey}`,
        },
        body: JSON.stringify(opsgenieAlert),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text }, 'Opsgenie API error');
        return false;
      }

      const result = await response.json();
      logger.info(
        { alertId: alert.id, alias: opsgenieAlert.alias, result },
        'Opsgenie alert sent'
      );
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to send Opsgenie alert');
      return false;
    }
  }

  private async resolveOpsgenieAlert(alertId: string): Promise<boolean> {
    if (!this.config.opsgenie?.apiKey) {
      return false;
    }

    const closeUrl = `${this.config.opsgenie.apiUrl}/${alertId}/close?identifierType=alias`;

    try {
      const response = await fetch(closeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `GenieKey ${this.config.opsgenie.apiKey}`,
        },
        body: JSON.stringify({
          source: 'reporivals-api',
          note: 'Alert auto-resolved',
        }),
      });

      return response.ok;
    } catch (error) {
      logger.error({ error }, 'Failed to resolve Opsgenie alert');
      return false;
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export const alertingService = new AlertingService();

/**
 * Create and send an SLO breach alert
 */
export async function sendSLOBreachAlert(
  ruleId: string,
  currentValue: number,
  additionalDetails?: Record<string, any>
): Promise<boolean> {
  const rule = alertRules.find((r) => r.id === ruleId);
  if (!rule) {
    logger.error({ ruleId }, 'Unknown alert rule');
    return false;
  }

  const alert: Alert = {
    id: `${ruleId}-${Date.now()}`,
    ruleId: rule.id,
    ruleName: rule.name,
    description: rule.description,
    severity: rule.severity,
    source: 'reporivals-api',
    timestamp: new Date(),
    runbookUrl: rule.runbookUrl,
    labels: rule.labels,
    details: {
      threshold: rule.threshold,
      currentValue,
      condition: rule.condition,
      ...additionalDetails,
    },
  };

  return alertingService.sendAlert(alert);
}

/**
 * Send a custom alert
 */
export async function sendCustomAlert(
  severity: AlertSeverity,
  title: string,
  description: string,
  runbookPath: string,
  details?: Record<string, any>
): Promise<boolean> {
  const alert: Alert = {
    id: `custom-${Date.now()}`,
    ruleId: 'custom-alert',
    ruleName: title,
    description,
    severity,
    source: 'reporivals-api',
    timestamp: new Date(),
    runbookUrl: runbookPath,
    labels: {
      service: 'reporivals',
      type: 'custom',
    },
    details: details || {},
  };

  return alertingService.sendAlert(alert);
}
