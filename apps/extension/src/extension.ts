import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.info('CodeArena extension is now active!');

  // Register commands
  const signIn = vscode.commands.registerCommand('codearena.signIn', () => {
    vscode.window.showInformationMessage('CodeArena: Sign In - Not yet implemented');
  });

  const signOut = vscode.commands.registerCommand('codearena.signOut', () => {
    vscode.window.showInformationMessage('CodeArena: Sign Out - Not yet implemented');
  });

  const browseChallenges = vscode.commands.registerCommand('codearena.browseChallenges', () => {
    vscode.window.showInformationMessage('CodeArena: Browse Challenges - Not yet implemented');
  });

  const joinMatch = vscode.commands.registerCommand('codearena.joinMatch', () => {
    vscode.window.showInformationMessage('CodeArena: Join Match - Not yet implemented');
  });

  const submit = vscode.commands.registerCommand('codearena.submit', () => {
    vscode.window.showInformationMessage('CodeArena: Submit - Not yet implemented');
  });

  const lockSubmission = vscode.commands.registerCommand('codearena.lockSubmission', () => {
    vscode.window.showInformationMessage('CodeArena: Lock Submission - Not yet implemented');
  });

  const openMatchInWeb = vscode.commands.registerCommand('codearena.openMatchInWeb', () => {
    vscode.window.showInformationMessage('CodeArena: Open Match in Web - Not yet implemented');
  });

  context.subscriptions.push(
    signIn,
    signOut,
    browseChallenges,
    joinMatch,
    submit,
    lockSubmission,
    openMatchInWeb
  );
}

export function deactivate() {
  console.info('CodeArena extension is now deactivated.');
}
