import * as vscode from 'vscode';
import { ChallengesProvider, MatchProvider, HistoryProvider } from './providers';
import { StatusBarService, AuthService, MatchService, SubmissionService, SubmissionSummary } from './services';
import { ActiveMatchPanel, SubmissionPanel } from './panels';
import { Challenge, MatchHistoryItem, ExtensionConfig } from './types';

// Global providers and services
let challengesProvider: ChallengesProvider;
let matchProvider: MatchProvider;
let historyProvider: HistoryProvider;
let statusBarService: StatusBarService;
let authService: AuthService;
let matchService: MatchService;
let submissionService: SubmissionService;

// Extension state
let isAuthenticated = false;
let currentUserId: string | null = null;

/**
 * Fetch match history from API
 */
async function fetchMatchHistory(): Promise<void> {
  if (!currentUserId) {
    historyProvider.setMatches([]);
    return;
  }

  historyProvider.setLoading(true);

  try {
    const config = getConfig();
    const token = await authService.getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${config.apiUrl}/api/users/${currentUserId}/matches?limit=50`, {
      headers,
    });

    if (response.ok) {
      const data = (await response.json()) as {
        data?: Array<{
          id: string;
          status: string;
          mode: string;
          challenge: {
            title: string;
            category: string;
            slug: string;
          };
          opponent?: {
            id: string;
            displayName: string;
            avatarUrl: string | null;
          };
          userScore: number | null;
          opponentScore: number | null;
          result: 'win' | 'loss' | 'draw' | 'pending';
          startAt: string | null;
          endAt: string | null;
          createdAt: string;
        }>;
      };

      // Map API response to MatchHistoryItem type
      const matches: MatchHistoryItem[] = (data.data || []).map((m) => ({
        id: m.id,
        challengeTitle: m.challenge.title,
        category: m.challenge.category as MatchHistoryItem['category'],
        difficulty: 'medium' as MatchHistoryItem['difficulty'], // API doesn't return difficulty in history
        opponentUsername: m.opponent?.displayName || 'Unknown',
        result: m.result === 'pending' ? 'in_progress' : m.result,
        score: m.userScore ?? undefined,
        opponentScore: m.opponentScore ?? undefined,
        completedAt: m.endAt ?? undefined,
      }));

      historyProvider.setMatches(matches);
    } else {
      historyProvider.setError('Failed to load match history');
    }
  } catch (error) {
    console.error('Failed to fetch match history:', error);
    historyProvider.setError('Network error - check connection');
  } finally {
    historyProvider.setLoading(false);
  }
}

/**
 * Get extension configuration
 */
function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('reporivals');
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
  const signIn = vscode.commands.registerCommand('reporivals.signIn', async () => {
    if (isAuthenticated) {
      vscode.window.showInformationMessage('RepoRivals: You are already signed in.');
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

      // Refresh challenges and match history
      vscode.commands.executeCommand('reporivals.refreshChallenges');
      fetchMatchHistory();
    }
  });

  // Sign Out - Now uses AuthService
  const signOut = vscode.commands.registerCommand('reporivals.signOut', async () => {
    if (!isAuthenticated) {
      vscode.window.showInformationMessage('RepoRivals: You are not signed in.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to sign out of RepoRivals?',
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

      vscode.window.showInformationMessage('RepoRivals: You have been signed out.');
    }
  });

  // Show Auth Status - New command for account options
  const showAuthStatus = vscode.commands.registerCommand('reporivals.showAuthStatus', async () => {
    const tokens = await authService.getStoredTokens();
    if (!tokens) {
      vscode.window.showInformationMessage('RepoRivals: Not signed in.');
      return;
    }

    const action = await vscode.window.showQuickPick(
      [
        {
          label: `$(account) ${tokens.userDisplayName}`,
          description: tokens.userEmail,
          detail: 'Currently signed in',
        },
        { label: '$(sign-out) Sign Out', description: 'Sign out of RepoRivals' },
        { label: '$(globe) View Profile', description: 'Open your profile in browser' },
      ],
      { title: 'RepoRivals Account' }
    );

    if (action?.label.includes('Sign Out')) {
      vscode.commands.executeCommand('reporivals.signOut');
    } else if (action?.label.includes('View Profile')) {
      const config = getConfig();
      vscode.env.openExternal(vscode.Uri.parse(`${config.webUrl}/profile/${tokens.userId}`));
    }
  });

  // Browse Challenges
  const browseChallenges = vscode.commands.registerCommand('reporivals.browseChallenges', () => {
    // Focus the challenges view
    vscode.commands.executeCommand('reporivals-challenges.focus');
  });

  // Show Challenge Details
  const showChallengeDetails = vscode.commands.registerCommand(
    'reporivals.showChallengeDetails',
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
        vscode.commands.executeCommand('reporivals.joinMatch', challenge);
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
    'reporivals.joinMatch',
    async (challenge?: Challenge) => {
      if (!isAuthenticated) {
        const action = await vscode.window.showWarningMessage(
          'RepoRivals: You need to sign in to join a match.',
          'Sign In'
        );
        if (action === 'Sign In') {
          vscode.commands.executeCommand('reporivals.signIn');
        }
        return;
      }

      if (!challenge) {
        vscode.window.showInformationMessage(
          'RepoRivals: Please select a challenge from the Challenges view.'
        );
        return;
      }

      // Check if already in a match
      if (matchService.getCurrentMatch()) {
        const action = await vscode.window.showWarningMessage(
          'RepoRivals: You already have an active match. Would you like to view it?',
          'View Match',
          'Cancel'
        );
        if (action === 'View Match') {
          vscode.commands.executeCommand('reporivals.showActiveMatchPanel');
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
            title: `RepoRivals: Joining match for ${challenge.title}...`,
            cancellable: false,
          },
          async () => {
            const match = await matchService.joinMatch(challenge.id);
            if (match) {
              // Update context for command visibility
              await vscode.commands.executeCommand('setContext', 'reporivals.hasActiveMatch', true);

              // Show the active match panel
              vscode.commands.executeCommand('reporivals.showActiveMatchPanel');

              vscode.window.showInformationMessage(
                `RepoRivals: Joined match! ${match.status === 'open' ? 'Waiting for opponent...' : 'Match found!'}`
              );
            }
          }
        );
      }
    }
  );

  // Submit
  const submit = vscode.commands.registerCommand('reporivals.submit', async () => {
    const match = matchProvider.getMatch();
    if (!match || match.status !== 'in_progress') {
      vscode.window.showWarningMessage('RepoRivals: No active match to submit to.');
      return;
    }

    // Check if submission is locked
    if (match.mySubmission?.lockedAt) {
      const lockedTime = new Date(match.mySubmission.lockedAt).toLocaleString();
      vscode.window.showWarningMessage(
        `RepoRivals: Your submission was locked at ${lockedTime}. You cannot submit again.`
      );
      return;
    }

    // Get workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('RepoRivals: Please open a workspace folder first.');
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

    // Current submission summary for the panel
    let currentSummary: SubmissionSummary | null = null;

    try {
      // Scan workspace for files
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'RepoRivals: Scanning workspace...',
          cancellable: false,
        },
        async () => {
          currentSummary = await submissionService.scanWorkspace(targetFolder.uri.fsPath);
        }
      );

      // Wait for scan to complete
      currentSummary = await submissionService.scanWorkspace(targetFolder.uri.fsPath);

      // Show the submission panel with file preview
      SubmissionPanel.createOrShow(
        context.extensionUri,
        match.id,
        currentSummary,
        {
          onSubmit: async (summary) => {
            try {
              // Show progress in the panel
              const progressListener = submissionService.onProgressUpdate((progress) => {
                if (SubmissionPanel.currentPanel) {
                  SubmissionPanel.currentPanel.setProgress(progress);
                }
              });

              const submissionId = await submissionService.uploadSubmission(match.id, summary);

              progressListener.dispose();

              if (submissionId) {
                vscode.window.showInformationMessage(
                  `RepoRivals: Submission complete! ${summary.files.filter((f) => !f.isExcluded).length} files uploaded.`
                );

                // Update context
                await vscode.commands.executeCommand('setContext', 'reporivals.hasSubmitted', true);

                // Close the panel after success
                if (SubmissionPanel.currentPanel) {
                  SubmissionPanel.currentPanel.dispose();
                }
              }
            } catch (error) {
              vscode.window.showErrorMessage(
                `RepoRivals: Submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          },
          onToggleFile: (relativePath) => {
            if (currentSummary) {
              currentSummary = submissionService.toggleFileExclusion(currentSummary, relativePath);
              if (SubmissionPanel.currentPanel) {
                SubmissionPanel.currentPanel.setSummary(currentSummary, match.id);
              }
            }
          },
          onCancel: () => {
            // Nothing to do, panel will close itself
          },
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `RepoRivals: Failed to scan workspace: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Lock Submission
  const lockSubmission = vscode.commands.registerCommand('reporivals.lockSubmission', async () => {
    const match = matchProvider.getMatch();

    // Check if there's an active match
    if (!match) {
      vscode.window.showWarningMessage('RepoRivals: No active match.');
      return;
    }

    // Check if match is in progress
    if (match.status !== 'in_progress') {
      vscode.window.showWarningMessage('RepoRivals: Match is not in progress.');
      return;
    }

    // Check if there's a submission to lock
    if (!match.mySubmission) {
      vscode.window.showWarningMessage('RepoRivals: You need to submit first before locking.');
      return;
    }

    // Check if already locked
    if (match.mySubmission.lockedAt) {
      const lockedTime = new Date(match.mySubmission.lockedAt).toLocaleString();
      vscode.window.showInformationMessage(`RepoRivals: Your submission was locked at ${lockedTime}.`);
      return;
    }

    // Show confirmation dialog with strong warning
    const confirm = await vscode.window.showWarningMessage(
      '⚠️ Lock Submission?\n\n' +
        'This action is PERMANENT and cannot be undone.\n\n' +
        '• You will NOT be able to submit again\n' +
        '• Your current submission will be final\n' +
        '• This signals you are done coding\n\n' +
        'Are you sure you want to lock your submission?',
      { modal: true },
      'Lock Submission',
      'Cancel'
    );

    if (confirm === 'Lock Submission') {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'RepoRivals: Locking submission...',
            cancellable: false,
          },
          async () => {
            const result = await matchService.lockSubmission(match.id);

            if (result?.lockedAt) {
              const lockedTime = new Date(result.lockedAt).toLocaleString();

              // Update context to disable submit command
              await vscode.commands.executeCommand('setContext', 'reporivals.isSubmissionLocked', true);

              // Update the active match panel if open
              if (ActiveMatchPanel.currentPanel) {
                const updatedMatch = matchService.getCurrentMatch();
                ActiveMatchPanel.currentPanel.setMatch(updatedMatch);
              }

              vscode.window.showInformationMessage(
                `RepoRivals: Submission locked at ${lockedTime}. Good luck! 🔒`
              );
            }
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `RepoRivals: Failed to lock submission: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  });

  // Open Match in Web
  const openMatchInWeb = vscode.commands.registerCommand('reporivals.openMatchInWeb', () => {
    const match = matchProvider.getMatch();
    if (!match) {
      vscode.window.showWarningMessage('RepoRivals: No active match.');
      return;
    }

    const config = getConfig();
    vscode.env.openExternal(vscode.Uri.parse(`${config.webUrl}/matches/${match.id}`));
  });

  // View Match Details (from history)
  const viewMatchDetails = vscode.commands.registerCommand(
    'reporivals.viewMatchDetails',
    (match: MatchHistoryItem) => {
      const config = getConfig();
      vscode.env.openExternal(vscode.Uri.parse(`${config.webUrl}/matches/${match.id}`));
    }
  );

  // Focus Match View
  const focusMatchView = vscode.commands.registerCommand('reporivals.focusMatchView', () => {
    vscode.commands.executeCommand('reporivals-match.focus');
  });

  // Refresh Challenges
  const refreshChallenges = vscode.commands.registerCommand('reporivals.refreshChallenges', async () => {
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
  const filterChallenges = vscode.commands.registerCommand('reporivals.filterChallenges', async () => {
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
    'reporivals.openChallengeInWeb',
    (challenge: Challenge) => {
      const config = getConfig();
      vscode.env.openExternal(
        vscode.Uri.parse(`${config.webUrl}/challenges/${challenge.slug}`)
      );
    }
  );

  // Toggle Challenge Grouping
  const toggleGrouping = vscode.commands.registerCommand('reporivals.toggleGrouping', () => {
    challengesProvider.toggleGroupByCategory();
  });

  // Refresh Match History
  const refreshHistory = vscode.commands.registerCommand('reporivals.refreshHistory', async () => {
    if (!isAuthenticated || !currentUserId) {
      vscode.window.showWarningMessage('RepoRivals: Please sign in to view match history.');
      return;
    }
    await fetchMatchHistory();
  });

  // Show Active Match Panel
  const showActiveMatchPanel = vscode.commands.registerCommand(
    'reporivals.showActiveMatchPanel',
    () => {
      const panel = ActiveMatchPanel.createOrShow(context.extensionUri);
      const match = matchService.getCurrentMatch();
      panel.setMatch(match);
      panel.setCurrentUserId(currentUserId);
    }
  );

  // Set Ready (for matched state)
  const setReady = vscode.commands.registerCommand('reporivals.setReady', async () => {
    const match = matchService.getCurrentMatch();
    if (!match || match.status !== 'matched') {
      vscode.window.showWarningMessage('RepoRivals: No match waiting for ready confirmation.');
      return;
    }

    const success = await matchService.setReady(match.id);
    if (success) {
      vscode.window.showInformationMessage('RepoRivals: You are ready! Waiting for opponent...');
    } else {
      vscode.window.showErrorMessage('RepoRivals: Failed to set ready status.');
    }
  });

  // Forfeit Match
  const forfeit = vscode.commands.registerCommand('reporivals.forfeit', async () => {
    const match = matchService.getCurrentMatch();
    if (!match) {
      vscode.window.showWarningMessage('RepoRivals: No active match to forfeit.');
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
        await vscode.commands.executeCommand('setContext', 'reporivals.hasActiveMatch', false);
        await vscode.commands.executeCommand('setContext', 'reporivals.hasSubmitted', false);
        statusBarService.hide();
        matchProvider.setMatch(null);
        vscode.window.showInformationMessage('RepoRivals: Match forfeited.');
      } else {
        vscode.window.showErrorMessage('RepoRivals: Failed to forfeit match.');
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
    refreshHistory,
    showActiveMatchPanel,
    setReady,
    forfeit
  );
}

/**
 * Set up context values for when clauses
 */
async function setupContext(): Promise<void> {
  await vscode.commands.executeCommand('setContext', 'reporivals.isAuthenticated', isAuthenticated);
  await vscode.commands.executeCommand('setContext', 'reporivals.hasActiveMatch', false);
  await vscode.commands.executeCommand('setContext', 'reporivals.hasSubmitted', false);
  await vscode.commands.executeCommand('setContext', 'reporivals.isSubmissionLocked', false);
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.info('RepoRivals extension is activating...');

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

  // Initialize submission service
  submissionService = new SubmissionService(
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
    vscode.commands.executeCommand('setContext', 'reporivals.hasActiveMatch', !!match);
    vscode.commands.executeCommand(
      'setContext',
      'reporivals.hasSubmitted',
      !!match?.mySubmission
    );
    vscode.commands.executeCommand(
      'setContext',
      'reporivals.isSubmissionLocked',
      !!match?.mySubmission?.lockedAt
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
      vscode.window.setStatusBarMessage('$(sync~spin) RepoRivals: Reconnecting...', 3000);
    }
  });

  // Register tree data providers
  const challengesView = vscode.window.createTreeView('reporivals-challenges', {
    treeDataProvider: challengesProvider,
    showCollapseAll: true,
  });

  const matchView = vscode.window.createTreeView('reporivals-match', {
    treeDataProvider: matchProvider,
  });

  const historyView = vscode.window.createTreeView('reporivals-history', {
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
      submissionService.dispose();
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
          // Refresh challenges and match history on successful auto-login
          vscode.commands.executeCommand('reporivals.refreshChallenges');
          fetchMatchHistory();
        }
      });
    }
  });

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('reporivals')) {
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

  console.info('RepoRivals extension activated!');
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.info('RepoRivals extension is deactivating...');
  statusBarService?.dispose();
  authService?.dispose();
  matchService?.dispose();
  submissionService?.dispose();
}
