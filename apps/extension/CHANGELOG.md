# Changelog

All notable changes to the RepoRivals VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Preparing for 1.0.0 release

## [0.1.0] - 2026-01-01

### Added
- Initial beta release
- **Authentication**: Sign in/out via device code flow (PKCE OAuth)
- **Challenge Discovery**: Browse and filter coding challenges by category and difficulty
- **Match Management**: Join matches, view active match status, and forfeit if needed
- **Submission System**:
  - Workspace selection with file preview before upload
  - SHA-256 hashing for integrity verification
  - Resumable uploads for large submissions
  - Lock submission to finalize
- **Status Bar HUD**: Real-time match timer and status display
- **Match History**: View recent matches and results
- **Activity Bar Integration**: Dedicated sidebar for RepoRivals features

### Configuration Options
- `reporivals.apiUrl`: API server URL
- `reporivals.webUrl`: Web application URL
- `reporivals.autoSubmit`: Auto-submit when time expires
- `reporivals.showTimerInStatusBar`: Toggle status bar timer
- `reporivals.timerWarningMinutes`: Warning notification threshold
- `reporivals.excludePatterns`: File patterns to exclude from submissions
- `reporivals.maxSubmissionSizeMB`: Maximum submission size limit

### Security
- Non-invasive design: only reads files in explicitly selected workspace
- File manifest preview before upload
- Default exclusion patterns for sensitive files (.env, node_modules, etc.)
- No network interception or monitoring of other tools

## [0.0.1] - 2025-12-30

### Added
- Project scaffolding and initial structure
- VS Code extension activation framework

---

[Unreleased]: https://github.com/reporivals/reporivals/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/reporivals/reporivals/releases/tag/v0.1.0
[0.0.1]: https://github.com/reporivals/reporivals/releases/tag/v0.0.1
