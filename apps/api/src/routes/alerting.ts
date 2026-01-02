/**
 * Alerting API Routes
 *
 * Provides endpoints for:
 * - Testing alert configuration
 * - Viewing alert rules
 * - Getting alerting status
 * - Triggering manual alerts (admin only)
 */

import { FastifyInstance } from 'fastify';

import {
  alertingService,
  alertRules,
  sendCustomAlert,
  sendSLOBreachAlert,
  AlertSeverity,
} from '../lib/alerting';

export async function alertingRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/alerting/config
   *
   * Get current alerting configuration (secrets redacted)
   */
  app.get('/api/admin/alerting/config', async (request, reply) => {
    // TODO: Add admin authentication
    const config = alertingService.getConfig();

    return {
      ...config,
      rulesCount: alertRules.length,
    };
  });

  /**
   * GET /api/admin/alerting/rules
   *
   * Get all configured alert rules
   */
  app.get('/api/admin/alerting/rules', async () => {
    return {
      rules: alertRules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        severity: rule.severity,
        threshold: rule.threshold,
        condition: rule.condition,
        evaluationInterval: rule.evaluationInterval,
        forDuration: rule.forDuration,
        runbookUrl: rule.runbookUrl,
        labels: rule.labels,
      })),
      totalRules: alertRules.length,
      criticalRules: alertRules.filter((r) => r.severity === 'critical').length,
      warningRules: alertRules.filter((r) => r.severity === 'warning').length,
    };
  });

  /**
   * POST /api/admin/alerting/test
   *
   * Send a test alert to verify configuration
   */
  app.post('/api/admin/alerting/test', async (request, reply) => {
    const result = await alertingService.sendTestAlert();

    if (result.success) {
      return {
        success: true,
        message: result.message,
        note: 'Test alert will auto-resolve in 5 seconds',
      };
    }

    reply.status(500);
    return {
      success: false,
      message: result.message,
    };
  });

  /**
   * POST /api/admin/alerting/trigger
   *
   * Manually trigger an SLO breach alert (for testing/manual intervention)
   */
  app.post<{
    Body: {
      ruleId: string;
      currentValue: number;
      details?: Record<string, any>;
    };
  }>('/api/admin/alerting/trigger', async (request, reply) => {
    const { ruleId, currentValue, details } = request.body;

    if (!ruleId) {
      reply.status(400);
      return { error: 'ruleId is required' };
    }

    const rule = alertRules.find((r) => r.id === ruleId);
    if (!rule) {
      reply.status(404);
      return {
        error: 'Rule not found',
        availableRules: alertRules.map((r) => r.id),
      };
    }

    const success = await sendSLOBreachAlert(ruleId, currentValue, details);

    if (success) {
      return {
        success: true,
        message: `Alert triggered for rule: ${rule.name}`,
        ruleId,
        severity: rule.severity,
      };
    }

    reply.status(500);
    return {
      success: false,
      message: 'Failed to trigger alert',
    };
  });

  /**
   * POST /api/admin/alerting/custom
   *
   * Send a custom alert
   */
  app.post<{
    Body: {
      severity: AlertSeverity;
      title: string;
      description: string;
      runbookPath?: string;
      details?: Record<string, any>;
    };
  }>('/api/admin/alerting/custom', async (request, reply) => {
    const { severity, title, description, runbookPath, details } = request.body;

    if (!severity || !title || !description) {
      reply.status(400);
      return { error: 'severity, title, and description are required' };
    }

    const validSeverities: AlertSeverity[] = ['critical', 'error', 'warning', 'info'];
    if (!validSeverities.includes(severity)) {
      reply.status(400);
      return {
        error: 'Invalid severity',
        validSeverities,
      };
    }

    const success = await sendCustomAlert(
      severity,
      title,
      description,
      runbookPath || '/custom-alerts',
      details
    );

    if (success) {
      return {
        success: true,
        message: 'Custom alert sent',
        severity,
        title,
      };
    }

    reply.status(500);
    return {
      success: false,
      message: 'Failed to send custom alert',
    };
  });

  /**
   * GET /api/admin/alerting/health
   *
   * Health check for alerting system
   */
  app.get('/api/admin/alerting/health', async () => {
    const config = alertingService.getConfig();

    return {
      status: 'ok',
      provider: config.provider,
      enabled: config.enabled,
      configured:
        config.provider === 'none' ||
        (config.provider === 'pagerduty' && config.pagerduty?.configured) ||
        (config.provider === 'opsgenie' && config.opsgenie?.configured),
      rulesLoaded: alertRules.length,
    };
  });
}
