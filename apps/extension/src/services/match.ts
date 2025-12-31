import * as vscode from 'vscode';
import { Match, MatchStatus, ExtensionConfig } from '../types';

/**
 * Event types from the server
 */
interface MatchEvent {
  type: 'match_update' | 'timer_tick' | 'participant_update' | 'submission_update' | 'judging_update' | 'error';
  data: any;
}

/**
 * Service for managing active match state and real-time updates
 */
export class MatchService {
  private _onMatchUpdate = new vscode.EventEmitter<Match | null>();
  readonly onMatchUpdate = this._onMatchUpdate.event;

  private _onTimerTick = new vscode.EventEmitter<number>();
  readonly onTimerTick = this._onTimerTick.event;

  private _onConnectionStateChange = new vscode.EventEmitter<'connected' | 'disconnected' | 'reconnecting'>();
  readonly onConnectionStateChange = this._onConnectionStateChange.event;

  private eventSource: EventSource | null = null;
  private currentMatch: Match | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private getAccessToken: () => Promise<string | null>;
  private getConfig: () => ExtensionConfig;

  constructor(
    getAccessToken: () => Promise<string | null>,
    getConfig: () => ExtensionConfig
  ) {
    this.getAccessToken = getAccessToken;
    this.getConfig = getConfig;
  }

  /**
   * Join a match via API and start listening for updates
   */
  async joinMatch(challengeId: string): Promise<Match | null> {
    const token = await this.getAccessToken();
    if (!token) {
      vscode.window.showErrorMessage('CodeArena: Please sign in to join a match.');
      return null;
    }

    const config = this.getConfig();

    try {
      // First, join the match queue
      const response = await fetch(`${config.apiUrl}/api/matches/queue`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ challengeId }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const match = this.mapApiMatchToMatch(data.match || data);

      this.currentMatch = match;
      this._onMatchUpdate.fire(match);

      // Start listening for real-time updates
      await this.connectToMatchEvents(match.id);

      return match;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join match';
      vscode.window.showErrorMessage(`CodeArena: ${message}`);
      return null;
    }
  }

  /**
   * Get current match details from API
   */
  async fetchMatch(matchId: string): Promise<Match | null> {
    const token = await this.getAccessToken();
    if (!token) {
      return null;
    }

    const config = this.getConfig();

    try {
      const response = await fetch(`${config.apiUrl}/api/matches/${matchId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return this.mapApiMatchToMatch(data);
    } catch (error) {
      console.error('Failed to fetch match:', error);
      return null;
    }
  }

  /**
   * Mark player as ready
   */
  async setReady(matchId: string): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) {
      return false;
    }

    const config = this.getConfig();

    try {
      const response = await fetch(`${config.apiUrl}/api/matches/${matchId}/ready`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to set ready:', error);
      return false;
    }
  }

  /**
   * Forfeit the current match
   */
  async forfeit(matchId: string): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) {
      return false;
    }

    const config = this.getConfig();

    try {
      const response = await fetch(`${config.apiUrl}/api/matches/${matchId}/forfeit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        this.disconnect();
        this.currentMatch = null;
        this._onMatchUpdate.fire(null);
      }

      return response.ok;
    } catch (error) {
      console.error('Failed to forfeit:', error);
      return false;
    }
  }

