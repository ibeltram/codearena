/**
 * Unit tests for the webview state reducer
 *
 * Tests all action types and edge cases for state management.
 */

import { describe, it, expect } from 'vitest';
import { extensionReducer, initialState, ExtensionAction } from './reducer';
import { WebviewState, Challenge, Match, MatchHistoryItem, User } from '../types/messages';

// ============================================
// Test Fixtures
// ============================================

const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: 'https://example.com/avatar.png',
};

const mockChallenge: Challenge = {
  id: 'challenge-1',
  slug: 'test-challenge',
  title: 'Test Challenge',
  description: 'A test challenge',
  category: 'frontend',
  difficulty: 'medium',
  timeLimit: 3600,
  stakeAmount: 100,
  hasTemplate: true,
  isPublished: true,
};

const mockMatch: Match = {
  id: 'match-123',
  challengeId: 'challenge-1',
  challengeTitle: 'Test Challenge',
  status: 'in_progress',
  mode: 'ranked',
  startAt: '2026-01-01T10:00:00Z',
  endAt: '2026-01-01T11:00:00Z',
  timeLimit: 3600,
  stakeAmount: 100,
  participants: [
    {
      userId: 'user-123',
      username: 'testuser',
      seat: 'A',
      joinedAt: '2026-01-01T09:55:00Z',
      hasSubmitted: false,
      hasLocked: false,
    },
    {
      userId: 'user-456',
      username: 'opponent',
      seat: 'B',
      joinedAt: '2026-01-01T09:56:00Z',
      hasSubmitted: false,
      hasLocked: false,
    },
  ],
  mySubmission: null,
};

const mockHistoryItem: MatchHistoryItem = {
  id: 'match-old',
  challengeTitle: 'Past Challenge',
  category: 'backend',
  difficulty: 'hard',
  opponentUsername: 'pastopponent',
  result: 'win',
  score: 95,
  opponentScore: 80,
  creditsWon: 50,
  completedAt: '2025-12-31T12:00:00Z',
};

// ============================================
// Tests
// ============================================

