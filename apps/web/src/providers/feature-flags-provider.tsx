'use client';

/**
 * Feature Flags Provider
 *
 * Provides feature flag state to the React application.
 * Fetches flags from the API and caches them.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Feature flags context type
interface FeatureFlagsContextType {
  flags: Record<string, boolean>;
  isLoading: boolean;
  error: Error | null;
  isFeatureEnabled: (flagKey: string, defaultValue?: boolean) => boolean;
  refreshFlags: () => Promise<void>;
}

// Default context value
const defaultContext: FeatureFlagsContextType = {
  flags: {},
  isLoading: true,
  error: null,
  isFeatureEnabled: () => false,
  refreshFlags: async () => {},
};

// Create the context
const FeatureFlagsContext = createContext<FeatureFlagsContextType>(defaultContext);

// API URL from environment or default
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3012';

// Provider props
interface FeatureFlagsProviderProps {
  children: React.ReactNode;
  // Optional initial flags (for SSR)
  initialFlags?: Record<string, boolean>;
  // Optional custom API URL
  apiUrl?: string;
}

/**
 * Feature Flags Provider Component
 */
export function FeatureFlagsProvider({
  children,
  initialFlags = {},
  apiUrl = API_URL,
}: FeatureFlagsProviderProps) {
  const [flags, setFlags] = useState<Record<string, boolean>>(initialFlags);
  const [isLoading, setIsLoading] = useState(Object.keys(initialFlags).length === 0);
  const [error, setError] = useState<Error | null>(null);

  // Fetch flags from API
  const fetchFlags = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${apiUrl}/api/feature-flags`, {
        method: 'GET',
        credentials: 'include', // Include cookies for auth
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch feature flags: ${response.status}`);
      }

      const data = await response.json();
      setFlags(data.flags || {});
    } catch (err) {
      console.error('Error fetching feature flags:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch feature flags'));
      // Keep existing flags on error
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  // Refresh flags function
  const refreshFlags = useCallback(async () => {
    await fetchFlags();
  }, [fetchFlags]);

  // Check if a feature is enabled
  const isFeatureEnabled = useCallback(
    (flagKey: string, defaultValue = false): boolean => {
      if (flagKey in flags) {
        return flags[flagKey];
      }
      return defaultValue;
    },
    [flags]
  );

  // Fetch flags on mount
  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  // Set up periodic refresh (every 5 minutes)
  useEffect(() => {
    const intervalId = setInterval(
      () => {
        fetchFlags();
      },
      5 * 60 * 1000
    );

    return () => clearInterval(intervalId);
  }, [fetchFlags]);

  const value: FeatureFlagsContextType = {
    flags,
    isLoading,
    error,
    isFeatureEnabled,
    refreshFlags,
  };

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

/**
 * Hook to access feature flags context
 */
export function useFeatureFlagsContext(): FeatureFlagsContextType {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlagsContext must be used within a FeatureFlagsProvider');
  }
  return context;
}

/**
 * Hook to check if a specific feature is enabled
 *
 * @param flagKey - The feature flag key to check
 * @param defaultValue - Default value if flag is not found (default: false)
 * @returns Whether the feature is enabled
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isNewUIEnabled = useFeatureFlag('new-match-ui');
 *
 *   if (isNewUIEnabled) {
 *     return <NewMatchUI />;
 *   }
 *
 *   return <OldMatchUI />;
 * }
 * ```
 */
export function useFeatureFlag(flagKey: string, defaultValue = false): boolean {
  const { isFeatureEnabled, isLoading } = useFeatureFlagsContext();

  // Return default while loading to avoid flash
  if (isLoading) {
    return defaultValue;
  }

  return isFeatureEnabled(flagKey, defaultValue);
}

/**
 * Hook to get multiple feature flags at once
 *
 * @param flagKeys - Array of flag keys to check
 * @returns Object with flag keys and their values
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const flags = useFeatureFlags(['ai-judge', 'new-match-ui', 'dark-mode']);
 *
 *   return (
 *     <div>
 *       {flags['ai-judge'] && <AIJudgeSection />}
 *       {flags['dark-mode'] && <DarkModeToggle />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFeatureFlags(flagKeys: string[]): Record<string, boolean> {
  const { isFeatureEnabled, isLoading } = useFeatureFlagsContext();

  const result: Record<string, boolean> = {};

  for (const key of flagKeys) {
    result[key] = isLoading ? false : isFeatureEnabled(key);
  }

  return result;
}

/**
 * Component that renders children only if a feature flag is enabled
 *
 * @example
 * ```tsx
 * <FeatureGate flagKey="new-feature">
 *   <NewFeatureComponent />
 * </FeatureGate>
 *
 * <FeatureGate flagKey="beta-feature" fallback={<ComingSoon />}>
 *   <BetaFeature />
 * </FeatureGate>
 * ```
 */
interface FeatureGateProps {
  flagKey: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ flagKey, children, fallback = null }: FeatureGateProps) {
  const isEnabled = useFeatureFlag(flagKey);

  if (isEnabled) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

// Re-export types
export type { FeatureFlagsContextType, FeatureFlagsProviderProps, FeatureGateProps };
