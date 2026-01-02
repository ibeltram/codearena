# RepoRivals for VS Code

> Competitive coding platform - join matches and submit directly from VS Code

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/reporivals.reporivals)](https://marketplace.visualstudio.com/items?itemName=reporivals.reporivals)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/reporivals.reporivals)](https://marketplace.visualstudio.com/items?itemName=reporivals.reporivals)

RepoRivals lets you compete in timed coding challenges without leaving your IDE. Work in your own workflow, submit when ready, and get judged by transparent automation.

## Features

### Browse & Join Challenges

- View available coding challenges directly in VS Code
- Filter by category, difficulty, and duration
- One-click match joining with automatic workspace setup

![Challenge Browser](resources/screenshots/challenges.png)

### Real-time Match Experience

- Live countdown timer in status bar
- Match status updates via WebSocket
- Warning notifications as time runs low
- View opponent status (without seeing their code)

![Active Match](resources/screenshots/match.png)

### Seamless Submission

- Select workspace folder with file preview
- Automatic exclusion of sensitive files (node_modules, .env, etc.)
- SHA-256 hash verification for integrity
- Resumable uploads for large projects
- Lock submission when you're satisfied

![Submission Flow](resources/screenshots/submit.png)

### Match History

- View recent match results
- See scores and ranking changes
- Quick access to match details on web

## Getting Started

1. **Install** the extension from VS Code Marketplace
2. **Sign In** using the RepoRivals: Sign In command (Ctrl/Cmd + Shift + P)
3. **Browse Challenges** in the sidebar
4. **Join a Match** and start competing!

## Commands

| Command | Description |
|---------|-------------|
| `RepoRivals: Sign In` | Authenticate with your RepoRivals account |
| `RepoRivals: Sign Out` | Sign out of your account |
| `RepoRivals: Browse Challenges` | View available coding challenges |
| `RepoRivals: Join Match` | Join a match for the selected challenge |
| `RepoRivals: Submit` | Submit your solution |
| `RepoRivals: Lock Submission` | Lock your submission (cannot be changed after) |
| `RepoRivals: Open Match in Web` | View match details in browser |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `reporivals.apiUrl` | `https://api.reporivals.dev` | API server URL |
| `reporivals.webUrl` | `https://reporivals.dev` | Web application URL |
| `reporivals.autoSubmit` | `false` | Auto-submit when time expires |
| `reporivals.showTimerInStatusBar` | `true` | Show match timer in status bar |
| `reporivals.timerWarningMinutes` | `5` | Warning notification threshold |
| `reporivals.excludePatterns` | `["node_modules/**", ...]` | Files to exclude from submissions |
| `reporivals.maxSubmissionSizeMB` | `50` | Maximum submission size |
| `reporivals.telemetry.enabled` | `false` | Enable anonymous telemetry |

## Privacy & Trust

RepoRivals is designed to be **non-invasive**:

- **Only reads files in your selected workspace** for submissions
- **Never intercepts** network requests or monitors other tools
- **Shows file preview** before any upload
- **Excludes sensitive files** by default (.env, credentials, etc.)
- **All actions are explicit** - no background scanning or syncing

## Telemetry

Telemetry is **opt-in** and disabled by default. When enabled:

- Collects anonymous usage patterns (commands used, match events)
- Reports errors to help improve the extension
- **Never** collects code, file contents, or personal information
- Respects VS Code's global telemetry settings

Enable telemetry to help improve RepoRivals:
```json
{
  "reporivals.telemetry.enabled": true
}
```

## Requirements

- VS Code 1.85.0 or later
- RepoRivals account (free to create at [reporivals.dev](https://reporivals.dev))
- Internet connection for authentication and match participation

## Feedback & Support

- **Issues**: [GitHub Issues](https://github.com/reporivals/reporivals/issues)
- **Discussions**: [GitHub Discussions](https://github.com/reporivals/reporivals/discussions)
- **Discord**: [Join our community](https://discord.gg/reporivals)
- **Email**: support@reporivals.dev

## License

MIT - see [LICENSE](LICENSE) for details.

---

**Happy Competing!** May the best code win.
