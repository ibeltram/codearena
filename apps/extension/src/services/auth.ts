import * as vscode from 'vscode';

/**
 * Response from device code start endpoint
 */
interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

/**
 * Response from device code confirm endpoint
 */
interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  } | null;
}

/**
 * Error response from auth endpoints
 */
interface AuthError {
  error: string;
  errorDescription: string;
}

/**
 * Stored token data
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  userAvatarUrl?: string;
}

/**
 * User info for auth state changes
 */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

/**
 * Auth state change callback
 */
export type AuthStateChangeCallback = (isAuthenticated: boolean, user: AuthUser | null) => void;

/**
 * Auth service for handling device code authentication flow
 */
export class AuthService {
  private context: vscode.ExtensionContext;
  private apiUrl: string;
  private _webUrl: string; // Reserved for future use
  private pollingInterval: NodeJS.Timeout | null = null;
  private statusBarItem: vscode.StatusBarItem | null = null;
  private authStateListeners: AuthStateChangeCallback[] = [];
  private _isAuthenticated = false;
  private _currentUser: AuthUser | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    const config = vscode.workspace.getConfiguration('reporivals');
    this.apiUrl = config.get<string>('apiUrl', 'http://localhost:3002');
    this._webUrl = config.get<string>('webUrl', 'http://localhost:3001');

