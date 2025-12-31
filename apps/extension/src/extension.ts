import * as vscode from 'vscode';
import { ChallengesProvider, MatchProvider, HistoryProvider } from './providers';
import { StatusBarService } from './services';
import { Challenge, MatchHistoryItem, ExtensionConfig } from './types';

// Global providers and services
let challengesProvider: ChallengesProvider;
let matchProvider: MatchProvider;
let historyProvider: HistoryProvider;
let statusBarService: StatusBarService;

// Extension state
let isAuthenticated = false;
let currentUserId: string | null = null;

/**
 * Get extension configuration
 */
function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('codearena');
  return {
    apiUrl: config.get<string>('apiUrl', 'https://api.codearena.dev'),
    webUrl: config.get<string>('webUrl', 'https://codearena.dev'),
    autoSubmit: config.get<boolean>('autoSubmit', false),
    showTimerInStatusBar: config.get<boolean>('showTimerInStatusBar', true),
    timerWarningMinutes: config.get<number>('timerWarningMinutes', 5),
    excludePatterns: config.get<string[]>('excludePatterns', [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      '.env*',
      '*.log',
    ]),
    maxSubmissionSizeMB: config.get<number>('maxSubmissionSizeMB', 50),
  };
}

/**
 * Register commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Sign In
  const signIn = vscode.commands.registerCommand('codearena.signIn', async () => {
    if (isAuthenticated) {
      vscode.window.showInformationMessage('CodeArena: You are already signed in.');
      return;
    }

    // Device code auth flow placeholder
    const config = getConfig();
    vscode.window.showInformationMessage(
      `CodeArena: Sign in flow will redirect to ${config.webUrl}/device`
    );

    // TODO: Implement device code OAuth flow
    // 1. Call POST /api/auth/device/start
    // 2. Show user code and verification URL
    // 3. Poll POST /api/auth/device/confirm until tokens received
    // 4. Store tokens securely
    // 5. Set isAuthenticated = true
    // 6. Refresh challenges list
  });

  // Sign Out
  const signOut = vscode.commands.registerCommand('codearena.signOut', async () => {
    if (!isAuthenticated) {
      vscode.window.showInformationMessage('CodeArena: You are not signed in.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to sign out of CodeArena?',
      { modal: true },
      'Sign Out'
    );

    if (confirm === 'Sign Out') {
      // Clear stored tokens
      await context.secrets.delete('codearena.tokens');
      isAuthenticated = false;
      currentUserId = null;

      // Clear providers
      challengesProvider.setChallenges([]);
      matchProvider.setMatch(null);
      historyProvider.setMatches([]);
      statusBarService.hide();

      // Update context
      await vscode.commands.executeCommand('setContext', 'codearena.isAuthenticated', false);

      vscode.window.showInformationMessage('CodeArena: You have been signed out.');
    }
  });

  // Browse Challenges
  const browseChallenges = vscode.commands.registerCommand('codearena.browseChallenges', () => {
    // Focus the challenges view
    vscode.commands.executeCommand('codearena-challenges.focus');
  });

  // Show Challenge Details
  const showChallengeDetails = vscode.commands.registerCommand(
    'codearena.showChallengeDetails',
    async (challenge: Challenge) => {
      // Show challenge details in a quick pick or webview
      const actions = await vscode.window.showQuickPick(
        [
          { label: '$(play) Join Match', description: 'Start a match with this challenge' },
          { label: '$(link-external) View in Browser', description: 'Open challenge details in browser' },
        ],
        {
          title: `${challenge.title} (${challenge.difficulty})`,
          placeHolder: `${challenge.category} | ${challenge.timeLimit} minutes | ${challenge.stakeAmount} credits`,
        }
      );

      if (actions?.label.includes('Join Match')) {
        vscode.commands.executeCommand('codearena.joinMatch', challenge);
      } else if (actions?.label.includes('View in Browser')) {
        const config = getConfig();
        vscode.env.openExternal(
          vscode.Uri.parse(`${config.webUrl}/challenges/${challenge.slug}`)
        );
      }
    }
  );

  // Join Match
  const joinMatch = vscode.commands.registerCommand(
    'codearena.joinMatch',
    async (challenge?: Challenge) => {
      if (!isAuthenticated) {
        const action = await vscode.window.showWarningMessage(
          'CodeArena: You need to sign in to join a match.',
          'Sign In'
        );
        if (action === 'Sign In') {
          vscode.commands.executeCommand('codearena.signIn');
        }
        return;
      }

      if (!challenge) {
        vscode.window.showInformationMessage(
          'CodeArena: Please select a challenge from the Challenges view.'
        );
        return;
      }

      // Confirm match join
      const confirm = await vscode.window.showWarningMessage(
        `Join match for "${challenge.title}"?\n\nStake: ${challenge.stakeAmount} credits\nTime limit: ${challenge.timeLimit} minutes`,
        { modal: true },
        'Join Match'
      );

      if (confirm === 'Join Match') {
        // TODO: Call API to join match
        vscode.window.showInformationMessage(
          `CodeArena: Joining match for ${challenge.title}...`
        );

        // For now, show a placeholder active match
        // In real implementation, this would be populated from the API response
      }
    }
  );

  // Submit
  const submit = vscode.commands.registerCommand('codearena.submit', async () => {
    const match = matchProvider.getMatch();
    if (!match || match.status !== 'in_progress') {
      vscode.window.showWarningMessage('CodeArena: No active match to submit to.');
      return;
    }

    // Get workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('CodeArena: Please open a workspace folder first.');
      return;
    }

    let targetFolder: vscode.WorkspaceFolder;
    if (workspaceFolders.length === 1) {
      targetFolder = workspaceFolders[0];
    } else {
      const selected = await vscode.window.showWorkspaceFolderPick({
        placeHolder: 'Select the workspace folder to submit',
      });
      if (!selected) {
        return;
      }
      targetFolder = selected;
    }

    // TODO: Implement file preview and upload
    // 1. Scan workspace for files (excluding patterns from config)
    // 2. Show file preview with sizes
    // 3. Calculate total size and check against max
    // 4. Create zip archive
    // 5. Upload via multipart upload API
    // 6. Show progress
    // 7. Update match provider with submission

    vscode.window.showInformationMessage(
      `CodeArena: Submitting from ${targetFolder.name}... (not yet implemented)`
    );
  });

  // Lock Submission
  const lockSubmission = vscode.commands.registerCommand('codearena.lockSubmission', async () => {
    const match = matchProvider.getMatch();
    if (!match?.mySubmission) {
      vscode.window.showWarningMessage('CodeArena: You need to submit first before locking.');
      return;
    }

    if (match.mySubmission.lockedAt) {
      vscode.window.showInformationMessage('CodeArena: Your submission is already locked.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to lock your submission?\n\nThis action cannot be undone. You will not be able to submit again after locking.',
      { modal: true },
      'Lock Submission'
    );

    if (confirm === 'Lock Submission') {
      // TODO: Call API to lock submission
      vscode.window.showInformationMessage('CodeArena: Locking submission... (not yet implemented)');
    }
  });

  // Open Match in Web
  const openMatchInWeb = vscode.commands.registerCommand('codearena.openMatchInWeb', () => {
    const match = matchProvider.getMatch();
    if (!match) {
      vscode.window.showWarningMessage('CodeArena: No active match.');
      return;
    }

    const config = getConfig();
    vscode.env.openExternal(vscode.Uri.parse(`${config.webUrl}/matches/${match.id}`));
  });

  // View Match Details (from history)
  const viewMatchDetails = vscode.commands.registerCommand(
    'codearena.viewMatchDetails',
    (match: MatchHistoryItem) => {
      const config = getConfig();
      vscode.env.openExternal(vscode.Uri.parse(`${config.webUrl}/matches/${match.id}`));
    }
  );

  // Focus Match View
  const focusMatchView = vscode.commands.registerCommand('codearena.focusMatchView', () => {
    vscode.commands.executeCommand('codearena-match.focus');
  });

  // Refresh Challenges
  const refreshChallenges = vscode.commands.registerCommand('codearena.refreshChallenges', () => {
    // TODO: Fetch challenges from API
    challengesProvider.setLoading(true);
    setTimeout(() => {
      challengesProvider.setLoading(false);
      // Mock data for now
      challengesProvider.setChallenges([]);
    }, 1000);
  });

  context.subscriptions.push(
    signIn,
    signOut,
    browseChallenges,
    showChallengeDetails,
    joinMatch,
    submit,
    lockSubmission,
    openMatchInWeb,
    viewMatchDetails,
    focusMatchView,
    refreshChallenges
  );
}

/**
 * Set up context values for when clauses
 */
