import * as vscode from 'vscode';

/**
 * Telemetry service for RepoRivals VS Code extension
 *
 * Implements opt-in telemetry following VS Code guidelines:
 * - Respects VS Code's global telemetry setting
 * - Provides extension-specific opt-in setting
 * - Only collects anonymous, aggregate data
 * - Never collects code, file contents, or personal information
 */

export interface TelemetryEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
  measurements?: Record<string, number>;
}

export interface ErrorReport {
  error: Error;
  context?: string;
  metadata?: Record<string, string>;
}

// Telemetry event names
export const TelemetryEvents = {
  // Extension lifecycle
  EXTENSION_ACTIVATED: 'extension/activated',
  EXTENSION_DEACTIVATED: 'extension/deactivated',

  // Authentication
  AUTH_SIGN_IN_STARTED: 'auth/signIn/started',
  AUTH_SIGN_IN_SUCCESS: 'auth/signIn/success',
  AUTH_SIGN_IN_FAILED: 'auth/signIn/failed',
  AUTH_SIGN_OUT: 'auth/signOut',

  // Challenges
  CHALLENGES_VIEWED: 'challenges/viewed',
  CHALLENGE_SELECTED: 'challenge/selected',

  // Match
  MATCH_JOINED: 'match/joined',
  MATCH_READY: 'match/ready',
  MATCH_FORFEITED: 'match/forfeited',
  MATCH_COMPLETED: 'match/completed',

  // Submission
  SUBMISSION_STARTED: 'submission/started',
  SUBMISSION_SUCCESS: 'submission/success',
  SUBMISSION_FAILED: 'submission/failed',
  SUBMISSION_LOCKED: 'submission/locked',

  // UI
  PANEL_OPENED: 'panel/opened',
  COMMAND_EXECUTED: 'command/executed',
} as const;

