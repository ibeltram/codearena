'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Swords,
  Trophy,
  Wallet,
  User,
  Settings,
  BarChart3,
  ChevronLeft,
  Shield,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuthStore, useUIStore } from '@/store';

const mainNavItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/challenges', label: 'Challenges', icon: Swords },
  { href: '/matches', label: 'Matches', icon: Swords },
  { href: '/ranked', label: 'Ranked', icon: BarChart3 },
  { href: '/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/leaderboard', label: 'Leaderboard', icon: BarChart3 },
];

const userNavItems = [
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const adminNavItems = [
  { href: '/admin', label: 'Admin Panel', icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
  const { sidebarOpen, sidebarCollapsed, setSidebarOpen, setSidebarCollapsed } =
    useUIStore();

  const isAdmin = user?.role === 'admin' || user?.role === 'moderator';

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background transition-transform md:static md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed && 'md:w-16'
        )}
      >
        {/* Sidebar header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          {!sidebarCollapsed && (
            <Link href="/" className="flex items-center space-x-2">
              <Swords className="h-6 w-6 text-primary" />
              <span className="font-bold">CodeArena</span>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <ChevronLeft
              className={cn(
                'h-4 w-4 transition-transform',
                sidebarCollapsed && 'rotate-180'
              )}
            />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {/* Main navigation */}
          <div className="space-y-1">
            {mainNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </div>

          {/* User navigation (authenticated only) */}
          {isAuthenticated && (
            <>
              <Separator className="my-4" />
              <div className="space-y-1">
                {userNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      pathname === item.href
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* Admin navigation */}
          {isAdmin && (
            <>
              <Separator className="my-4" />
              <div className="space-y-1">
                {adminNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      pathname.startsWith(item.href)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </Link>
                ))}
              </div>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
