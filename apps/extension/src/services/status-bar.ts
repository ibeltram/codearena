import * as vscode from 'vscode';
import { Match } from '../types';

/**
 * Manages the status bar item for displaying match timer and status
 */
export class StatusBarService {
  private statusBarItem: vscode.StatusBarItem;
  private timerInterval: NodeJS.Timeout | null = null;
  private match: Match | null = null;
  private endTime: Date | null = null;
  private warningShown = false;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'codearena.focusMatchView';
  }

  /**
   * Start tracking a match
   */
  setMatch(match: Match | null): void {
    this.match = match;
    this.warningShown = false;

    if (!match) {
      this.hide();
      this.stopTimer();
      return;
    }

    // Calculate end time if match is in progress
    if (match.status === 'in_progress' && match.startAt) {
      const startTime = new Date(match.startAt);
      this.endTime = new Date(startTime.getTime() + match.timeLimit * 60 * 1000);
      this.startTimer();
    } else {
      this.endTime = null;
      this.stopTimer();
    }

    this.updateDisplay();
    this.show();
  }

  /**
   * Update the status bar display
   */
  private updateDisplay(): void {
    if (!this.match) {
      return;
    }

    const config = vscode.workspace.getConfiguration('codearena');
    const showTimer = config.get<boolean>('showTimerInStatusBar', true);

    if (!showTimer) {
      this.hide();
      return;
    }

    const { text, tooltip, backgroundColor } = this.getDisplayInfo();
    this.statusBarItem.text = text;
    this.statusBarItem.tooltip = tooltip;
    this.statusBarItem.backgroundColor = backgroundColor;
  }

  private getDisplayInfo(): {
    text: string;
    tooltip: string;
    backgroundColor: vscode.ThemeColor | undefined;
  } {
    if (!this.match) {
      return { text: '', tooltip: '', backgroundColor: undefined };
    }

    const icon = '$(code)';
    let text: string;
    let tooltip: string;
    let backgroundColor: vscode.ThemeColor | undefined;

    switch (this.match.status) {
      case 'open':
        text = `${icon} CodeArena: Waiting for opponent...`;
        tooltip = 'Waiting for an opponent to join the match';
        break;

      case 'matched':
        text = `${icon} CodeArena: Matched! Get ready`;
        tooltip = 'Opponent found! Match is about to start';
        backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;

      case 'in_progress':
        if (this.endTime) {
          const remaining = this.getTimeRemaining();
          const timeStr = this.formatTime(remaining);
          text = `${icon} ${timeStr}`;
          tooltip = `Time remaining: ${timeStr}\nChallenge: ${this.match.challengeTitle}\nClick to focus match view`;

          // Warning colors when time is low
          const warningMinutes = vscode.workspace
            .getConfiguration('codearena')
            .get<number>('timerWarningMinutes', 5);

          if (remaining <= warningMinutes * 60) {
            backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

            // Show warning notification once
            if (!this.warningShown && remaining <= warningMinutes * 60 && remaining > 0) {
              this.warningShown = true;
              vscode.window.showWarningMessage(
                `CodeArena: Only ${Math.ceil(remaining / 60)} minutes remaining!`,
                'Submit Now'
              ).then((action) => {
                if (action === 'Submit Now') {
                  vscode.commands.executeCommand('codearena.submit');
                }
              });
            }
          }
        } else {
          text = `${icon} CodeArena: In Progress`;
          tooltip = `Match in progress\nChallenge: ${this.match.challengeTitle}`;
        }
        break;

      case 'submission_locked':
        text = `${icon} CodeArena: Locked`;
        tooltip = 'Submissions are locked. Waiting for judging...';
        break;

      case 'judging':
        text = `${icon} CodeArena: Judging...`;
        tooltip = 'Your submission is being judged';
        break;

      case 'finalized':
        text = `${icon} CodeArena: Complete`;
        tooltip = 'Match complete! Click to view results';
        break;

      default:
        text = `${icon} CodeArena`;
        tooltip = 'CodeArena match active';
    }

    return { text, tooltip, backgroundColor };
  }

  private getTimeRemaining(): number {
    if (!this.endTime) {
      return 0;
    }
    const now = new Date();
    const remaining = Math.max(0, Math.floor((this.endTime.getTime() - now.getTime()) / 1000));
    return remaining;
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.updateDisplay();

      // Check if time has expired
      const remaining = this.getTimeRemaining();
      if (remaining <= 0) {
        this.stopTimer();
        this.onTimeExpired();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private onTimeExpired(): void {
    const config = vscode.workspace.getConfiguration('codearena');
    const autoSubmit = config.get<boolean>('autoSubmit', false);

    if (autoSubmit && this.match && !this.match.mySubmission) {
      vscode.window.showInformationMessage(
        'CodeArena: Time expired! Auto-submitting your code...'
      );
      vscode.commands.executeCommand('codearena.submit');
    } else {
      vscode.window.showWarningMessage(
        'CodeArena: Time has expired!',
        'View Match'
      ).then((action) => {
        if (action === 'View Match') {
          vscode.commands.executeCommand('codearena.focusMatchView');
        }
      });
    }
  }

  show(): void {
    this.statusBarItem.show();
  }

  hide(): void {
    this.statusBarItem.hide();
  }

  dispose(): void {
    this.stopTimer();
    this.statusBarItem.dispose();
  }
}
