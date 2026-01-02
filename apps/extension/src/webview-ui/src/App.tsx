import React, { useEffect } from 'react';
import { ExtensionProvider, useExtension } from './context';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { Tabs, TabList, TabTrigger, TabContent } from './components/ui';
import { ChallengesTab } from './components/challenges';
import { ActiveMatchTab } from './components/match';
import { HistoryTab } from './components/history';
import './styles/globals.css';
import './App.css';

/**
 * Sign in prompt shown when user is not authenticated
 */
function SignInPrompt() {
  const { signIn } = useVSCodeMessaging();

  return (
    <div className="sign-in-prompt">
      <div className="sign-in-prompt__icon">&#x1F511;</div>
      <h2 className="sign-in-prompt__title">Welcome to RepoRivals</h2>
      <p className="sign-in-prompt__message">
        Sign in to browse challenges, join matches, and compete with other developers.
      </p>
      <button className="sign-in-prompt__button" onClick={signIn}>
        Sign In
      </button>
    </div>
  );
}

/**
 * Main application content with tab navigation
 */
function AppContent() {
  const { state, dispatch } = useExtension();
  const { getState, setState } = useVSCodeMessaging();

  // Restore active tab from persisted state on mount
  useEffect(() => {
    const savedState = getState<{ activeTab?: string }>();
    if (savedState?.activeTab) {
      dispatch({
        type: 'SET_ACTIVE_TAB',
        payload: { tab: savedState.activeTab as 'challenges' | 'match' | 'history' },
      });
    }
  }, [dispatch, getState]);

  // Persist active tab when it changes
  const handleTabChange = (tab: string) => {
    dispatch({
      type: 'SET_ACTIVE_TAB',
      payload: { tab: tab as 'challenges' | 'match' | 'history' },
    });
    setState({ activeTab: tab });
  };

  // Show sign in prompt if not authenticated
  if (!state.isAuthenticated) {
    return <SignInPrompt />;
  }

  return (
    <div className="app-content">
      {/* User header */}
      {state.user && (
        <UserHeader
          displayName={state.user.displayName}
          email={state.user.email}
          avatarUrl={state.user.avatarUrl}
        />
      )}

      {/* Tab navigation */}
      <Tabs value={state.activeTab} onValueChange={handleTabChange}>
        <TabList>
          <TabTrigger value="challenges">Challenges</TabTrigger>
          <TabTrigger value="match">Match</TabTrigger>
          <TabTrigger value="history">History</TabTrigger>
        </TabList>

        <TabContent value="challenges">
          <ChallengesTab />
        </TabContent>

        <TabContent value="match">
          <ActiveMatchTab />
        </TabContent>

        <TabContent value="history">
          <HistoryTab
            history={state.history}
            loading={state.historyLoading}
            error={state.historyError}
          />
        </TabContent>
      </Tabs>
    </div>
  );
}

/**
 * User header with avatar and sign out
 */
interface UserHeaderProps {
  displayName: string;
  email: string;
  avatarUrl?: string;
}

function UserHeader({ displayName, email, avatarUrl }: UserHeaderProps) {
  const { signOut } = useVSCodeMessaging();

  return (
    <div className="user-header">
      <div className="user-header__avatar">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="user-header__avatar-image" />
        ) : (
          <div className="user-header__avatar-fallback">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="user-header__info">
        <div className="user-header__name">{displayName}</div>
        <div className="user-header__email">{email}</div>
      </div>
      <button
        className="user-header__sign-out"
        onClick={signOut}
        title="Sign Out"
        aria-label="Sign Out"
      >
        &#x23FB;
      </button>
    </div>
  );
}

/**
 * Main App component wrapped with providers
 */
export function App() {
  return (
    <ExtensionProvider>
      <div className="app">
        <AppContent />
      </div>
    </ExtensionProvider>
  );
}

export default App;
