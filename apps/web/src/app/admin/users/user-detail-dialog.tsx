'use client';

import {
  User,
  Mail,
  Calendar,
  Clock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Activity,
} from 'lucide-react';

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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAdminUser, type AdminUser } from '@/hooks';

interface UserDetailDialogProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-500',
  moderator: 'bg-blue-500',
  user: 'bg-gray-500',
};

const eventTypeLabels: Record<string, string> = {
  user_roles_updated: 'Roles Updated',
  user_banned: 'User Banned',
  user_unbanned: 'User Unbanned',
  login: 'Login',
  logout: 'Logout',
  profile_updated: 'Profile Updated',
};

export function UserDetailDialog({ user, open, onOpenChange }: UserDetailDialogProps) {
  const { data, isLoading } = useAdminUser(open ? user?.id : undefined);

  const userDetail = data?.user;
  const auditHistory = data?.auditHistory || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user?.avatarUrl || undefined} />
              <AvatarFallback>
                {user?.displayName?.[0]?.toUpperCase() || user?.email[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <span>{user?.displayName || 'User Details'}</span>
          </DialogTitle>
          <DialogDescription>
            View user information and activity history
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : userDetail ? (
          <div className="space-y-6">
            {/* User Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{userDetail.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Display Name</p>
                  <p className="text-sm font-medium">{userDetail.displayName || 'Not set'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Joined</p>
                  <p className="text-sm font-medium">
                    {formatDate(userDetail.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Last Active</p>
                  <p className="text-sm font-medium">
                    {userDetail.lastLoginAt
                      ? formatRelativeTime(userDetail.lastLoginAt)
                      : 'Never'}
                  </p>
                </div>
              </div>
            </div>

            {/* Status and Roles */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Roles:</span>
                {userDetail.roles?.map((role) => (
                  <Badge key={role} className={`${roleColors[role] || 'bg-gray-500'} text-white`}>
                    {role}
                  </Badge>
                ))}
              </div>

              <Separator orientation="vertical" className="h-6" />

              <div className="flex items-center gap-2">
                {userDetail.isBanned ? (
                  <Badge variant="destructive" className="gap-1">
                    <Ban className="h-3 w-3" />
                    Banned
                  </Badge>
                ) : userDetail.isVerified ? (
                  <Badge variant="default" className="gap-1 bg-green-500">
                    <ShieldCheck className="h-3 w-3" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary">Unverified</Badge>
                )}
              </div>
            </div>

            <Separator />

            {/* Audit History */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4" />
                Recent Activity
              </h3>

              {auditHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded</p>
              ) : (
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {auditHistory.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start justify-between rounded-lg border bg-muted/30 p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {eventTypeLabels[event.eventType] || event.eventType}
                          </p>
                          {event.payloadJson && Object.keys(event.payloadJson).length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {JSON.stringify(event.payloadJson)}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(event.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">User not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
