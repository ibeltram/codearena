import * as vscode from 'vscode';
import { Match, MatchParticipant } from '../types';

/**
 * Webview panel for displaying active match details with rich UI
 */
export class ActiveMatchPanel {
  public static currentPanel: ActiveMatchPanel | undefined;
  private static readonly viewType = 'reporivals.activeMatch';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private match: Match | null = null;
  private timeRemaining: number = 0;
  private connectionState: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
  private currentUserId: string | null = null;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    // Set up panel
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [extensionUri],
    };

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Create or show the panel
   */
  public static createOrShow(extensionUri: vscode.Uri): ActiveMatchPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (ActiveMatchPanel.currentPanel) {
      ActiveMatchPanel.currentPanel.panel.reveal(column);
      return ActiveMatchPanel.currentPanel;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      ActiveMatchPanel.viewType,
      'RepoRivals Match',
      column || vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    ActiveMatchPanel.currentPanel = new ActiveMatchPanel(panel, extensionUri);
    return ActiveMatchPanel.currentPanel;
  }

  /**
   * Update the match data
   */
  public setMatch(match: Match | null): void {
    this.match = match;
    this.updateWebview();
  }

  /**
   * Update the timer
   */
  public setTimeRemaining(seconds: number): void {
    this.timeRemaining = seconds;
    // Send just the timer update to avoid full re-render
    this.panel.webview.postMessage({
      type: 'timer_update',
      data: { timeRemaining: seconds },
    });
  }

  /**
   * Update the connection state
   */
  public setConnectionState(state: 'connected' | 'disconnected' | 'reconnecting'): void {
    this.connectionState = state;
    this.panel.webview.postMessage({
      type: 'connection_update',
      data: { state },
    });
  }

  /**
   * Set the current user ID
   */
  public setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
    this.updateWebview();
  }

  /**
   * Handle messages from the webview
   */
  private handleMessage(message: any): void {
    switch (message.command) {
      case 'submit':
        vscode.commands.executeCommand('reporivals.submit');
        break;
      case 'lock':
        vscode.commands.executeCommand('reporivals.lockSubmission');
        break;
      case 'forfeit':
        this.confirmForfeit();
        break;
      case 'openInWeb':
        vscode.commands.executeCommand('reporivals.openMatchInWeb');
        break;
      case 'ready':
        vscode.commands.executeCommand('reporivals.setReady');
        break;
    }
  }

  /**
   * Confirm forfeit action
   */
  private async confirmForfeit(): Promise<void> {
    const result = await vscode.window.showWarningMessage(
      'Are you sure you want to forfeit this match? You will lose your stake.',
      { modal: true },
      'Forfeit'
    );

    if (result === 'Forfeit') {
      vscode.commands.executeCommand('reporivals.forfeit');
    }
  }

  /**
   * Update the webview content
   */
  private updateWebview(): void {
    this.panel.webview.html = this.getHtmlContent();
  }

  /**
   * Generate the HTML content for the webview
   */
  private getHtmlContent(): string {
    const nonce = this.getNonce();

    if (!this.match) {
      return this.getNoMatchHtml(nonce);
    }

    const me = this.match.participants.find((p) => p.userId === this.currentUserId);
    const opponent = this.match.participants.find((p) => p.userId !== this.currentUserId);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>RepoRivals Match</title>
  <style>
    :root {
      --vscode-font: var(--vscode-font-family);
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --border: var(--vscode-panel-border);
      --success: var(--vscode-charts-green);
      --warning: var(--vscode-charts-yellow);
      --error: var(--vscode-charts-red);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font);
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 16px;
      line-height: 1.5;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .header h1 {
      font-size: 18px;
      font-weight: 600;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .connection-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--error);
    }

    .connection-dot.connected {
      background: var(--success);
    }

    .connection-dot.reconnecting {
      background: var(--warning);
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .timer-section {
      text-align: center;
      padding: 24px;
      background: var(--bg-secondary);
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .timer {
      font-size: 48px;
      font-weight: bold;
      font-variant-numeric: tabular-nums;
      margin-bottom: 8px;
    }

    .timer.warning {
      color: var(--warning);
    }

    .timer.critical {
      color: var(--error);
      animation: pulse 1s infinite;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .status-open { background: var(--warning); color: #000; }
    .status-matched { background: var(--accent); color: #fff; }
    .status-in_progress { background: var(--success); color: #fff; }
    .status-submission_locked { background: var(--text-secondary); color: #fff; }
    .status-judging { background: var(--accent); color: #fff; }
    .status-finalized { background: var(--success); color: #fff; }

    .participants {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 16px;
      align-items: center;
      margin-bottom: 20px;
    }

    .participant {
      text-align: center;
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
    }

    .participant.you {
      border: 2px solid var(--accent);
    }

    .participant-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 8px;
      font-size: 20px;
      font-weight: bold;
    }

    .participant-name {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .participant-status {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .vs {
      font-size: 24px;
      font-weight: bold;
      color: var(--text-secondary);
    }

    .challenge-info {
      background: var(--bg-secondary);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .challenge-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .challenge-meta {
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .challenge-meta span {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    button {
      flex: 1;
      min-width: 120px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 500;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s;
    }

    button.primary {
      background: var(--accent);
      color: var(--vscode-button-foreground);
    }

    button.primary:hover {
      background: var(--accent-hover);
    }

    button.secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    button.secondary:hover {
      background: var(--border);
    }

    button.danger {
      background: var(--error);
      color: #fff;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .submission-status {
      margin-top: 16px;
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 6px;
      text-align: center;
    }

    .submission-status.submitted {
      border-left: 3px solid var(--success);
    }

    .submission-status.locked {
      border-left: 3px solid var(--accent);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Active Match</h1>
    <div class="connection-status">
      <div class="connection-dot ${this.connectionState}" id="connectionDot"></div>
      <span id="connectionText">${this.getConnectionText()}</span>
    </div>
  </div>

  <div class="timer-section">
    <div class="timer ${this.getTimerClass()}" id="timer">${this.formatTime(this.timeRemaining)}</div>
    <span class="status-badge status-${this.match.status}">${this.getStatusLabel()}</span>
  </div>

  <div class="participants">
    ${this.renderParticipant(me, true)}
    <div class="vs">VS</div>
    ${this.renderParticipant(opponent, false)}
  </div>

  <div class="challenge-info">
    <div class="challenge-title">${this.escapeHtml(this.match.challengeTitle)}</div>
    <div class="challenge-meta">
      <span>⏱️ ${this.match.timeLimit} min</span>
      <span>💰 ${this.match.stakeAmount} credits</span>
      <span>🏆 ${this.match.mode}</span>
    </div>
  </div>

  ${this.renderSubmissionStatus()}

  <div class="actions">
    ${this.renderActions()}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Handle button clicks
    document.querySelectorAll('button[data-command]').forEach(btn => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ command: btn.dataset.command });
      });
    });

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      if (message.type === 'timer_update') {
        const timer = document.getElementById('timer');
        if (timer) {
          timer.textContent = formatTime(message.data.timeRemaining);
          timer.className = 'timer ' + getTimerClass(message.data.timeRemaining);
        }
      }

      if (message.type === 'connection_update') {
        const dot = document.getElementById('connectionDot');
        const text = document.getElementById('connectionText');
        if (dot) dot.className = 'connection-dot ' + message.data.state;
        if (text) text.textContent = getConnectionText(message.data.state);
      }
    });

    function formatTime(seconds) {
      if (seconds <= 0) return '0:00';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) {
        return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      }
      return m + ':' + String(s).padStart(2, '0');
    }

    function getTimerClass(seconds) {
      if (seconds <= 60) return 'critical';
      if (seconds <= 300) return 'warning';
      return '';
    }

    function getConnectionText(state) {
      switch (state) {
        case 'connected': return 'Live';
        case 'reconnecting': return 'Reconnecting...';
        default: return 'Offline';
      }
    }
  </script>
</body>
</html>`;
  }

  /**
   * Render a participant card
   */
  private renderParticipant(participant: MatchParticipant | undefined, isCurrentUser: boolean): string {
    if (!participant) {
      return `
        <div class="participant">
          <div class="participant-avatar">?</div>
          <div class="participant-name">Waiting...</div>
          <div class="participant-status">Searching for opponent</div>
        </div>
      `;
    }

    const initial = participant.username.charAt(0).toUpperCase();
    const statusText = this.getParticipantStatus(participant);

    return `
      <div class="participant ${isCurrentUser ? 'you' : ''}">
        <div class="participant-avatar">${initial}</div>
        <div class="participant-name">${this.escapeHtml(participant.username)}${isCurrentUser ? ' (You)' : ''}</div>
        <div class="participant-status">${statusText}</div>
      </div>
    `;
  }

  /**
   * Get participant status text
   */
  private getParticipantStatus(participant: MatchParticipant): string {
    if (participant.hasLocked) return '🔒 Locked';
    if (participant.hasSubmitted) return '✅ Submitted';
    if (participant.readyAt) return '✓ Ready';
    return '⏳ Waiting';
  }

  /**
   * Render submission status
   */
  private renderSubmissionStatus(): string {
    if (!this.match?.mySubmission) return '';

    const isLocked = !!this.match.mySubmission.lockedAt;
    const statusClass = isLocked ? 'locked' : 'submitted';
    const statusText = isLocked
      ? '🔒 Your submission is locked and final'
      : '✅ Submission uploaded - not yet locked';

    return `
      <div class="submission-status ${statusClass}">
        ${statusText}
      </div>
    `;
  }

  /**
   * Render action buttons based on match state
   */
  private renderActions(): string {
    if (!this.match) return '';

    const buttons: string[] = [];

    // Match state specific actions
    if (this.match.status === 'matched') {
      buttons.push(
        `<button class="primary" data-command="ready">I'm Ready</button>`
      );
    }

    if (this.match.status === 'in_progress') {
      if (!this.match.mySubmission) {
        buttons.push(
          `<button class="primary" data-command="submit">Submit Code</button>`
        );
      } else if (!this.match.mySubmission.lockedAt) {
        buttons.push(
          `<button class="primary" data-command="lock">Lock Submission</button>`
        );
        buttons.push(
          `<button class="secondary" data-command="submit">Update Submission</button>`
        );
      }
    }

    // Always show open in web
    buttons.push(
      `<button class="secondary" data-command="openInWeb">Open in Browser</button>`
    );

    // Forfeit option for active matches
    if (['open', 'matched', 'in_progress'].includes(this.match.status)) {
      buttons.push(
        `<button class="danger" data-command="forfeit">Forfeit</button>`
      );
    }

    return buttons.join('\n');
  }

  /**
   * Get status label
   */
  private getStatusLabel(): string {
    if (!this.match) return 'No Match';

    const labels: Record<string, string> = {
      created: 'Created',
      open: 'Finding Opponent',
      matched: 'Get Ready!',
      in_progress: 'In Progress',
      submission_locked: 'Locked',
      judging: 'Judging',
      finalized: 'Complete',
      archived: 'Archived',
    };

    return labels[this.match.status] || this.match.status;
  }

  /**
   * Get timer CSS class
   */
  private getTimerClass(): string {
    if (this.timeRemaining <= 60) return 'critical';
    if (this.timeRemaining <= 300) return 'warning';
    return '';
  }

  /**
   * Get connection status text
   */
  private getConnectionText(): string {
    switch (this.connectionState) {
      case 'connected':
        return 'Live';
      case 'reconnecting':
        return 'Reconnecting...';
      default:
        return 'Offline';
    }
  }

  /**
   * Get HTML for no match state
   */
  private getNoMatchHtml(nonce: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>RepoRivals Match</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      text-align: center;
      padding: 20px;
    }
    h2 { margin-bottom: 12px; }
    p { color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h2>No Active Match</h2>
  <p>Join a challenge to start competing!</p>
</body>
</html>`;
  }

  /**
   * Format time in seconds to display string
   */
  private formatTime(seconds: number): string {
    if (seconds <= 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * Generate a nonce for CSP
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Dispose the panel
   */
  public dispose(): void {
    ActiveMatchPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
