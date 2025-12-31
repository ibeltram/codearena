import * as vscode from 'vscode';
import { MatchHistoryItem } from '../types';

/**
 * Tree item representing a match in history
 */
export class HistoryMatchItem extends vscode.TreeItem {
  constructor(
    public readonly match: MatchHistoryItem,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(match.challengeTitle, collapsibleState);

    this.id = match.id;
    this.tooltip = this.createTooltip();
    this.description = this.createDescription();
    this.iconPath = this.getIcon();
    this.contextValue = 'historyMatch';

    // Command to view match details in browser
    this.command = {
      command: 'codearena.viewMatchDetails',
      title: 'View Match Details',
      arguments: [match],
    };
  }

  private createTooltip(): string {
    const lines = [
      this.match.challengeTitle,
      `vs ${this.match.opponentUsername}`,
      `Result: ${this.getResultText()}`,
    ];

    if (this.match.score !== undefined && this.match.opponentScore !== undefined) {
      lines.push(`Score: ${this.match.score} - ${this.match.opponentScore}`);
    }

    if (this.match.creditsWon) {
      lines.push(`Credits won: +${this.match.creditsWon}`);
    } else if (this.match.creditsLost) {
      lines.push(`Credits lost: -${this.match.creditsLost}`);
    }

    if (this.match.completedAt) {
      lines.push(`Completed: ${this.formatDate(this.match.completedAt)}`);
    }

    return lines.join('\n');
  }

  private createDescription(): string {
    const resultEmoji = {
      win: '!',
      loss: 'X',
      draw: '=',
      in_progress: '...',
    }[this.match.result];

    const date = this.match.completedAt
      ? this.formatRelativeDate(this.match.completedAt)
      : 'In progress';

    return `${resultEmoji} vs ${this.match.opponentUsername} | ${date}`;
  }

  private getIcon(): vscode.ThemeIcon {
    const icons: Record<string, string> = {
      win: 'pass',
      loss: 'error',
      draw: 'dash',
      in_progress: 'sync~spin',
    };
    const colors: Record<string, vscode.ThemeColor | undefined> = {
      win: new vscode.ThemeColor('testing.iconPassed'),
      loss: new vscode.ThemeColor('testing.iconFailed'),
      draw: undefined,
      in_progress: undefined,
    };
    return new vscode.ThemeIcon(
      icons[this.match.result] || 'circle-outline',
      colors[this.match.result]
    );
  }

  private getResultText(): string {
    return {
      win: 'Victory',
      loss: 'Defeat',
      draw: 'Draw',
      in_progress: 'In Progress',
    }[this.match.result];
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  private formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
      return this.formatDate(dateStr);
    }
  }
}

/**
 * Provides data for the Match History tree view
 */
export class HistoryProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private matches: MatchHistoryItem[] = [];
  private isLoading = false;
  private error: string | null = null;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.refresh();
  }

  setError(error: string | null): void {
    this.error = error;
    this.refresh();
  }

  setMatches(matches: MatchHistoryItem[]): void {
    this.matches = matches;
    this.error = null;
    this.refresh();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (element) {
      // No children for history items
      return Promise.resolve([]);
    }

    if (this.isLoading) {
      return Promise.resolve([
        new vscode.TreeItem('Loading history...', vscode.TreeItemCollapsibleState.None),
      ]);
    }

    if (this.error) {
      const errorItem = new vscode.TreeItem(
        `Error: ${this.error}`,
        vscode.TreeItemCollapsibleState.None
      );
      errorItem.iconPath = new vscode.ThemeIcon('error');
      return Promise.resolve([errorItem]);
    }

    if (this.matches.length === 0) {
      return Promise.resolve([]);
    }

    // Sort by completion date (most recent first), with in-progress at top
    const sortedMatches = [...this.matches].sort((a, b) => {
      if (a.result === 'in_progress' && b.result !== 'in_progress') {
        return -1;
      }
      if (b.result === 'in_progress' && a.result !== 'in_progress') {
        return 1;
      }
      if (!a.completedAt || !b.completedAt) {
        return 0;
      }
      return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
    });

    return Promise.resolve(
      sortedMatches.map(
        (match) => new HistoryMatchItem(match, vscode.TreeItemCollapsibleState.None)
      )
    );
  }

  getStats(): { wins: number; losses: number; draws: number; winRate: number } {
    const wins = this.matches.filter((m) => m.result === 'win').length;
    const losses = this.matches.filter((m) => m.result === 'loss').length;
    const draws = this.matches.filter((m) => m.result === 'draw').length;
    const total = wins + losses + draws;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    return { wins, losses, draws, winRate };
  }
}
