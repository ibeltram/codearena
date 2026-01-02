/**
 * State reducer for the extension webview
 *
 * Handles all state updates from extension messages.
 * This is extracted into a separate file for testability.
 */

import {
  WebviewState,
  User,
  Challenge,
  Match,
  MatchHistoryItem,
  ConnectionState,
} from '../types/messages';

// ============================================
// Initial State
// ============================================

export const initialState: WebviewState = {
  isAuthenticated: false,
  user: null,
  challenges: [],
  challengesLoading: true,
  challengesError: null,
  categoryFilter: null,
  match: null,
  timeRemaining: 0,
  connectionState: 'disconnected',
  history: [],
  historyLoading: false,
  historyError: null,
  activeTab: 'challenges',
};

// ============================================
// Action Types
// ============================================

export type ExtensionAction =
  | { type: 'SET_STATE'; payload: Partial<WebviewState> }
  | { type: 'SET_AUTH'; payload: { isAuthenticated: boolean; user: User | null } }
  | {
      type: 'SET_CHALLENGES';
      payload: { challenges: Challenge[]; loading: boolean; error: string | null };
    }
  | { type: 'SET_MATCH'; payload: { match: Match | null } }
  | { type: 'SET_TIMER'; payload: { timeRemaining: number } }
  | { type: 'SET_CONNECTION'; payload: { state: ConnectionState } }
  | {
      type: 'SET_HISTORY';
      payload: { matches: MatchHistoryItem[]; loading: boolean; error: string | null };
    }
  | { type: 'SET_ACTIVE_TAB'; payload: { tab: WebviewState['activeTab'] } }
  | { type: 'SET_CATEGORY_FILTER'; payload: { category: string | null } };

// ============================================
// Reducer
// ============================================

export function extensionReducer(state: WebviewState, action: ExtensionAction): WebviewState {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, ...action.payload };

    case 'SET_AUTH':
      return {
        ...state,
        isAuthenticated: action.payload.isAuthenticated,
        user: action.payload.user,
      };

    case 'SET_CHALLENGES':
      return {
        ...state,
        challenges: action.payload.challenges,
        challengesLoading: action.payload.loading,
        challengesError: action.payload.error,
      };

    case 'SET_MATCH':
      return {
        ...state,
        match: action.payload.match,
      };

    case 'SET_TIMER':
      return {
        ...state,
        timeRemaining: action.payload.timeRemaining,
      };

    case 'SET_CONNECTION':
      return {
        ...state,
        connectionState: action.payload.state,
      };

    case 'SET_HISTORY':
      return {
        ...state,
        history: action.payload.matches,
        historyLoading: action.payload.loading,
        historyError: action.payload.error,
      };

    case 'SET_ACTIVE_TAB':
      return {
        ...state,
        activeTab: action.payload.tab,
      };

    case 'SET_CATEGORY_FILTER':
      return {
        ...state,
        categoryFilter: action.payload.category,
      };

    default:
      return state;
  }
}

export default extensionReducer;
