'use client';

import { Header } from './header';
import { Sidebar } from './sidebar';
import { useUIStore } from '@/store';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { sidebarCollapsed } = useUIStore();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area - add left margin on desktop to account for sidebar */}
      <div
        className={cn(
          'flex flex-1 flex-col w-full',
          // On desktop (md+), add left margin for sidebar space
          'md:ml-64',
          // When collapsed on desktop, use smaller margin
          sidebarCollapsed && 'md:ml-16'
        )}
      >
        {/* Header */}
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="container py-4 px-4 sm:py-6 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
