// Main export - the React webview sidebar provider
export { SidebarProvider } from './sidebar-provider';

// Legacy TreeDataProviders - still used internally but not for public API
// These will be removed in QUI-290 after full migration to webview
// Import directly from files if needed internally:
// import { ChallengesProvider } from './providers/challenges-provider';
// import { MatchProvider } from './providers/match-provider';
// import { HistoryProvider } from './providers/history-provider';