class TelemetryService {
  private static instance: TelemetryService;
  private enabled: boolean = false;
  private sentryDsn: string | undefined;
  private extensionVersion: string = '0.0.0';
  private sessionId: string;
  private userId: string | undefined;

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.loadSettings();
  }

  static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Initialize telemetry service
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.extensionVersion = context.extension.packageJSON.version;

    // Watch for setting changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('reporivals.telemetry') ||
            e.affectsConfiguration('telemetry')) {
          this.loadSettings();
        }
      })
    );

    // Initialize Sentry if enabled and DSN is available
    if (this.enabled && this.sentryDsn) {
      await this.initializeSentry();
    }

    console.log(`[Telemetry] Initialized (enabled: ${this.enabled})`);
  }

  /**
   * Load telemetry settings
   */
  private loadSettings(): void {
    const config = vscode.workspace.getConfiguration('reporivals');

    // Check VS Code's global telemetry setting first
    const vscodeTelemetry = vscode.workspace.getConfiguration('telemetry');
    const globalTelemetryEnabled = vscodeTelemetry.get<string>('telemetryLevel', 'all') !== 'off';

    // Extension-specific opt-in
    const extensionTelemetryEnabled = config.get<boolean>('telemetry.enabled', false);

    // Both must be enabled for telemetry to work
    this.enabled = globalTelemetryEnabled && extensionTelemetryEnabled;

    // Get Sentry DSN (only used if telemetry is enabled)
    this.sentryDsn = config.get<string>('telemetry.sentryDsn');
  }

  /**
   * Initialize Sentry error reporting
   */
  private async initializeSentry(): Promise<void> {
    if (!this.sentryDsn) {
      return;
    }

    try {
      // Note: In a real implementation, you would use @sentry/node
      // For now, we'll just log that Sentry would be initialized
      console.log('[Telemetry] Sentry error reporting initialized');

      // Sentry.init({
      //   dsn: this.sentryDsn,
      //   environment: process.env.NODE_ENV || 'production',
      //   release: `reporivals-extension@${this.extensionVersion}`,
      //   beforeSend: (event) => {
      //     // Strip any PII from error reports
      //     return this.sanitizeEvent(event);
      //   },
      // });
    } catch (error) {
      console.error('[Telemetry] Failed to initialize Sentry:', error);
    }
  }

  /**
   * Track a telemetry event
   */
  trackEvent(event: TelemetryEvent): void {
    if (!this.enabled) {
      return;
    }

    const enrichedEvent = {
      ...event,
      properties: {
        ...event.properties,
        extensionVersion: this.extensionVersion,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        vscodeVersion: vscode.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    // In production, this would send to analytics backend
    console.log('[Telemetry] Event:', enrichedEvent.name, enrichedEvent.properties);
  }

  /**
   * Report an error to Sentry
   */
  reportError(report: ErrorReport): void {
    if (!this.enabled) {
      return;
    }

    const enrichedReport = {
      error: report.error,
      context: report.context,
      metadata: {
        ...report.metadata,
        extensionVersion: this.extensionVersion,
        sessionId: this.sessionId,
        vscodeVersion: vscode.version,
        platform: process.platform,
      },
    };

    // In production, this would send to Sentry
    // Sentry.captureException(report.error, {
    //   tags: { context: report.context },
    //   extra: enrichedReport.metadata,
    // });

    console.error('[Telemetry] Error:', enrichedReport);
  }

  /**
   * Set the user ID for telemetry (anonymous hash)
   */
  setUserId(userId: string): void {
    // Hash the user ID for privacy
    this.userId = this.hashString(userId);
  }

  /**
   * Clear user data (on sign out)
   */
  clearUser(): void {
    this.userId = undefined;
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate a random session ID
   */
  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Hash a string for privacy (simple FNV-1a hash)
   */
  private hashString(str: string): string {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  /**
   * Shutdown telemetry service
   */
  async shutdown(): Promise<void> {
    if (this.enabled) {
      this.trackEvent({
        name: TelemetryEvents.EXTENSION_DEACTIVATED,
      });
    }

    // Flush any pending events
    // await Sentry.close(2000);

    console.log('[Telemetry] Shutdown complete');
  }
}

// Export singleton instance
export const telemetry = TelemetryService.getInstance();

// Helper functions for common events
export function trackExtensionActivated(): void {
  telemetry.trackEvent({
    name: TelemetryEvents.EXTENSION_ACTIVATED,
    properties: {
      activationKind: 'startup',
    },
  });
}

export function trackCommandExecuted(command: string): void {
  telemetry.trackEvent({
    name: TelemetryEvents.COMMAND_EXECUTED,
    properties: { command },
  });
}

export function trackAuthEvent(event: 'started' | 'success' | 'failed'): void {
  const eventMap = {
    started: TelemetryEvents.AUTH_SIGN_IN_STARTED,
    success: TelemetryEvents.AUTH_SIGN_IN_SUCCESS,
    failed: TelemetryEvents.AUTH_SIGN_IN_FAILED,
  };
  telemetry.trackEvent({ name: eventMap[event] });
}

export function trackMatchEvent(
  event: 'joined' | 'ready' | 'forfeited' | 'completed',
  matchId?: string
): void {
  const eventMap = {
    joined: TelemetryEvents.MATCH_JOINED,
    ready: TelemetryEvents.MATCH_READY,
    forfeited: TelemetryEvents.MATCH_FORFEITED,
    completed: TelemetryEvents.MATCH_COMPLETED,
  };
  telemetry.trackEvent({
    name: eventMap[event],
    properties: matchId ? { matchId: telemetry['hashString'](matchId) } : undefined,
  });
}

export function trackSubmissionEvent(
  event: 'started' | 'success' | 'failed' | 'locked',
  measurements?: { durationMs?: number; sizeBytes?: number }
): void {
  const eventMap = {
    started: TelemetryEvents.SUBMISSION_STARTED,
    success: TelemetryEvents.SUBMISSION_SUCCESS,
    failed: TelemetryEvents.SUBMISSION_FAILED,
    locked: TelemetryEvents.SUBMISSION_LOCKED,
  };
  telemetry.trackEvent({
    name: eventMap[event],
    measurements,
  });
}

export function reportError(error: Error, context?: string): void {
  telemetry.reportError({ error, context });
}