describe('extensionReducer', () => {
  describe('initial state', () => {
    it('should have correct initial values', () => {
      expect(initialState).toEqual({
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
      });
    });
  });

  describe('SET_STATE action', () => {
    it('should replace partial state', () => {
      const action: ExtensionAction = {
        type: 'SET_STATE',
        payload: {
          isAuthenticated: true,
          user: mockUser,
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.isAuthenticated).toBe(true);
      expect(newState.user).toEqual(mockUser);
      // Other fields should remain unchanged
      expect(newState.challenges).toEqual([]);
      expect(newState.activeTab).toBe('challenges');
    });

    it('should replace full state when all fields provided', () => {
      const fullPayload: Partial<WebviewState> = {
        isAuthenticated: true,
        user: mockUser,
        challenges: [mockChallenge],
        challengesLoading: false,
        challengesError: null,
        categoryFilter: 'frontend',
        match: mockMatch,
        timeRemaining: 1800,
        connectionState: 'connected',
        history: [mockHistoryItem],
        historyLoading: false,
        historyError: null,
        activeTab: 'match',
      };

      const action: ExtensionAction = {
        type: 'SET_STATE',
        payload: fullPayload,
      };

      const newState = extensionReducer(initialState, action);

      expect(newState).toEqual({ ...initialState, ...fullPayload });
    });

    it('should handle empty payload', () => {
      const action: ExtensionAction = {
        type: 'SET_STATE',
        payload: {},
      };

      const newState = extensionReducer(initialState, action);

      expect(newState).toEqual(initialState);
    });
  });

  describe('SET_AUTH action', () => {
    it('should update authentication state', () => {
      const action: ExtensionAction = {
        type: 'SET_AUTH',
        payload: {
          isAuthenticated: true,
          user: mockUser,
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.isAuthenticated).toBe(true);
      expect(newState.user).toEqual(mockUser);
    });

    it('should handle sign out', () => {
      const authenticatedState: WebviewState = {
        ...initialState,
        isAuthenticated: true,
        user: mockUser,
      };

      const action: ExtensionAction = {
        type: 'SET_AUTH',
        payload: {
          isAuthenticated: false,
          user: null,
        },
      };

      const newState = extensionReducer(authenticatedState, action);

      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
    });

    it('should only update auth fields', () => {
      const stateWithData: WebviewState = {
        ...initialState,
        challenges: [mockChallenge],
        activeTab: 'history',
      };

      const action: ExtensionAction = {
        type: 'SET_AUTH',
        payload: {
          isAuthenticated: true,
          user: mockUser,
        },
      };

      const newState = extensionReducer(stateWithData, action);

      expect(newState.challenges).toEqual([mockChallenge]);
      expect(newState.activeTab).toBe('history');
    });
  });

  describe('SET_CHALLENGES action', () => {
    it('should update challenges state', () => {
      const action: ExtensionAction = {
        type: 'SET_CHALLENGES',
        payload: {
          challenges: [mockChallenge],
          loading: false,
          error: null,
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.challenges).toEqual([mockChallenge]);
      expect(newState.challengesLoading).toBe(false);
      expect(newState.challengesError).toBeNull();
    });

    it('should handle loading state', () => {
      const action: ExtensionAction = {
        type: 'SET_CHALLENGES',
        payload: {
          challenges: [],
          loading: true,
          error: null,
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.challenges).toEqual([]);
      expect(newState.challengesLoading).toBe(true);
      expect(newState.challengesError).toBeNull();
    });

    it('should handle error state', () => {
      const action: ExtensionAction = {
        type: 'SET_CHALLENGES',
        payload: {
          challenges: [],
          loading: false,
          error: 'Failed to fetch challenges',
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.challenges).toEqual([]);
      expect(newState.challengesLoading).toBe(false);
      expect(newState.challengesError).toBe('Failed to fetch challenges');
    });

    it('should replace existing challenges', () => {
      const stateWithChallenges: WebviewState = {
        ...initialState,
        challenges: [mockChallenge],
      };

      const newChallenge: Challenge = {
        ...mockChallenge,
        id: 'challenge-2',
        title: 'New Challenge',
      };

      const action: ExtensionAction = {
        type: 'SET_CHALLENGES',
        payload: {
          challenges: [newChallenge],
          loading: false,
          error: null,
        },
      };

      const newState = extensionReducer(stateWithChallenges, action);

      expect(newState.challenges).toHaveLength(1);
      expect(newState.challenges[0].id).toBe('challenge-2');
    });
  });

  describe('SET_MATCH action', () => {
    it('should set match', () => {
      const action: ExtensionAction = {
        type: 'SET_MATCH',
        payload: {
          match: mockMatch,
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.match).toEqual(mockMatch);
    });

    it('should clear match', () => {
      const stateWithMatch: WebviewState = {
        ...initialState,
        match: mockMatch,
      };

      const action: ExtensionAction = {
        type: 'SET_MATCH',
        payload: {
          match: null,
        },
      };

      const newState = extensionReducer(stateWithMatch, action);

      expect(newState.match).toBeNull();
    });
  });

  describe('SET_TIMER action', () => {
    it('should update time remaining', () => {
      const action: ExtensionAction = {
        type: 'SET_TIMER',
        payload: {
          timeRemaining: 1800,
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.timeRemaining).toBe(1800);
    });

    it('should update to zero', () => {
      const stateWithTime: WebviewState = {
        ...initialState,
        timeRemaining: 1000,
      };

      const action: ExtensionAction = {
        type: 'SET_TIMER',
        payload: {
          timeRemaining: 0,
        },
      };

      const newState = extensionReducer(stateWithTime, action);

      expect(newState.timeRemaining).toBe(0);
    });

    it('should handle negative values (edge case)', () => {
      const action: ExtensionAction = {
        type: 'SET_TIMER',
        payload: {
          timeRemaining: -5,
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.timeRemaining).toBe(-5);
    });
  });

  describe('SET_CONNECTION action', () => {
    it('should set connected state', () => {
      const action: ExtensionAction = {
        type: 'SET_CONNECTION',
        payload: {
          state: 'connected',
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.connectionState).toBe('connected');
    });

    it('should set reconnecting state', () => {
      const action: ExtensionAction = {
        type: 'SET_CONNECTION',
        payload: {
          state: 'reconnecting',
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.connectionState).toBe('reconnecting');
    });

    it('should set disconnected state', () => {
      const connectedState: WebviewState = {
        ...initialState,
        connectionState: 'connected',
      };

      const action: ExtensionAction = {
        type: 'SET_CONNECTION',
        payload: {
          state: 'disconnected',
        },
      };

      const newState = extensionReducer(connectedState, action);

      expect(newState.connectionState).toBe('disconnected');
    });
  });

  describe('SET_HISTORY action', () => {
    it('should update history state', () => {
      const action: ExtensionAction = {
        type: 'SET_HISTORY',
        payload: {
          matches: [mockHistoryItem],
          loading: false,
          error: null,
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.history).toEqual([mockHistoryItem]);
      expect(newState.historyLoading).toBe(false);
      expect(newState.historyError).toBeNull();
    });

    it('should handle loading state', () => {
      const action: ExtensionAction = {
        type: 'SET_HISTORY',
        payload: {
          matches: [],
          loading: true,
          error: null,
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.history).toEqual([]);
      expect(newState.historyLoading).toBe(true);
      expect(newState.historyError).toBeNull();
    });

    it('should handle error state', () => {
      const action: ExtensionAction = {
        type: 'SET_HISTORY',
        payload: {
          matches: [],
          loading: false,
          error: 'Failed to fetch history',
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.history).toEqual([]);
      expect(newState.historyLoading).toBe(false);
      expect(newState.historyError).toBe('Failed to fetch history');
    });
  });

  describe('SET_ACTIVE_TAB action', () => {
    it('should set challenges tab', () => {
      const action: ExtensionAction = {
        type: 'SET_ACTIVE_TAB',
        payload: {
          tab: 'challenges',
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.activeTab).toBe('challenges');
    });

    it('should set match tab', () => {
      const action: ExtensionAction = {
        type: 'SET_ACTIVE_TAB',
        payload: {
          tab: 'match',
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.activeTab).toBe('match');
    });

    it('should set history tab', () => {
      const action: ExtensionAction = {
        type: 'SET_ACTIVE_TAB',
        payload: {
          tab: 'history',
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.activeTab).toBe('history');
    });

    it('should only update activeTab field', () => {
      const stateWithMatch: WebviewState = {
        ...initialState,
        match: mockMatch,
        isAuthenticated: true,
      };

      const action: ExtensionAction = {
        type: 'SET_ACTIVE_TAB',
        payload: {
          tab: 'history',
        },
      };

      const newState = extensionReducer(stateWithMatch, action);

      expect(newState.activeTab).toBe('history');
      expect(newState.match).toEqual(mockMatch);
      expect(newState.isAuthenticated).toBe(true);
    });
  });

  describe('SET_CATEGORY_FILTER action', () => {
    it('should set category filter', () => {
      const action: ExtensionAction = {
        type: 'SET_CATEGORY_FILTER',
        payload: {
          category: 'frontend',
        },
      };

      const newState = extensionReducer(initialState, action);

      expect(newState.categoryFilter).toBe('frontend');
    });

    it('should clear category filter', () => {
      const filteredState: WebviewState = {
        ...initialState,
        categoryFilter: 'backend',
      };

      const action: ExtensionAction = {
        type: 'SET_CATEGORY_FILTER',
        payload: {
          category: null,
        },
      };

      const newState = extensionReducer(filteredState, action);

      expect(newState.categoryFilter).toBeNull();
    });
  });

  describe('unknown action', () => {
    it('should return current state for unknown action', () => {
      const unknownAction = {
        type: 'UNKNOWN_ACTION',
        payload: {},
      } as unknown as ExtensionAction;

      const newState = extensionReducer(initialState, unknownAction);

      expect(newState).toEqual(initialState);
    });
  });

  describe('immutability', () => {
    it('should not mutate the original state', () => {
      const originalState = { ...initialState };
      const frozenState = Object.freeze({ ...initialState });

      const action: ExtensionAction = {
        type: 'SET_AUTH',
        payload: {
          isAuthenticated: true,
          user: mockUser,
        },
      };

      // This should not throw even with frozen state
      const newState = extensionReducer(frozenState as WebviewState, action);

      expect(newState).not.toBe(frozenState);
      expect(newState.isAuthenticated).toBe(true);
      expect(frozenState.isAuthenticated).toBe(false);
    });
  });
});
