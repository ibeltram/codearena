import * as vscode from 'vscode';
import { SubmissionSummary, FileEntry, UploadProgress } from '../services';

/**
 * Submission panel for file preview and upload
 */
export class SubmissionPanel {
  public static currentPanel: SubmissionPanel | undefined;
  private static readonly viewType = 'codearenaSubmission';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private _summary: SubmissionSummary | null = null;
  private _matchId: string | null = null;
  private _progress: UploadProgress | null = null;

  // Callbacks for actions
  private _onSubmit: ((summary: SubmissionSummary) => Promise<void>) | null = null;
  private _onToggleFile: ((relativePath: string) => void) | null = null;
  private _onCancel: (() => void) | null = null;

  public static createOrShow(
    extensionUri: vscode.Uri,
    matchId: string,
    summary: SubmissionSummary,
    options: {
      onSubmit: (summary: SubmissionSummary) => Promise<void>;
      onToggleFile: (relativePath: string) => void;
      onCancel: () => void;
    }
  ): SubmissionPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (SubmissionPanel.currentPanel) {
      SubmissionPanel.currentPanel._panel.reveal(column);
      SubmissionPanel.currentPanel.setSummary(summary, matchId);
      SubmissionPanel.currentPanel._onSubmit = options.onSubmit;
      SubmissionPanel.currentPanel._onToggleFile = options.onToggleFile;
      SubmissionPanel.currentPanel._onCancel = options.onCancel;
      return SubmissionPanel.currentPanel;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      SubmissionPanel.viewType,
      'Submit to CodeArena',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    SubmissionPanel.currentPanel = new SubmissionPanel(panel, extensionUri);
    SubmissionPanel.currentPanel.setSummary(summary, matchId);
    SubmissionPanel.currentPanel._onSubmit = options.onSubmit;
    SubmissionPanel.currentPanel._onToggleFile = options.onToggleFile;
    SubmissionPanel.currentPanel._onCancel = options.onCancel;

    return SubmissionPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set initial content
    this._update();

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'submit':
            if (this._onSubmit && this._summary) {
              await this._onSubmit(this._summary);
            }
            break;
          case 'toggleFile':
            if (this._onToggleFile) {
              this._onToggleFile(message.relativePath);
            }
            break;
          case 'cancel':
            if (this._onCancel) {
              this._onCancel();
            }
            this._panel.dispose();
            break;
        }
      },
      null,
      this._disposables
    );

    // Handle panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public setSummary(summary: SubmissionSummary, matchId: string): void {
    this._summary = summary;
    this._matchId = matchId;
    this._update();
  }

  public setProgress(progress: UploadProgress): void {
    this._progress = progress;
    this._panel.webview.postMessage({
      type: 'progress',
      progress,
    });
  }

  public dispose(): void {
    SubmissionPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _update(): void {
    this._panel.webview.html = this._getHtmlContent();
  }

  private _getHtmlContent(): string {
    const summary = this._summary;

    if (!summary) {
      return this._getLoadingHtml();
    }

    const includedFiles = summary.files.filter((f) => !f.isExcluded);
    const excludedFiles = summary.files.filter((f) => f.isExcluded);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Submit to CodeArena</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-panel-border);
      --accent-color: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --success-color: var(--vscode-testing-iconPassed);
      --warning-color: var(--vscode-editorWarning-foreground);
      --error-color: var(--vscode-editorError-foreground);
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background-color: var(--bg-primary);
      margin: 0;
      padding: 16px;
      line-height: 1.4;
    }

    h1 {
      font-size: 1.5em;
      margin: 0 0 8px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    h2 {
      font-size: 1.1em;
      margin: 16px 0 8px 0;
      color: var(--text-secondary);
    }

    .summary-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
      margin-bottom: 12px;
    }

    .summary-item {
      text-align: center;
    }

    .summary-value {
      font-size: 1.5em;
      font-weight: bold;
      color: var(--accent-color);
    }

    .summary-label {
      font-size: 0.85em;
      color: var(--text-secondary);
    }

    .hash-display {
      background: var(--vscode-textCodeBlock-background);
      padding: 8px 12px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.85em;
      word-break: break-all;
      margin-top: 8px;
    }

    .hash-label {
      font-size: 0.75em;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .file-list {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--bg-secondary);
    }

    .file-item {
      display: flex;
      align-items: center;
      padding: 6px 10px;
      border-bottom: 1px solid var(--border-color);
      cursor: pointer;
      transition: background 0.1s;
    }

    .file-item:last-child {
      border-bottom: none;
    }

    .file-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .file-item.excluded {
      opacity: 0.6;
      text-decoration: line-through;
    }

    .file-checkbox {
      margin-right: 8px;
    }

    .file-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-size {
      font-size: 0.85em;
      color: var(--text-secondary);
      margin-left: 8px;
    }

    .file-reason {
      font-size: 0.75em;
      color: var(--warning-color);
      margin-left: 8px;
    }

    .section-toggle {
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .section-toggle:hover {
      color: var(--accent-color);
    }

    .actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
      justify-content: flex-end;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1em;
      transition: background 0.1s;
    }

    .btn-primary {
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .btn-secondary:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .progress-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .progress-overlay.visible {
      display: flex;
    }

    .progress-card {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 24px;
      min-width: 300px;
      text-align: center;
    }

    .progress-bar-container {
      background: var(--bg-secondary);
      border-radius: 4px;
      height: 8px;
      margin: 16px 0;
      overflow: hidden;
    }

    .progress-bar {
      background: var(--accent-color);
      height: 100%;
      transition: width 0.3s;
    }

    .progress-text {
      font-size: 0.9em;
      color: var(--text-secondary);
    }

    .warning-banner {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      color: var(--warning-color);
      padding: 10px 12px;
      border-radius: 4px;
      margin-bottom: 16px;
      font-size: 0.9em;
    }

    .icon {
      display: inline-block;
      width: 16px;
      height: 16px;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <h1>
    <span class="icon">📦</span>
    Submit to CodeArena
  </h1>

  <div class="summary-card">
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-value">${includedFiles.length}</div>
        <div class="summary-label">Files to Submit</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${this._formatBytes(summary.includedSize)}</div>
        <div class="summary-label">Total Size</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${excludedFiles.length}</div>
        <div class="summary-label">Excluded</div>
      </div>
    </div>

    <div class="hash-label">Content Hash (SHA-256)</div>
    <div class="hash-display">${summary.contentHash}</div>
  </div>

  ${excludedFiles.some((f) => f.excludeReason?.includes('sensitive'))
    ? `<div class="warning-banner">
        ⚠️ Some files were automatically excluded because they may contain sensitive information (credentials, keys, etc.)
      </div>`
    : ''
  }

  <h2 class="section-toggle" onclick="toggleSection('included')">
    <span id="included-arrow">▼</span>
    Files to Submit (${includedFiles.length})
  </h2>
  <div id="included-section" class="file-list">
    ${includedFiles.length === 0
      ? '<div style="padding: 16px; text-align: center; color: var(--text-secondary);">No files to submit</div>'
      : includedFiles.map((f) => this._renderFileItem(f)).join('')
    }
  </div>

  <h2 class="section-toggle" onclick="toggleSection('excluded')">
    <span id="excluded-arrow">▶</span>
    Excluded Files (${excludedFiles.length})
  </h2>
  <div id="excluded-section" class="file-list" style="display: none;">
    ${excludedFiles.length === 0
      ? '<div style="padding: 16px; text-align: center; color: var(--text-secondary);">No excluded files</div>'
      : excludedFiles.map((f) => this._renderFileItem(f)).join('')
    }
  </div>

  <div class="actions">
    <button class="btn-secondary" onclick="cancel()">Cancel</button>
    <button class="btn-primary" onclick="submit()" ${includedFiles.length === 0 ? 'disabled' : ''}>
      Submit (${this._formatBytes(summary.includedSize)})
    </button>
  </div>

  <div id="progress-overlay" class="progress-overlay">
    <div class="progress-card">
      <h3 id="progress-phase">Uploading...</h3>
      <div class="progress-bar-container">
        <div id="progress-bar" class="progress-bar" style="width: 0%"></div>
      </div>
      <div id="progress-text" class="progress-text">Preparing...</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function toggleSection(section) {
      const content = document.getElementById(section + '-section');
      const arrow = document.getElementById(section + '-arrow');
      if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
      } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
      }
    }

    function toggleFile(relativePath) {
      vscode.postMessage({ command: 'toggleFile', relativePath });
    }

    function submit() {
      vscode.postMessage({ command: 'submit' });
    }

    function cancel() {
      vscode.postMessage({ command: 'cancel' });
    }

    // Handle progress updates
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'progress') {
        const progress = message.progress;
        const overlay = document.getElementById('progress-overlay');
        const bar = document.getElementById('progress-bar');
        const text = document.getElementById('progress-text');
        const phase = document.getElementById('progress-phase');

        if (progress.phase === 'complete') {
          overlay.classList.remove('visible');
        } else if (progress.phase === 'error') {
          phase.textContent = 'Error';
          text.textContent = progress.message;
          bar.style.background = 'var(--error-color)';
        } else {
          overlay.classList.add('visible');
          phase.textContent = progress.phase === 'preparing' ? 'Preparing...' :
                              progress.phase === 'hashing' ? 'Computing hash...' :
                              progress.phase === 'uploading' ? 'Uploading...' :
                              progress.phase === 'finalizing' ? 'Finalizing...' : 'Processing...';
          bar.style.width = progress.progress + '%';
          text.textContent = progress.message;
        }
      }
    });
  </script>
</body>
</html>`;
  }

  private _renderFileItem(file: FileEntry): string {
    const classes = file.isExcluded ? 'file-item excluded' : 'file-item';
    const checked = file.isExcluded ? '' : 'checked';

    return `
      <div class="${classes}" onclick="toggleFile('${this._escapeHtml(file.relativePath)}')">
        <input type="checkbox" class="file-checkbox" ${checked} onclick="event.stopPropagation(); toggleFile('${this._escapeHtml(file.relativePath)}')">
        <span class="file-name" title="${this._escapeHtml(file.relativePath)}">${this._escapeHtml(file.relativePath)}</span>
        <span class="file-size">${this._formatBytes(file.size)}</span>
        ${file.excludeReason ? `<span class="file-reason" title="${this._escapeHtml(file.excludeReason)}">⚠</span>` : ''}
      </div>
    `;
  }

  private _formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private _getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Submit to CodeArena</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .loading {
      text-align: center;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--vscode-panel-border);
      border-top-color: var(--vscode-button-background);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <div>Scanning workspace...</div>
  </div>
</body>
</html>`;
  }
}
