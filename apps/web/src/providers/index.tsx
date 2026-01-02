'use client';

import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';
import { FeatureFlagsProvider } from './feature-flags-provider';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      <QueryProvider>
        <FeatureFlagsProvider>
          {children}
        </FeatureFlagsProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

export { QueryProvider, ThemeProvider, FeatureFlagsProvider };