    // Create auth status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    this.statusBarItem.command = 'reporivals.showAuthStatus';
    context.subscriptions.push(this.statusBarItem);
  }

  /**
   * Get stored tokens
   */
  async getStoredTokens(): Promise<StoredTokens | null> {
    const tokensJson = await this.context.secrets.get('reporivals.tokens');
    if (!tokensJson) {
      return null;
    }

    try {
      return JSON.parse(tokensJson);
    } catch {
      return null;
    }
  }

  /**
   * Store tokens securely
   */
  async storeTokens(tokens: StoredTokens): Promise<void> {
    await this.context.secrets.store('reporivals.tokens', JSON.stringify(tokens));
  }

  /**
   * Clear stored tokens
   */
  async clearTokens(): Promise<void> {
    await this.context.secrets.delete('reporivals.tokens');
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const tokens = await this.getStoredTokens();
    if (!tokens) {
      return false;
    }

    // Check if token is expired (with 5 minute buffer)
    if (tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
      // Try to refresh
      const refreshed = await this.refreshTokens();
      return refreshed;
    }

    return true;
  }

  /**
   * Get access token (refreshing if needed)
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.getStoredTokens();
    if (!tokens) {
      return null;
    }

    // Check if token is expired (with 1 minute buffer)
    if (tokens.expiresAt < Date.now() + 60 * 1000) {
      const refreshed = await this.refreshTokens();
      if (!refreshed) {
        return null;
      }
      const newTokens = await this.getStoredTokens();
      return newTokens?.accessToken || null;
    }

    return tokens.accessToken;
  }

  /**
   * Start device code authentication flow
   */
  async startDeviceCodeFlow(): Promise<boolean> {
    try {
      // Call the start endpoint
      const response = await fetch(`${this.apiUrl}/api/auth/device/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = (await response.json()) as AuthError;
        vscode.window.showErrorMessage(
          `RepoRivals: Failed to start sign-in: ${error.errorDescription || 'Unknown error'}`
        );
        return false;
      }

      const data = (await response.json()) as DeviceCodeResponse;

      // Show the user code and open browser
      const result = await this.showDeviceCodePrompt(data);
      if (!result) {
        return false;
      }

      // Start polling for authorization
      const tokens = await this.pollForAuthorization(data);
      if (!tokens) {
        return false;
      }

      // Store tokens
      await this.storeTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        userId: tokens.user?.id || '',
        userEmail: tokens.user?.email || '',
        userDisplayName: tokens.user?.displayName || 'User',
        userAvatarUrl: tokens.user?.avatarUrl,
      });

      // Update internal state and notify listeners
      this._isAuthenticated = true;
      this._currentUser = tokens.user ? {
        id: tokens.user.id,
        email: tokens.user.email,
        displayName: tokens.user.displayName,
        avatarUrl: tokens.user.avatarUrl,
      } : null;
      this.notifyAuthStateChange();

      // Update context
      await vscode.commands.executeCommand('setContext', 'reporivals.isAuthenticated', true);

      // Show success
      vscode.window.showInformationMessage(
        `RepoRivals: Signed in as ${tokens.user?.displayName || 'User'}!`
      );

      this.updateStatusBar(tokens.user?.displayName || 'User');

      return true;
    } catch (error) {
      console.error('Device code flow error:', error);
      vscode.window.showErrorMessage(
        `RepoRivals: Sign-in failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }

  /**
   * Show the device code prompt to the user
   */
  private async showDeviceCodePrompt(data: DeviceCodeResponse): Promise<boolean> {
    const codeDisplay = `Your code: ${data.userCode}`;

    // Show notification with actions
    const action = await vscode.window.showInformationMessage(
      `RepoRivals Sign In\n\n${codeDisplay}\n\nEnter this code in your browser to authorize.`,
      { modal: true },
      'Open Browser',
      'Copy Code',
      'Cancel'
    );

    if (action === 'Cancel' || !action) {
      return false;
    }

    if (action === 'Copy Code') {
      await vscode.env.clipboard.writeText(data.userCode);
      vscode.window.showInformationMessage('RepoRivals: Code copied to clipboard!');
    }

    // Always open browser
    await vscode.env.openExternal(vscode.Uri.parse(data.verificationUriComplete));

    // Show a non-modal message that allows user to see the code
    const copyAction = await vscode.window.showInformationMessage(
      `Waiting for authorization... Your code: ${data.userCode}`,
      'Copy Code'
    );

    if (copyAction === 'Copy Code') {
      await vscode.env.clipboard.writeText(data.userCode);
    }

    return true;
  }

  /**
   * Poll for authorization completion
   */
  private async pollForAuthorization(data: DeviceCodeResponse): Promise<TokenResponse | null> {
    const expiresAt = Date.now() + data.expiresIn * 1000;
    const interval = data.interval * 1000;

    return new Promise((resolve) => {
      const poll = async () => {
        // Check if expired
        if (Date.now() >= expiresAt) {
          this.stopPolling();
          vscode.window.showWarningMessage('RepoRivals: Sign-in timed out. Please try again.');
          resolve(null);
          return;
        }

        try {
          const response = await fetch(`${this.apiUrl}/api/auth/device/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceCode: data.deviceCode }),
          });

          const result = (await response.json()) as TokenResponse | AuthError;

          if (response.ok) {
            // Success!
            this.stopPolling();
            resolve(result as TokenResponse);
            return;
          }

          // Handle specific error cases
          const errorResult = result as AuthError;
          if (errorResult.error === 'authorization_pending') {
            // Still waiting, continue polling
            return;
          }

          if (errorResult.error === 'expired_token') {
            this.stopPolling();
            vscode.window.showWarningMessage('RepoRivals: Sign-in code expired. Please try again.');
            resolve(null);
            return;
          }

          // Other error
          this.stopPolling();
          vscode.window.showErrorMessage(
            `RepoRivals: Sign-in failed: ${errorResult.errorDescription || 'Unknown error'}`
          );
          resolve(null);
        } catch (error) {
          console.error('Polling error:', error);
          // Network error, keep polling
        }
      };

      // Start polling
      this.pollingInterval = setInterval(poll, interval);
      poll(); // Initial poll
    });
  }

  /**
   * Stop polling for authorization
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(): Promise<boolean> {
    const tokens = await this.getStoredTokens();
    if (!tokens?.refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (!response.ok) {
        // Refresh failed, clear tokens
        await this.clearTokens();
        await vscode.commands.executeCommand('setContext', 'reporivals.isAuthenticated', false);
        return false;
      }

      const data = (await response.json()) as TokenResponse;

      // Store new tokens
      await this.storeTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: Date.now() + data.expiresIn * 1000,
        userId: data.user?.id || tokens.userId,
        userEmail: data.user?.email || tokens.userEmail,
        userDisplayName: data.user?.displayName || tokens.userDisplayName,
        userAvatarUrl: data.user?.avatarUrl || tokens.userAvatarUrl,
      });

      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    const tokens = await this.getStoredTokens();

    // Call logout endpoint if we have a refresh token
    if (tokens?.refreshToken) {
      try {
        await fetch(`${this.apiUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
      } catch {
        // Ignore logout errors
      }
    }

    // Clear local tokens
    await this.clearTokens();
    await vscode.commands.executeCommand('setContext', 'reporivals.isAuthenticated', false);

    // Update internal state and notify listeners
    this._isAuthenticated = false;
    this._currentUser = null;
    this.notifyAuthStateChange();

    // Hide status bar
    this.statusBarItem?.hide();
  }

  /**
   * Update auth status bar
   */
  updateStatusBar(displayName?: string): void {
    if (!this.statusBarItem) return;

    if (displayName) {
      this.statusBarItem.text = `$(account) ${displayName}`;
      this.statusBarItem.tooltip = `Signed in as ${displayName}\nClick for account options`;
      this.statusBarItem.show();
    } else {
      this.statusBarItem.hide();
    }
  }

  /**
   * Initialize auth state from stored tokens
   */
  async initialize(): Promise<boolean> {
    const tokens = await this.getStoredTokens();
    if (!tokens) {
      // Ensure state is cleared
      this._isAuthenticated = false;
      this._currentUser = null;
      this.notifyAuthStateChange();
      return false;
    }

    // Check if we need to refresh
    if (tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
      const refreshed = await this.refreshTokens();
      if (!refreshed) {
        // Refresh failed, clear state
        this._isAuthenticated = false;
        this._currentUser = null;
        this.notifyAuthStateChange();
        return false;
      }
      // Get updated tokens after refresh
      const updatedTokens = await this.getStoredTokens();
      if (updatedTokens) {
        this._isAuthenticated = true;
        this._currentUser = {
          id: updatedTokens.userId,
          email: updatedTokens.userEmail,
          displayName: updatedTokens.userDisplayName,
          avatarUrl: updatedTokens.userAvatarUrl,
        };
      }
    } else {
      // Set internal state from stored tokens
      this._isAuthenticated = true;
      this._currentUser = {
        id: tokens.userId,
        email: tokens.userEmail,
        displayName: tokens.userDisplayName,
        avatarUrl: tokens.userAvatarUrl,
      };
    }

    // Notify listeners of initial auth state
    this.notifyAuthStateChange();

    // Update UI
    this.updateStatusBar(tokens.userDisplayName);
    await vscode.commands.executeCommand('setContext', 'reporivals.isAuthenticated', true);

    return true;
  }

  /**
   * Register a callback for auth state changes
   * @param callback - Function to call when auth state changes
   * @returns Disposable to unregister the listener
   */
  onAuthStateChange(callback: AuthStateChangeCallback): vscode.Disposable {
    this.authStateListeners.push(callback);
    return {
      dispose: () => {
        const index = this.authStateListeners.indexOf(callback);
        if (index >= 0) {
          this.authStateListeners.splice(index, 1);
        }
      },
    };
  }

  /**
   * Get current auth state
   */
  getAuthState(): { isAuthenticated: boolean; user: AuthUser | null } {
    return {
      isAuthenticated: this._isAuthenticated,
      user: this._currentUser,
    };
  }

  /**
   * Notify listeners of auth state change
   */
  private notifyAuthStateChange(): void {
    for (const listener of this.authStateListeners) {
      try {
        listener(this._isAuthenticated, this._currentUser);
      } catch (error) {
        console.error('Error in auth state listener:', error);
      }
    }
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.stopPolling();
    this.statusBarItem?.dispose();
    this.authStateListeners = [];
  }
}