async function setupContext(): Promise<void> {
  await vscode.commands.executeCommand('setContext', 'codearena.isAuthenticated', isAuthenticated);
  await vscode.commands.executeCommand('setContext', 'codearena.hasActiveMatch', false);
  await vscode.commands.executeCommand('setContext', 'codearena.hasSubmitted', false);
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.info('CodeArena extension is activating...');

  // Initialize providers
  challengesProvider = new ChallengesProvider();
  matchProvider = new MatchProvider();
  historyProvider = new HistoryProvider();
  statusBarService = new StatusBarService();

  // Register tree data providers
  const challengesView = vscode.window.createTreeView('codearena-challenges', {
    treeDataProvider: challengesProvider,
    showCollapseAll: true,
  });

  const matchView = vscode.window.createTreeView('codearena-match', {
    treeDataProvider: matchProvider,
  });

  const historyView = vscode.window.createTreeView('codearena-history', {
    treeDataProvider: historyProvider,
  });

  context.subscriptions.push(challengesView, matchView, historyView);

  // Register commands
  registerCommands(context);

  // Set up context values
  setupContext();

  // Add status bar service to subscriptions
  context.subscriptions.push({
    dispose: () => statusBarService.dispose(),
  });

  // Check for existing tokens (auto sign-in)
  context.secrets.get('codearena.tokens').then((tokens) => {
    if (tokens) {
      try {
        const parsed = JSON.parse(tokens);
        if (parsed.accessToken && parsed.expiresAt > Date.now()) {
          isAuthenticated = true;
          currentUserId = parsed.userId;
          matchProvider.setCurrentUserId(currentUserId);
          vscode.commands.executeCommand('setContext', 'codearena.isAuthenticated', true);
          // TODO: Fetch user data and refresh challenges
        }
      } catch {
        // Invalid tokens, ignore
      }
    }
  });

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('codearena')) {
        // Update status bar visibility
        const config = getConfig();
        if (!config.showTimerInStatusBar) {
          statusBarService.hide();
        } else if (matchProvider.getMatch()) {
          statusBarService.show();
        }
      }
    })
  );

  console.info('CodeArena extension activated!');
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.info('CodeArena extension is deactivating...');
  statusBarService?.dispose();
}
