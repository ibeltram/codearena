import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'user' | 'admin' | 'moderator';
  githubUsername?: string;
}

export interface OAuthAccount {
  provider: 'github' | 'google';
  connected: boolean;
  username?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  oauthAccounts: OAuthAccount[];

  // Actions
  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setOAuthAccounts: (accounts: OAuthAccount[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      accessToken: null,
      oauthAccounts: [],

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
        }),

      setAccessToken: (accessToken) =>
        set({ accessToken }),

      setLoading: (isLoading) =>
        set({ isLoading }),

      setOAuthAccounts: (oauthAccounts) =>
        set({ oauthAccounts }),

      logout: () => {
        // Clear refresh token from localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('codearena-refresh-token');
        }
        set({
          user: null,
          isAuthenticated: false,
          accessToken: null,
          oauthAccounts: [],
          isLoading: false,
        });
      },
    }),
    {
      name: 'codearena-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
      }),
    }
  )
);
