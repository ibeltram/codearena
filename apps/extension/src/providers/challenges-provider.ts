import * as vscode from 'vscode';
import { Challenge, ChallengeCategory, ChallengeDifficulty } from '../types';

/**
 * Tree item representing a challenge or category in the challenges view
 */
export class ChallengeItem extends vscode.TreeItem {
  constructor(
    public readonly challenge: Challenge,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(challenge.title, collapsibleState);

    this.id = challenge.id;
    this.tooltip = this.createTooltip();
    this.description = this.createDescription();
    this.iconPath = this.getIcon();
    this.contextValue = 'challenge';

    // Command to show challenge details
    this.command = {
      command: 'codearena.showChallengeDetails',
      title: 'Show Challenge Details',
      arguments: [challenge],
    };
  }

  private createTooltip(): string {
    const lines = [
      this.challenge.title,
      `Category: ${this.challenge.category}`,
      `Difficulty: ${this.challenge.difficulty}`,
      `Time: ${this.challenge.timeLimit} minutes`,
      `Stake: ${this.challenge.stakeAmount} credits`,
    ];
    if (this.challenge.hasTemplate) {
      lines.push('Template available');
    }
    return lines.join('\n');
  }

  private createDescription(): string {
    return `${this.challenge.difficulty} | ${this.challenge.timeLimit}m | ${this.challenge.stakeAmount}c`;
  }

  private getIcon(): vscode.ThemeIcon {
    const difficultyIcons: Record<ChallengeDifficulty, string> = {
      easy: 'circle-outline',
      medium: 'circle-filled',
      hard: 'flame',
      expert: 'zap',
    };
    return new vscode.ThemeIcon(difficultyIcons[this.challenge.difficulty] || 'code');
  }
}

/**
 * Tree item representing a category grouping
 */
export class CategoryItem extends vscode.TreeItem {
  constructor(
    public readonly category: ChallengeCategory,
    public readonly challengeCount: number,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(CategoryItem.formatCategory(category), collapsibleState);

    this.id = `category-${category}`;
    this.description = `${challengeCount} challenges`;
    this.iconPath = CategoryItem.getCategoryIcon(category);
    this.contextValue = 'category';
  }

  static formatCategory(category: ChallengeCategory): string {
    const labels: Record<ChallengeCategory, string> = {
      frontend: 'Frontend',
      backend: 'Backend',
      fullstack: 'Full Stack',
      algorithm: 'Algorithm',
      devops: 'DevOps',
    };
    return labels[category] || category;
  }

  static getCategoryIcon(category: ChallengeCategory): vscode.ThemeIcon {
    const icons: Record<ChallengeCategory, string> = {
      frontend: 'browser',
      backend: 'server',
      fullstack: 'layers',
      algorithm: 'symbol-method',
      devops: 'cloud',
    };
    return new vscode.ThemeIcon(icons[category] || 'code');
  }
}

/**
 * Provides data for the Challenges tree view
 */
export class ChallengesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private challenges: Challenge[] = [];
  private isLoading = false;
  private error: string | null = null;
  private groupByCategory = true;

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

  setChallenges(challenges: Challenge[]): void {
    this.challenges = challenges;
    this.error = null;
    this.refresh();
  }

  toggleGroupByCategory(): void {
    this.groupByCategory = !this.groupByCategory;
    this.refresh();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (this.isLoading) {
      return Promise.resolve([
        new vscode.TreeItem('Loading challenges...', vscode.TreeItemCollapsibleState.None),
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

    if (!element) {
      // Root level
      if (this.challenges.length === 0) {
        return Promise.resolve([
          new vscode.TreeItem('No challenges available', vscode.TreeItemCollapsibleState.None),
        ]);
      }

      if (this.groupByCategory) {
        // Group by category
        const categories = this.getCategoriesWithCounts();
        return Promise.resolve(
          categories.map(
            ({ category, count }) =>
              new CategoryItem(category, count, vscode.TreeItemCollapsibleState.Collapsed)
          )
        );
      } else {
        // Flat list
        return Promise.resolve(
          this.challenges.map(
            (challenge) => new ChallengeItem(challenge, vscode.TreeItemCollapsibleState.None)
          )
        );
      }
    }

    // Child level (challenges under a category)
    if (element instanceof CategoryItem) {
      const challengesInCategory = this.challenges.filter(
        (c) => c.category === element.category
      );
      return Promise.resolve(
        challengesInCategory.map(
          (challenge) => new ChallengeItem(challenge, vscode.TreeItemCollapsibleState.None)
        )
      );
    }

    return Promise.resolve([]);
  }

  private getCategoriesWithCounts(): Array<{ category: ChallengeCategory; count: number }> {
    const counts = new Map<ChallengeCategory, number>();

    for (const challenge of this.challenges) {
      counts.set(challenge.category, (counts.get(challenge.category) || 0) + 1);
    }

    const order: ChallengeCategory[] = ['frontend', 'backend', 'fullstack', 'algorithm', 'devops'];
    return order
      .filter((cat) => counts.has(cat))
      .map((category) => ({
        category,
        count: counts.get(category)!,
      }));
  }
}
