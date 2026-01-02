'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileCode,
  AlertTriangle,
  Users,
  Settings,
  Shield,
  Gift,
  History,
  Flag,
  Award,
  Package,
  Receipt,
  type LucideIcon,
} from 'lucide-react';

import { Header } from '@/components/layout/header';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  subItems?: { href: string; label: string; icon: LucideIcon }[];
}

const adminNavItems: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/challenges', label: 'Challenges', icon: FileCode },
  { href: '/admin/disputes', label: 'Disputes', icon: AlertTriangle },
  { href: '/admin/reports', label: 'User Reports', icon: Flag },
  { href: '/admin/prize-claims', label: 'Prize Claims', icon: Gift },
  {
    href: '/admin/rewards',
    label: 'Rewards',
    icon: Award,
    subItems: [
      { href: '/admin/rewards/partners', label: 'Partners', icon: Award },
      { href: '/admin/rewards/inventory', label: 'Inventory', icon: Package },
      { href: '/admin/rewards/redemptions', label: 'Redemptions', icon: Receipt },
    ],
  },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/audit', label: 'Audit Log', icon: History },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Admin Sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-muted/30 lg:flex">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Shield className="h-6 w-6 text-primary" />
          <span className="font-bold">Admin Panel</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {adminNavItems.map((item) => {
            const isActive =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            // Handle items with sub-navigation
            if (item.subItems) {
              return (
                <div key={item.href} className="space-y-1">
                  <div
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      isActive
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </div>
                  <div className="ml-4 space-y-1 border-l pl-3">
                    {item.subItems.map((subItem) => {
                      const isSubActive = pathname === subItem.href;
                      const SubIcon = subItem.icon;
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                            isSubActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <SubIcon className="h-4 w-4" />
                          {subItem.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Back to App */}
        <div className="border-t p-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <span>Back to App</span>
          </Link>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="container py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