  /**
   * Lock submission - makes it immutable and prevents further submissions
   * Returns the locked submission with timestamp, or null on failure
   */
  async lockSubmission(matchId: string): Promise<{ lockedAt: string } | null> {
    const token = await this.getAccessToken();
    if (!token) {
      return null;
    }

    const config = this.getConfig();

    try {
      const response = await fetch(`${config.apiUrl}/api/matches/${matchId}/submissions/lock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ message: 'Lock failed' }))) as { message?: string; code?: string };

        // Handle specific error cases
        if (error.code === 'ALREADY_LOCKED') {
          throw new Error('Submission is already locked');
        } else if (error.code === 'NO_SUBMISSION') {
          throw new Error('No submission found to lock');
        } else if (error.code === 'MATCH_NOT_IN_PROGRESS') {
          throw new Error('Match is not in progress');
        }

        throw new Error(error.message || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { lockedAt: string; submission?: any };

      // Update the current match with the locked submission
      if (this.currentMatch && data.lockedAt) {
        this.currentMatch = {
          ...this.currentMatch,
          mySubmission: this.currentMatch.mySubmission
            ? { ...this.currentMatch.mySubmission, lockedAt: data.lockedAt }
            : null,
        };
        this._onMatchUpdate.fire(this.currentMatch);
      }

      return { lockedAt: data.lockedAt };
    } catch (error) {
      console.error('Failed to lock submission:', error);
      throw error;
    }
  }

  /**
   * Check if the current match submission is locked
   */
  isSubmissionLocked(): boolean {
    return !!this.currentMatch?.mySubmission?.lockedAt;
  }

  /**
   * Get the lock timestamp if submission is locked
   */
  getSubmissionLockedAt(): string | null {
    return this.currentMatch?.mySubmission?.lockedAt || null;
  }

  /**
   * Connect to match events using Server-Sent Events
   */
  private async connectToMatchEvents(matchId: string): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) {
      return;
    }

    const config = this.getConfig();
    const url = `${config.apiUrl}/api/matches/${matchId}/events?token=${encodeURIComponent(token)}`;

    this.disconnect();

    try {
      // Use EventSource for SSE connection
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this._onConnectionStateChange.fire('connected');
      };

      this.eventSource.onmessage = (event) => {
        try {
          const matchEvent: MatchEvent = JSON.parse(event.data);
          this.handleMatchEvent(matchEvent);
        } catch (error) {
          console.error('Failed to parse match event:', error);
        }
      };

      this.eventSource.onerror = () => {
        this._onConnectionStateChange.fire('disconnected');
        this.scheduleReconnect(matchId);
      };
    } catch (error) {
      console.error('Failed to connect to match events:', error);
      this.scheduleReconnect(matchId);
    }
  }

  /**
   * Handle incoming match events
   */
  private handleMatchEvent(event: MatchEvent): void {
    switch (event.type) {
      case 'match_update':
        if (event.data) {
          this.currentMatch = this.mapApiMatchToMatch(event.data);
          this._onMatchUpdate.fire(this.currentMatch);
        }
        break;

      case 'timer_tick':
        if (typeof event.data?.remaining === 'number') {
          this._onTimerTick.fire(event.data.remaining);
        }
        break;

      case 'participant_update':
      case 'submission_update':
        // Refresh the full match state
        if (this.currentMatch) {
          this.fetchMatch(this.currentMatch.id).then((match) => {
            if (match) {
              this.currentMatch = match;
              this._onMatchUpdate.fire(match);
            }
          });
        }
        break;

      case 'judging_update':
        if (this.currentMatch && event.data) {
          this.currentMatch = {
            ...this.currentMatch,
            status: event.data.status as MatchStatus,
          };
          this._onMatchUpdate.fire(this.currentMatch);
        }
        break;

      case 'error':
        console.error('Match event error:', event.data);
        vscode.window.showErrorMessage(`CodeArena: ${event.data?.message || 'Match error occurred'}`);
        break;
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(matchId: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      vscode.window.showErrorMessage(
        'CodeArena: Lost connection to match. Please check your network.'
      );
      return;
    }

    this._onConnectionStateChange.fire('reconnecting');
    this.reconnectAttempts++;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.connectToMatchEvents(matchId);
    }, this.reconnectDelay);

    // Exponential backoff with max of 30 seconds
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  /**
   * Map API response to Match type
   */
  private mapApiMatchToMatch(data: any): Match {
    return {
      id: data.id,
      challengeId: data.challengeId || data.challenge_id || data.challengeVersionId,
      challengeTitle: data.challengeTitle || data.challenge_title || data.challenge?.title || 'Challenge',
      status: data.status as MatchStatus,
      mode: data.mode || 'ranked',
      startAt: data.startAt || data.start_at || null,
      endAt: data.endAt || data.end_at || null,
      timeLimit: data.timeLimit || data.time_limit || 60,
      stakeAmount: data.stakeAmount || data.stake_amount || 100,
      participants: (data.participants || []).map((p: any) => ({
        userId: p.userId || p.user_id,
        username: p.username || p.user?.displayName || 'Anonymous',
        avatarUrl: p.avatarUrl || p.avatar_url || p.user?.avatarUrl,
        seat: p.seat,
        joinedAt: p.joinedAt || p.joined_at,
        readyAt: p.readyAt || p.ready_at,
        hasSubmitted: p.hasSubmitted ?? p.has_submitted ?? !!p.submissionId,
        hasLocked: p.hasLocked ?? p.has_locked ?? false,
      })),
      mySubmission: data.mySubmission || data.my_submission || null,
    };
  }

  /**
   * Get the current match
   */
  getCurrentMatch(): Match | null {
    return this.currentMatch;
  }

  /**
   * Set the current match (used when restoring state)
   */
  setCurrentMatch(match: Match | null): void {
    this.currentMatch = match;
    this._onMatchUpdate.fire(match);

    if (match && ['open', 'matched', 'in_progress'].includes(match.status)) {
      this.connectToMatchEvents(match.id);
    }
  }

  /**
   * Disconnect from match events
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Dispose of the service
   */
  dispose(): void {
    this.disconnect();
    this._onMatchUpdate.dispose();
    this._onTimerTick.dispose();
    this._onConnectionStateChange.dispose();
  }
}
