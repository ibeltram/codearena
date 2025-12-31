import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type UserRole = 'user' | 'admin' | 'moderator';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  roles: UserRole[];
  githubUsername?: string;
}

/**
 * Helper function to check if a user has a specific role
 */
export function hasRole(user: User | null, role: UserRole): boolean {
  return user?.roles?.includes(role) ?? false;
}

/**
 * Helper function to check if a user has any of the specified roles
 */
export function hasAnyRole(user: User | null, roles: UserRole[]): boolean {
  if (!user?.roles) return false;
  return roles.some(role => user.roles.includes(role));
}

/**
 * Helper to check if user is admin
 */
export function isAdmin(user: User | null): boolean {
  return hasRole(user, 'admin');
}

/**
 * Helper to check if user is moderator or admin
 */
export function isModerator(user: User | null): boolean {
  return hasAnyRole(user, ['admin', 'moderator']);
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
          localStorage.removeItem('reporivals-refresh-token');
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
      name: 'reporivals-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
      }),
    }
  )
);
