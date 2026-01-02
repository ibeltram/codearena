import React, { createContext, useContext, useReducer, useEffect, Dispatch } from 'react';
import {
  WebviewState,
  ExtensionMessage,
  User,
  Challenge,
  Match,
  MatchHistoryItem,
  ConnectionState,
} from '../types/messages';

// ============================================
// Initial State
// ============================================

const initialState: WebviewState = {
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

function extensionReducer(state: WebviewState, action: ExtensionAction): WebviewState {
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

// ============================================
// Context
// ============================================

interface ExtensionContextValue {
  state: WebviewState;
  dispatch: Dispatch<ExtensionAction>;
}

const ExtensionContext = createContext<ExtensionContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface ExtensionProviderProps {
  children: React.ReactNode;
}

export function ExtensionProvider({ children }: ExtensionProviderProps) {
  const [state, dispatch] = useReducer(extensionReducer, initialState);

  // Listen for messages from the extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'stateUpdate':
          dispatch({
            type: 'SET_STATE',
            payload: {
              isAuthenticated: message.data.auth.isAuthenticated,
              user: message.data.auth.user,
              challenges: message.data.challenges.challenges,
              challengesLoading: message.data.challenges.loading,
              challengesError: message.data.challenges.error,
              match: message.data.match.match,
              timeRemaining: message.data.match.timeRemaining,
              connectionState: message.data.match.connectionState,
              history: message.data.history.matches,
              historyLoading: message.data.history.loading,
              historyError: message.data.history.error,
            },
          });
          break;

        case 'authUpdate':
          dispatch({
            type: 'SET_AUTH',
            payload: message.data,
          });
          break;

        case 'challengesUpdate':
          dispatch({
            type: 'SET_CHALLENGES',
            payload: message.data,
          });
          break;

        case 'matchUpdate':
          dispatch({
            type: 'SET_MATCH',
            payload: message.data,
          });
          break;

        case 'timerUpdate':
          dispatch({
            type: 'SET_TIMER',
            payload: message.data,
          });
          break;

        case 'connectionUpdate':
          dispatch({
            type: 'SET_CONNECTION',
            payload: message.data,
          });
          break;

        case 'historyUpdate':
          dispatch({
            type: 'SET_HISTORY',
            payload: message.data,
          });
          break;

        case 'switchTab':
          dispatch({
            type: 'SET_ACTIVE_TAB',
            payload: message.data,
          });
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <ExtensionContext.Provider value={{ state, dispatch }}>
      {children}
    </ExtensionContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

/**
 * Hook to access extension state and dispatch
 */
export function useExtension() {
  const context = useContext(ExtensionContext);
  if (!context) {
    throw new Error('useExtension must be used within an ExtensionProvider');
  }
  return context;
}

export default ExtensionContext;
