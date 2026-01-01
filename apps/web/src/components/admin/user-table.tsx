'use client';

import { useState } from 'react';
import {
  Shield,
  ShieldAlert,
  Ban,
  MoreHorizontal,
  User,
  UserCog,
  ShieldCheck,
  Eye,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { type AdminUser } from '@/hooks';

// Simple relative time formatter
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface UserTableProps {
  users: AdminUser[];
  isLoading: boolean;
  onViewUser?: (user: AdminUser) => void;
  onBanUser?: (user: AdminUser) => void;
  onUnbanUser?: (user: AdminUser) => void;
  onEditRoles?: (user: AdminUser) => void;
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-500',
  moderator: 'bg-blue-500',
  user: 'bg-gray-500',
};

const roleIcons: Record<string, typeof User> = {
  admin: ShieldAlert,
  moderator: ShieldCheck,
  user: User,
};

export function UserTable({
  users,
  isLoading,
  onViewUser,
  onBanUser,
  onUnbanUser,
  onEditRoles,
}: UserTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  if (isLoading) {
    return <UserTableSkeleton />;
  }

  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <User className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-medium">No users found</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Try adjusting your filters or search terms
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-12 px-4 py-3"></th>
            <th className="px-4 py-3 text-left text-sm font-medium">User</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Roles</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Joined</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Last Active</th>
            <th className="w-12 px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className={`border-b last:border-b-0 hover:bg-muted/25 ${user.isBanned ? 'opacity-60' : ''}`}
            >
              <td className="px-4 py-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatarUrl || undefined} />
                  <AvatarFallback>
                    {user.displayName?.[0]?.toUpperCase() || user.email[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {user.displayName || 'No name'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {user.roles?.map((role) => {
                    const Icon = roleIcons[role] || User;
                    return (
                      <Badge
                        key={role}
                        className={`${roleColors[role] || 'bg-gray-500'} text-white`}
                      >
                        <Icon className="mr-1 h-3 w-3" />
                        {role}
                      </Badge>
                    );
                  })}
                </div>
              </td>
              <td className="px-4 py-3">
                {user.isBanned ? (
                  <Badge variant="destructive" className="gap-1">
                    <Ban className="h-3 w-3" />
                    Banned
                  </Badge>
                ) : user.isVerified ? (
                  <Badge variant="default" className="gap-1 bg-green-500">
                    <ShieldCheck className="h-3 w-3" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary">Unverified</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {formatRelativeTime(user.createdAt)}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {user.lastLoginAt
                  ? formatRelativeTime(user.lastLoginAt)
                  : 'Never'}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end">
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setOpenMenuId(openMenuId === user.id ? null : user.id)
                      }
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                    {openMenuId === user.id && (
                      <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
                        <button
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                          onClick={() => {
                            onViewUser?.(user);
                            setOpenMenuId(null);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                          View Details
                        </button>
                        <button
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                          onClick={() => {
                            onEditRoles?.(user);
                            setOpenMenuId(null);
                          }}
                        >
                          <UserCog className="h-4 w-4" />
                          Edit Roles
                        </button>
                        <div className="my-1 border-t" />
                        {user.isBanned ? (
                          <button
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                            onClick={() => {
                              onUnbanUser?.(user);
                              setOpenMenuId(null);
                            }}
                          >
                            <ShieldCheck className="h-4 w-4" />
                            Unban User
                          </button>
                        ) : (
                          <button
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => {
                              onBanUser?.(user);
                              setOpenMenuId(null);
                            }}
                            disabled={user.roles?.includes('admin')}
                          >
                            <Ban className="h-4 w-4" />
                            Ban User
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserTableSkeleton() {
  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-12 px-4 py-3"></th>
            <th className="px-4 py-3 text-left text-sm font-medium">User</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Roles</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Joined</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Last Active</th>
            <th className="w-12 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {[...Array(5)].map((_, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="px-4 py-3"><Skeleton className="h-8 w-8 rounded-full" /></td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-1 h-3 w-32" />
              </td>
              <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
              <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
              <td className="px-4 py-3"><Skeleton className="h-8 w-8" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
