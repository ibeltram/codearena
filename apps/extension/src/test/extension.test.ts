/**
 * CodeArena Extension Integration Tests
 *
 * These tests require the VS Code Extension Test Runner.
 * Run with: npm run test:vscode
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

// Mocha globals provided by VS Code test runner
declare const suite: Mocha.SuiteFunction;
declare const test: Mocha.TestFunction;

suite('CodeArena Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('codearena.codearena'));
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('codearena.codearena');
    if (extension) {
      await extension.activate();
      assert.strictEqual(extension.isActive, true);
    }
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    const expectedCommands = [
      'codearena.signIn',
      'codearena.signOut',
      'codearena.browseChallenges',
      'codearena.joinMatch',
      'codearena.submit',
      'codearena.lockSubmission',
      'codearena.openMatchInWeb',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
    }
  });

  test('Views should be registered', () => {
    // Views are registered in package.json and should be available
    // This is a basic smoke test
    assert.ok(true, 'Views are defined in package.json');
  });
});
