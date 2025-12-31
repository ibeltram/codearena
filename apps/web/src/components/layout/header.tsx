'use client';

import Link from 'next/link';
import {
  Menu,
  Trophy,
  Wallet,
  Swords,
  Gift,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggleDropdown } from '@/components/ui/theme-toggle';
import { useAuthStore } from '@/store';
import { useUIStore } from '@/store';

export function Header() {
  const { user, isAuthenticated } = useAuthStore();
  const { toggleSidebar } = useUIStore();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        {/* Mobile menu button - touch-friendly 44px minimum */}
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 md:hidden min-h-[44px] min-w-[44px]"
          onClick={toggleSidebar}
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle menu</span>
        </Button>

        {/* Logo */}
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Swords className="h-6 w-6 text-primary" />
          <span className="hidden font-bold sm:inline-block">RepoRivals</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex md:flex-1 md:items-center md:space-x-6">
          <Link
            href="/challenges"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Challenges
          </Link>
          <Link
            href="/ranked"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Ranked
          </Link>
          <Link
            href="/tournaments"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="flex items-center gap-1">
              <Trophy className="h-4 w-4" />
              Tournaments
            </span>
          </Link>
          <Link
            href="/leaderboard"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Leaderboard
          </Link>
          <Link
            href="/rewards"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="flex items-center gap-1">
              <Gift className="h-4 w-4" />
              Rewards
            </span>
          </Link>
        </nav>

        {/* Right side actions - touch-friendly spacing */}
        <div className="flex flex-1 items-center justify-end space-x-1 sm:space-x-2">
          <ThemeToggleDropdown />
          {isAuthenticated && user ? (
            <>
              <Link href="/wallet">
                <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
                  <Wallet className="h-5 w-5" />
                  <span className="sr-only">Wallet</span>
                </Button>
              </Link>
              <Link href="/profile">
                <Button variant="ghost" size="sm" className="gap-2 min-h-[44px]">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user.avatarUrl || undefined} alt={user.displayName} />
                    <AvatarFallback>
                      {user.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline">{user.displayName}</span>
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm" className="min-h-[44px]">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="min-h-[44px] text-xs sm:text-sm">
                  <span className="sm:hidden">Start</span>
                  <span className="hidden sm:inline">Get Started</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
