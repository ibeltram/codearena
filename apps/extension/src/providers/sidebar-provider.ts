import * as vscode from 'vscode';
import { Challenge, Match, MatchHistoryItem } from '../types';

/**
 * User info for the sidebar (compatible with AuthUser from auth service)
 */
interface SidebarUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

/**
 * Commands sent from the webview to the extension
 */
type WebviewCommand =
  | { command: 'signIn' }
  | { command: 'signOut' }
  | { command: 'refreshChallenges' }
  | { command: 'filterChallenges'; category: string | null }
  | { command: 'joinMatch'; challengeId: string }
  | { command: 'openChallengeInWeb'; challengeSlug: string }
  | { command: 'submit' }
  | { command: 'lockSubmission' }
  | { command: 'setReady' }
  | { command: 'forfeit' }
  | { command: 'openMatchInWeb' }
  | { command: 'refreshHistory' }
  | { command: 'viewMatchDetails'; matchId: string };

/**
 * SidebarProvider - WebviewViewProvider for the RepoRivals sidebar
 *
 * Provides a React-based webview sidebar that replaces the TreeDataProviders
 * for a richer, more interactive user experience.
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  /** The view type for registration - must match package.json */
  public static readonly viewType = 'reporivals-sidebar';

  /** Reference to the webview view (set when visible) */
  private _view?: vscode.WebviewView;

  /** Current state to send to webview */
  private _isAuthenticated = false;
  private _user: SidebarUser | null = null;
  private _challenges: Challenge[] = [];
  private _challengesLoading = false;
  private _challengesError: string | null = null;
  private _match: Match | null = null;
  private _timeRemaining = 0;
  private _connectionState: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
  private _history: MatchHistoryItem[] = [];
  private _historyLoading = false;
  private _historyError: string | null = null;

  /**
   * Create a new SidebarProvider
   * @param extensionUri - The URI of the extension directory (for asset loading)
   * @param context - The extension context (for subscriptions)
   */
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {}

  /**
   * Called when the webview view becomes visible
   * Sets up the webview options, HTML content, and message handlers
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    // Set HTML content (placeholder for now)
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Set up message handler
    this._setWebviewMessageListener(webviewView.webview);

    // Send initial state when ready
    this._sendInitialState();

    // Listen for visibility changes and send full state when visible again
    webviewView.onDidChangeVisibility(
      () => {
        if (webviewView.visible) {
          this._sendFullState();
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  /**
   * Generate the HTML content for the webview
   * Includes CSP, asset loading, and script nonce
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get URIs for the webview assets
    const scriptUri = this._getUri(webview, ['dist', 'webview', 'index.js']);
    const styleUri = this._getUri(webview, ['dist', 'webview', 'index.css']);

    // Generate a nonce for script security
    const nonce = this._getNonce();

    // Content Security Policy
    // - default-src 'none': Block everything by default
    // - style-src: Allow VS Code styles and our CSS
    // - script-src: Only allow scripts with our nonce
    // - img-src: Allow VS Code assets and HTTPS images (for avatars)
    // - font-src: Allow VS Code fonts
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} https:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="${csp}">
          <link rel="stylesheet" href="${styleUri}">
          <title>RepoRivals</title>
        </head>
        <body>
          <div id="root"></div>
          <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>
    `;
  }

  /**
   * Get a webview URI for a resource in the extension
   * @param webview - The webview to get the URI for
   * @param pathSegments - Path segments relative to extensionUri
   */
  private _getUri(webview: vscode.Webview, pathSegments: string[]): vscode.Uri {
    return webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, ...pathSegments)
    );
  }

  /**
   * Generate a random nonce for Content Security Policy
   * Used to allow only specific inline scripts
   */
  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Set up the message listener for commands from the webview
   */
  private _setWebviewMessageListener(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(
      async (message: WebviewCommand) => {
        try {
          await this._handleWebviewCommand(message);
        } catch (error) {
          console.error('Error handling webview command:', message.command, error);
          vscode.window.showErrorMessage(
            `Failed to execute command: ${message.command}`
          );
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  /**
   * Handle a command from the webview
   */
  private async _handleWebviewCommand(message: WebviewCommand): Promise<void> {
    switch (message.command) {
      // Authentication commands
      case 'signIn':
        await vscode.commands.executeCommand('reporivals.signIn');
        break;

      case 'signOut':
        await vscode.commands.executeCommand('reporivals.signOut');
        break;

      // Challenge commands
      case 'refreshChallenges':
        await vscode.commands.executeCommand('reporivals.refreshChallenges');
        break;

      case 'filterChallenges':
        // Store the category filter and notify extension
        if (message.category !== undefined) {
          await vscode.commands.executeCommand(
            'reporivals.filterChallenges',
            message.category
          );
        }
        break;

      case 'joinMatch':
        if (message.challengeId) {
          await vscode.commands.executeCommand(
            'reporivals.joinMatch',
            message.challengeId
          );
        }
        break;

      case 'openChallengeInWeb':
        if (message.challengeSlug) {
          await vscode.commands.executeCommand(
            'reporivals.openChallengeInWeb',
            message.challengeSlug
          );
        }
        break;

      // Match commands
      case 'submit':
        await vscode.commands.executeCommand('reporivals.submit');
        break;

      case 'lockSubmission':
        await vscode.commands.executeCommand('reporivals.lockSubmission');
        break;

      case 'setReady':
        await vscode.commands.executeCommand('reporivals.setReady');
        break;

      case 'forfeit':
        await vscode.commands.executeCommand('reporivals.forfeit');
        break;

      case 'openMatchInWeb':
        await vscode.commands.executeCommand('reporivals.openMatchInWeb');
        break;

      // History commands
      case 'refreshHistory':
        await vscode.commands.executeCommand('reporivals.refreshHistory');
        break;

      case 'viewMatchDetails':
        if (message.matchId) {
          await vscode.commands.executeCommand(
            'reporivals.showActiveMatchPanel',
            message.matchId
          );
        }
        break;

      default:
        console.warn('Unknown webview command:', (message as { command: string }).command);
    }
  }

  /**
   * Send the initial state to the webview on first load
   */
  private _sendInitialState(): void {
    this._sendFullState();
  }

  /**
   * Send the complete current state to the webview
   * Used on initial load and when visibility changes
   */
  private _sendFullState(): void {
    this._postMessage({
      type: 'stateUpdate',
      data: {
        auth: {
          isAuthenticated: this._isAuthenticated,
          user: this._user,
        },
        challenges: {
          challenges: this._challenges,
          loading: this._challengesLoading,
          error: this._challengesError,
        },
        match: {
          match: this._match,
          timeRemaining: this._timeRemaining,
          connectionState: this._connectionState,
        },
        history: {
          matches: this._history,
          loading: this._historyLoading,
          error: this._historyError,
        },
      },
    });
  }

  /**
   * Post a message to the webview
   */
  private _postMessage(message: unknown): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  // ============================================
  // Public update methods (called by services)
  // ============================================

  /**
   * Update authentication state
   * @param isAuthenticated - Whether the user is signed in
   * @param user - The current user (or null if signed out)
   */
  public updateAuth(isAuthenticated: boolean, user: SidebarUser | null): void {
    this._isAuthenticated = isAuthenticated;
    this._user = user;
    this._postMessage({
      type: 'authUpdate',
      data: { isAuthenticated, user },
    });
  }

  /**
   * Update challenges list
   * @param challenges - The list of challenges
   * @param loading - Whether challenges are loading
   * @param error - Error message if fetch failed
   */
  public updateChallenges(
    challenges: Challenge[],
    loading: boolean,
    error: string | null
  ): void {
    this._challenges = challenges;
    this._challengesLoading = loading;
    this._challengesError = error;
    this._postMessage({
      type: 'challengesUpdate',
      data: { challenges, loading, error },
    });
  }

  /**
   * Update the active match
   * @param match - The current match (or null if no active match)
   */
  public updateMatch(match: Match | null): void {
    this._match = match;
    this._postMessage({
      type: 'matchUpdate',
      data: { match },
    });
  }

  /**
   * Update the match timer
   * @param timeRemaining - Seconds remaining in the match
   */
  public updateTimer(timeRemaining: number): void {
    this._timeRemaining = timeRemaining;
    this._postMessage({
      type: 'timerUpdate',
      data: { timeRemaining },
    });
  }

  /**
   * Update SSE connection state
   * @param state - The connection state
   */
  public updateConnectionState(
    state: 'connected' | 'disconnected' | 'reconnecting'
  ): void {
    this._connectionState = state;
    this._postMessage({
      type: 'connectionUpdate',
      data: { state },
    });
  }

  /**
   * Update match history
   * @param matches - The list of recent matches
   * @param loading - Whether history is loading
   * @param error - Error message if fetch failed
   */
  public updateHistory(
    matches: MatchHistoryItem[],
    loading: boolean,
    error: string | null
  ): void {
    this._history = matches;
    this._historyLoading = loading;
    this._historyError = error;
    this._postMessage({
      type: 'historyUpdate',
      data: { matches, loading, error },
    });
  }

  /**
   * Send a message to the webview
   * Used for commands like switching tabs from the extension
   * @param message - The message to send
   */
  public postMessage(message: unknown): void {
    this._postMessage(message);
  }
}
