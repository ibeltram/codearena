import { WebviewCommand } from '../types/messages';

// Singleton VS Code API instance
let vscodeApi: ReturnType<typeof acquireVsCodeApi> | null = null;

/**
 * Get the VS Code API instance (singleton)
 */
function getVSCodeApi() {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

/**
 * Hook for sending messages to the extension
 */
export function useVSCodeMessaging() {
  const vscode = getVSCodeApi();

  /**
   * Send a command to the extension
   */
  const sendCommand = (command: WebviewCommand) => {
    vscode.postMessage(command);
  };

  // Auth commands
  const signIn = () => sendCommand({ command: 'signIn' });
  const signOut = () => sendCommand({ command: 'signOut' });

  // Challenge commands
  const refreshChallenges = () => sendCommand({ command: 'refreshChallenges' });
  const filterChallenges = (category: string | null) =>
    sendCommand({ command: 'filterChallenges', category });
  const joinMatch = (challengeId: string) =>
    sendCommand({ command: 'joinMatch', challengeId });
  const openChallengeInWeb = (challengeSlug: string) =>
    sendCommand({ command: 'openChallengeInWeb', challengeSlug });

  // Match commands
  const submit = () => sendCommand({ command: 'submit' });
  const lockSubmission = () => sendCommand({ command: 'lockSubmission' });
  const setReady = () => sendCommand({ command: 'setReady' });
  const forfeit = () => sendCommand({ command: 'forfeit' });
  const openMatchInWeb = () => sendCommand({ command: 'openMatchInWeb' });

  // History commands
  const refreshHistory = () => sendCommand({ command: 'refreshHistory' });
  const viewMatchDetails = (matchId: string) =>
    sendCommand({ command: 'viewMatchDetails', matchId });

  // State persistence
  const getState = <T>(): T | undefined => vscode.getState() as T | undefined;
  const setState = <T>(state: T) => vscode.setState(state);

  return {
    // Raw command sender
    sendCommand,

    // Auth
    signIn,
    signOut,

    // Challenges
    refreshChallenges,
    filterChallenges,
    joinMatch,
    openChallengeInWeb,

    // Match
    submit,
    lockSubmission,
    setReady,
    forfeit,
    openMatchInWeb,

    // History
    refreshHistory,
    viewMatchDetails,

    // State
    getState,
    setState,
  };
}

export default useVSCodeMessaging;
