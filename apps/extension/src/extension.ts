import * as vscode from 'vscode';
import { ChallengesProvider, MatchProvider, HistoryProvider } from './providers';
import { StatusBarService, AuthService, MatchService } from './services';
import { ActiveMatchPanel } from './panels/active-match-panel';
import { Challenge, MatchHistoryItem, ExtensionConfig } from './types';

// Global providers and services
let challengesProvider: ChallengesProvider;
let matchProvider: MatchProvider;
let historyProvider: HistoryProvider;
let statusBarService: StatusBarService;
let authService: AuthService;
let matchService: MatchService;

// Extension state
let isAuthenticated = false;
let currentUserId: string | null = null;

/**
 * Get extension configuration
 */
function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('codearena');
  return {
    apiUrl: config.get<string>('apiUrl', 'http://localhost:3002'),
    webUrl: config.get<string>('webUrl', 'http://localhost:3001'),
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
  // Sign In - Now uses AuthService device code flow
  const signIn = vscode.commands.registerCommand('codearena.signIn', async () => {
    if (isAuthenticated) {
      vscode.window.showInformationMessage('CodeArena: You are already signed in.');
      return;
    }

    // Start device code authentication flow
    const success = await authService.startDeviceCodeFlow();

    if (success) {
      isAuthenticated = true;
      const tokens = await authService.getStoredTokens();
      if (tokens) {
        currentUserId = tokens.userId;
        matchProvider.setCurrentUserId(currentUserId);
      }

      // Refresh challenges
      vscode.commands.executeCommand('codearena.refreshChallenges');
    }
  });

  // Sign Out - Now uses AuthService
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
      // Sign out via auth service
      await authService.signOut();

      isAuthenticated = false;
      currentUserId = null;

      // Clear providers
      challengesProvider.setChallenges([]);
      matchProvider.setMatch(null);
      matchProvider.setCurrentUserId(null);
      historyProvider.setMatches([]);
      statusBarService.hide();

      vscode.window.showInformationMessage('CodeArena: You have been signed out.');
    }
  });

  // Show Auth Status - New command for account options
  const showAuthStatus = vscode.commands.registerCommand('codearena.showAuthStatus', async () => {
    const tokens = await authService.getStoredTokens();
    if (!tokens) {
      vscode.window.showInformationMessage('CodeArena: Not signed in.');
      return;
    }

    const action = await vscode.window.showQuickPick(
      [
        {
          label: `$(account) ${tokens.userDisplayName}`,
          description: tokens.userEmail,
          detail: 'Currently signed in',
        },
        { label: '$(sign-out) Sign Out', description: 'Sign out of CodeArena' },
        { label: '$(globe) View Profile', description: 'Open your profile in browser' },
      ],
      { title: 'CodeArena Account' }
    );

    if (action?.label.includes('Sign Out')) {
      vscode.commands.executeCommand('codearena.signOut');
    } else if (action?.label.includes('View Profile')) {
      const config = getConfig();
      vscode.env.openExternal(vscode.Uri.parse(`${config.webUrl}/profile/${tokens.userId}`));
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

      // Check if already in a match
      if (matchService.getCurrentMatch()) {
        const action = await vscode.window.showWarningMessage(
          'CodeArena: You already have an active match. Would you like to view it?',
          'View Match',
          'Cancel'
        );
        if (action === 'View Match') {
          vscode.commands.executeCommand('codearena.showActiveMatchPanel');
        }
        return;
      }

      // Confirm match join
      const confirm = await vscode.window.showWarningMessage(
        `Join match for "${challenge.title}"?\n\nStake: ${challenge.stakeAmount} credits\nTime limit: ${challenge.timeLimit} minutes`,
        { modal: true },
        'Join Match'
      );

      if (confirm === 'Join Match') {
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `CodeArena: Joining match for ${challenge.title}...`,
            cancellable: false,
          },
          async () => {
            const match = await matchService.joinMatch(challenge.id);
            if (match) {
              // Update context for command visibility
              await vscode.commands.executeCommand('setContext', 'codearena.hasActiveMatch', true);

              // Show the active match panel
              vscode.commands.executeCommand('codearena.showActiveMatchPanel');

              vscode.window.showInformationMessage(
                `CodeArena: Joined match! ${match.status === 'open' ? 'Waiting for opponent...' : 'Match found!'}`
              );
            }
          }
        );
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
  const refreshChallenges = vscode.commands.registerCommand('codearena.refreshChallenges', async () => {
    challengesProvider.setLoading(true);

    try {
      const config = getConfig();
      const token = await authService.getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${config.apiUrl}/api/challenges`, { headers });

      if (response.ok) {
        const data = (await response.json()) as { challenges?: any[] };
        // Map API response to Challenge type
        const challenges = (data.challenges || []).map((c: any) => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          description: c.description || '',
          category: c.category,
          difficulty: c.difficulty,
          timeLimit: c.timeLimit || c.time_limit || 60,
          stakeAmount: c.stakeAmount || c.stake_amount || 100,
          hasTemplate: c.hasTemplate || c.has_template || false,
          isPublished: c.isPublished ?? c.is_published ?? true,
        }));
        challengesProvider.setChallenges(challenges);
      } else {
        challengesProvider.setError('Failed to load challenges');
      }
    } catch (error) {
      console.error('Failed to fetch challenges:', error);
      challengesProvider.setError('Network error - check connection');
    } finally {
      challengesProvider.setLoading(false);
    }
  });

  // Filter Challenges by Category
  const filterChallenges = vscode.commands.registerCommand('codearena.filterChallenges', async () => {
    const currentFilter = challengesProvider.getCategoryFilter();
    const categories = [
      { label: '$(list-flat) All Categories', category: null, picked: currentFilter === null },
      { label: '$(browser) Frontend', category: 'frontend' as const, picked: currentFilter === 'frontend' },
      { label: '$(server) Backend', category: 'backend' as const, picked: currentFilter === 'backend' },
      { label: '$(layers) Full Stack', category: 'fullstack' as const, picked: currentFilter === 'fullstack' },
      { label: '$(symbol-method) Algorithm', category: 'algorithm' as const, picked: currentFilter === 'algorithm' },
      { label: '$(cloud) DevOps', category: 'devops' as const, picked: currentFilter === 'devops' },
    ];

    const selection = await vscode.window.showQuickPick(categories, {
      title: 'Filter Challenges by Category',
      placeHolder: currentFilter ? `Currently: ${currentFilter}` : 'Select a category to filter',
    });

    if (selection !== undefined) {
      challengesProvider.setCategoryFilter(selection.category);
    }
  });

  // Open Challenge in Web
  const openChallengeInWeb = vscode.commands.registerCommand(
    'codearena.openChallengeInWeb',
    (challenge: Challenge) => {
      const config = getConfig();
      vscode.env.openExternal(
        vscode.Uri.parse(`${config.webUrl}/challenges/${challenge.slug}`)
      );
    }
  );

  // Toggle Challenge Grouping
  const toggleGrouping = vscode.commands.registerCommand('codearena.toggleGrouping', () => {
    challengesProvider.toggleGroupByCategory();
  });

  // Show Active Match Panel
  const showActiveMatchPanel = vscode.commands.registerCommand(
    'codearena.showActiveMatchPanel',
    () => {
      const panel = ActiveMatchPanel.createOrShow(context.extensionUri);
      const match = matchService.getCurrentMatch();
      panel.setMatch(match);
      panel.setCurrentUserId(currentUserId);
    }
  );

  // Set Ready (for matched state)
  const setReady = vscode.commands.registerCommand('codearena.setReady', async () => {
    const match = matchService.getCurrentMatch();
    if (!match || match.status !== 'matched') {
      vscode.window.showWarningMessage('CodeArena: No match waiting for ready confirmation.');
      return;
    }

    const success = await matchService.setReady(match.id);
    if (success) {
      vscode.window.showInformationMessage('CodeArena: You are ready! Waiting for opponent...');
    } else {
      vscode.window.showErrorMessage('CodeArena: Failed to set ready status.');
    }
  });

  // Forfeit Match
  const forfeit = vscode.commands.registerCommand('codearena.forfeit', async () => {
    const match = matchService.getCurrentMatch();
    if (!match) {
      vscode.window.showWarningMessage('CodeArena: No active match to forfeit.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to forfeit this match?\n\nYou will lose your stake credits.',
      { modal: true },
      'Forfeit'
    );

    if (confirm === 'Forfeit') {
      const success = await matchService.forfeit(match.id);
      if (success) {
        await vscode.commands.executeCommand('setContext', 'codearena.hasActiveMatch', false);
        await vscode.commands.executeCommand('setContext', 'codearena.hasSubmitted', false);
        statusBarService.hide();
        matchProvider.setMatch(null);
        vscode.window.showInformationMessage('CodeArena: Match forfeited.');
      } else {
        vscode.window.showErrorMessage('CodeArena: Failed to forfeit match.');
      }
    }
  });

  context.subscriptions.push(
    signIn,
    signOut,
    showAuthStatus,
    browseChallenges,
    showChallengeDetails,
    joinMatch,
    submit,
    lockSubmission,
    openMatchInWeb,
    viewMatchDetails,
    focusMatchView,
    refreshChallenges,
    filterChallenges,
    openChallengeInWeb,
    toggleGrouping,
    showActiveMatchPanel,
    setReady,
    forfeit
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

  // Initialize providers and services
  challengesProvider = new ChallengesProvider();
  matchProvider = new MatchProvider();
  historyProvider = new HistoryProvider();
  statusBarService = new StatusBarService();
  authService = new AuthService(context);

  // Initialize match service with auth token getter and config getter
  matchService = new MatchService(
    () => authService.getAccessToken(),
    getConfig
  );

  // Listen for match updates from the service
  matchService.onMatchUpdate((match) => {
    matchProvider.setMatch(match);
    statusBarService.setMatch(match);

    // Update the webview panel if it exists
    if (ActiveMatchPanel.currentPanel) {
      ActiveMatchPanel.currentPanel.setMatch(match);
    }

    // Update context values
    vscode.commands.executeCommand('setContext', 'codearena.hasActiveMatch', !!match);
    vscode.commands.executeCommand(
      'setContext',
      'codearena.hasSubmitted',
      !!match?.mySubmission
    );
  });

  // Listen for timer ticks
  matchService.onTimerTick((remaining) => {
    matchProvider.setTimeRemaining(remaining);

    if (ActiveMatchPanel.currentPanel) {
      ActiveMatchPanel.currentPanel.setTimeRemaining(remaining);
    }
  });

  // Listen for connection state changes
  matchService.onConnectionStateChange((state) => {
    if (ActiveMatchPanel.currentPanel) {
      ActiveMatchPanel.currentPanel.setConnectionState(state);
    }

    if (state === 'reconnecting') {
      vscode.window.setStatusBarMessage('$(sync~spin) CodeArena: Reconnecting...', 3000);
    }
  });

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

  // Add services to subscriptions for disposal
  context.subscriptions.push({
    dispose: () => {
      statusBarService.dispose();
      authService.dispose();
      matchService.dispose();
    },
  });

  // Initialize auth service and check for existing session
  authService.initialize().then((authenticated) => {
    if (authenticated) {
      isAuthenticated = true;
      authService.getStoredTokens().then((tokens) => {
        if (tokens) {
          currentUserId = tokens.userId;
          matchProvider.setCurrentUserId(currentUserId);
          // Refresh challenges on successful auto-login
          vscode.commands.executeCommand('codearena.refreshChallenges');
        }
      });
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
  authService?.dispose();
  matchService?.dispose();
}
