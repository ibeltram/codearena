import React, { createContext, useContext, useReducer, useEffect, Dispatch } from 'react';
import { WebviewState, ExtensionMessage } from '../types/messages';
import { extensionReducer, initialState, ExtensionAction } from './reducer';

// Re-export for backwards compatibility
export type { ExtensionAction } from './reducer';

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
