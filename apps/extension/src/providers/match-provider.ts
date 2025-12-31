import * as vscode from 'vscode';
import { Match, MatchStatus, MatchParticipant } from '../types';

/**
 * Tree item representing match information
 */
class MatchInfoItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    icon?: string,
    command?: vscode.Command
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }
    if (command) {
      this.command = command;
    }
  }
}

/**
 * Tree item representing a participant
 */
class ParticipantItem extends vscode.TreeItem {
  constructor(participant: MatchParticipant, isCurrentUser: boolean) {
    super(
      isCurrentUser ? `${participant.username} (You)` : participant.username,
      vscode.TreeItemCollapsibleState.None
    );

    this.description = this.getStatusDescription(participant);
    this.iconPath = new vscode.ThemeIcon(participant.hasLocked ? 'lock' : 'person');
    this.contextValue = 'participant';
  }

  private getStatusDescription(participant: MatchParticipant): string {
    if (participant.hasLocked) {
      return 'Locked';
    }
    if (participant.hasSubmitted) {
      return 'Submitted';
    }
    if (participant.readyAt) {
      return 'Ready';
    }
    return 'Waiting';
  }
}

/**
 * Provides data for the Active Match tree view
 */
export class MatchProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private match: Match | null = null;
  private currentUserId: string | null = null;
  private timeRemaining: number = 0; // in seconds

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setMatch(match: Match | null): void {
    this.match = match;
    this.refresh();
  }

  setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
  }

  setTimeRemaining(seconds: number): void {
    this.timeRemaining = seconds;
    this.refresh();
  }

  getMatch(): Match | null {
    return this.match;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (!this.match) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Root level - show match overview
      const items: vscode.TreeItem[] = [];

      // Challenge info
      items.push(
        new MatchInfoItem(
          this.match.challengeTitle,
          'Challenge',
          'code',
          {
            command: 'codearena.openMatchInWeb',
            title: 'Open in Browser',
          }
        )
      );

      // Status
      items.push(
        new MatchInfoItem(
          this.getStatusLabel(this.match.status),
          'Status',
          this.getStatusIcon(this.match.status)
        )
      );

      // Timer (if in progress)
      if (this.match.status === 'in_progress' && this.timeRemaining > 0) {
        items.push(
          new MatchInfoItem(
            this.formatTime(this.timeRemaining),
            'Time Remaining',
            this.timeRemaining < 300 ? 'warning' : 'clock'
          )
        );
      }

      // Stake
      items.push(
        new MatchInfoItem(
          `${this.match.stakeAmount} credits`,
          'Stake',
          'credit-card'
        )
      );

      // Participants section header
      const participantsHeader = new vscode.TreeItem(
        'Participants',
        vscode.TreeItemCollapsibleState.Expanded
      );
      participantsHeader.iconPath = new vscode.ThemeIcon('people');
      items.push(participantsHeader);

      // Submission status
      if (this.match.mySubmission) {
        const submissionStatus = this.match.mySubmission.lockedAt
          ? 'Locked'
          : 'Submitted (not locked)';
        items.push(
          new MatchInfoItem(
            submissionStatus,
            'Your Submission',
            this.match.mySubmission.lockedAt ? 'lock' : 'cloud-upload'
          )
        );
      }

      // Action buttons (as tree items with commands)
      if (this.match.status === 'in_progress') {
        if (!this.match.mySubmission) {
          const submitItem = new MatchInfoItem('Submit Code', 'Click to submit', 'cloud-upload', {
            command: 'codearena.submit',
            title: 'Submit',
          });
          items.push(submitItem);
        } else if (!this.match.mySubmission.lockedAt) {
          const lockItem = new MatchInfoItem('Lock Submission', 'Click to lock', 'lock', {
            command: 'codearena.lockSubmission',
            title: 'Lock Submission',
          });
          items.push(lockItem);
        }
      }

      return Promise.resolve(items);
    }

    // Children of Participants header
    if (element.label === 'Participants') {
      return Promise.resolve(
        this.match.participants.map(
          (p) => new ParticipantItem(p, p.userId === this.currentUserId)
        )
      );
    }

    return Promise.resolve([]);
  }

  private getStatusLabel(status: MatchStatus): string {
    const labels: Record<MatchStatus, string> = {
      created: 'Created',
      open: 'Waiting for Opponent',
      matched: 'Matched - Get Ready',
      in_progress: 'In Progress',
      submission_locked: 'Submissions Locked',
      judging: 'Judging in Progress',
      finalized: 'Complete',
      archived: 'Archived',
    };
    return labels[status] || status;
  }

  private getStatusIcon(status: MatchStatus): string {
    const icons: Record<MatchStatus, string> = {
      created: 'circle-outline',
      open: 'search',
      matched: 'check',
      in_progress: 'play',
      submission_locked: 'lock',
      judging: 'loading~spin',
      finalized: 'pass',
      archived: 'archive',
    };
    return icons[status] || 'circle-outline';
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
}
