# Extension Webview Testing Guide

This guide covers manual testing procedures for the RepoRivals VS Code extension webview sidebar.

## Prerequisites

1. **Development Environment Setup**
   - Node.js 18+ installed
   - pnpm installed (`npm install -g pnpm`)
   - VS Code 1.85.0 or later

2. **Build the Extension**
   ```bash
   # From the project root
   pnpm install
   pnpm run build
   ```

3. **Verify Build Outputs**
   - `apps/extension/dist/extension.js` - Main extension bundle
   - `apps/extension/dist/webview/index.js` - Webview React app
   - `apps/extension/dist/webview/index.css` - Webview styles
   - `apps/extension/dist/webview/index.html` - Webview HTML

## Running the Extension

1. Open VS Code in the `apps/extension` directory
2. Press `F5` to launch the Extension Development Host
3. In the new VS Code window, look for "RepoRivals" in the Activity Bar (left sidebar)

## Test Scenarios

### QUI-240: Test Webview Loads and Displays Content

**Objective:** Verify the webview loads correctly in the sidebar.

**Steps:**
1. Launch Extension Development Host (F5)
2. Click the RepoRivals icon in the Activity Bar
3. Verify the sidebar opens and displays content

**Acceptance Criteria:**
- [ ] Webview loads in under 500ms
- [ ] No console errors (View > Toggle Developer Tools > Console)
- [ ] React app renders basic content (either sign-in prompt or authenticated view)
- [ ] VS Code theme styles apply (colors match the VS Code theme)
- [ ] Communication between extension and webview works (no message errors)

**What to Check in Developer Tools:**
- No CSP (Content Security Policy) errors
- No module loading errors
- No React errors in console

### QUI-249: Verify Extension-Webview Communication

**Objective:** Verify bidirectional messaging between extension and webview.

**Steps:**
1. Launch Extension Development Host
2. Open the RepoRivals sidebar
3. Open Developer Tools in the Extension Development Host
4. Test button clicks and verify extension logs messages

**Test Cases:**

1. **Webview to Extension Command:**
   - Click the "Sign In" button (if not authenticated)
   - Verify the extension receives the command (check Output > Extension Host)

2. **Extension to Webview Update:**
   - Complete sign-in
   - Verify the webview updates to show user info

3. **State Persistence:**
   - Switch to different tabs in the webview
   - Hide the sidebar (click another Activity Bar icon)
   - Show the sidebar again
   - Verify the active tab is preserved

**Acceptance Criteria:**
- [ ] Webview -> Extension commands work
- [ ] Extension -> Webview updates work
- [ ] State persistence across hide/show works
- [ ] No message format errors in console

### QUI-281: Test Complete Sign In Flow

**Objective:** End-to-end test of authentication from the sidebar.

**Prerequisites:**
- API server running (`pnpm --filter @reporivals/api dev`)
- Web app running (`pnpm --filter @reporivals/web dev`)

**Steps:**
1. Clear extension state (uninstall/reinstall or clear globalState)
2. Launch Extension Development Host
3. Open RepoRivals sidebar
4. Verify sign-in prompt appears
5. Click "Sign In" button
6. Complete device code authentication flow
7. Verify sidebar updates with user info
8. Verify challenges load

**Acceptance Criteria:**
- [ ] Sign in prompt shows when not authenticated
- [ ] Sign in button triggers device code flow
- [ ] Auth state updates in webview after success
- [ ] User info displayed after sign in

### QUI-282: Test Challenge Browse and Join Flow

**Prerequisites:**
- User is signed in
- API has challenges seeded

**Steps:**
1. Navigate to Challenges tab
2. Verify challenges load and display
3. Test category filter
4. Click "Join Match" on a challenge
5. Verify match creation and navigation

**Acceptance Criteria:**
- [ ] Challenges display with correct info (title, duration, difficulty)
- [ ] Category filter works
- [ ] Refresh button works
- [ ] Join match initiates correctly

### QUI-283: Test Active Match with Submit and Lock

**Prerequisites:**
- User is in an active match

**Steps:**
1. Navigate to Match tab
2. Verify match info displays (timer, status, opponent)
3. Test "Submit" button
4. Test "Lock Submission" button

**Acceptance Criteria:**
- [ ] Match timer shows and updates in real-time
- [ ] Submit button packages and uploads files
- [ ] Lock button confirms and locks submission
- [ ] Status updates reflect in webview

### QUI-284: Test Match History Viewing

**Prerequisites:**
- User has past matches

**Steps:**
1. Navigate to History tab
2. Verify match history loads
3. Click on a match to view details

**Acceptance Criteria:**
- [ ] History shows past matches with correct info
- [ ] Results (win/loss/draw) display correctly
- [ ] Click opens match details

### QUI-285: Test State Persistence Across Hide/Show

**Steps:**
1. Open sidebar, navigate to different tabs
2. Hide sidebar (click another Activity Bar item)
3. Show sidebar again
4. Verify state is preserved

**Acceptance Criteria:**
- [ ] Active tab persists
- [ ] Scroll position persists
- [ ] Filter selections persist

### QUI-286: Test Theme Switching (Light/Dark)

**Steps:**
1. Start with dark theme, verify webview matches
2. Switch to light theme (Command Palette > "Preferences: Color Theme")
3. Verify webview updates immediately
4. Switch back to dark theme

**Acceptance Criteria:**
- [ ] Colors update when theme changes
- [ ] No flash of wrong colors
- [ ] All components respect theme

### QUI-287: Test SSE Reconnection

**Prerequisites:**
- Active match with SSE connection

**Steps:**
1. Start with active match, verify "Connected" indicator
2. Disable network temporarily
3. Re-enable network
4. Verify automatic reconnection

**Acceptance Criteria:**
- [ ] Connection state indicator shows correctly
- [ ] Automatic reconnection on network recovery
- [ ] Timer continues correctly after reconnect

## Running Unit Tests

The webview has automated unit tests that can be run without VS Code:

```bash
# Run webview unit tests
pnpm --filter reporivals-webview test

# Current test coverage:
# - src/context/reducer.test.ts (30 tests) - State reducer
# - src/utils/timeFormatting.test.ts (40 tests) - Time formatting utilities
```

## Troubleshooting

### Webview Shows Blank/White Screen
1. Check Developer Tools for errors
2. Verify dist/webview files exist
3. Check CSP errors in console
4. Rebuild webview: `pnpm run build:webview`

### Commands Not Working
1. Check Output > Extension Host for errors
2. Verify commands are registered (Command Palette should show RepoRivals commands)
3. Check that the correct command is being sent from webview

### Theme Not Applying
1. Check if CSS variables are defined in globals.css
2. Verify styles use `var(--vscode-*)` syntax
3. Check if styles are being bundled correctly

### State Not Persisting
1. Check getState/setState calls in useVSCodeMessaging hook
2. Verify state is being saved on changes
3. Check for any errors in console during state operations
