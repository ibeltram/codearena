'use client';

import { useState, useEffect } from 'react';
import { UserCog, Loader2, AlertTriangle, ShieldAlert, ShieldCheck, User } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUpdateUserRoles, type AdminUser } from '@/hooks';

interface EditRolesDialogProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Role = 'user' | 'admin' | 'moderator';

const roleOptions: { value: Role; label: string; description: string; icon: typeof User }[] = [
  {
    value: 'user',
    label: 'User',
    description: 'Basic platform access - can participate in matches and tournaments',
    icon: User,
  },
  {
    value: 'moderator',
    label: 'Moderator',
    description: 'Can review disputes and moderate content',
    icon: ShieldCheck,
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full administrative access - can manage users, challenges, and settings',
    icon: ShieldAlert,
  },
];

export function EditRolesDialog({ user, open, onOpenChange }: EditRolesDialogProps) {
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [error, setError] = useState('');

  const updateRolesMutation = useUpdateUserRoles();

  // Initialize selected roles when user changes
  useEffect(() => {
    if (user?.roles) {
      setSelectedRoles(user.roles as Role[]);
    }
  }, [user]);

  const handleRoleToggle = (role: Role, checked: boolean) => {
    if (checked) {
      setSelectedRoles((prev) => [...prev, role]);
    } else {
      setSelectedRoles((prev) => prev.filter((r) => r !== role));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (selectedRoles.length === 0) {
      setError('At least one role must be selected');
      return;
    }

    if (!user) return;

    try {
      await updateRolesMutation.mutateAsync({
        userId: user.id,
        data: { roles: selectedRoles },
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update roles');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setError('');
      if (user?.roles) {
        setSelectedRoles(user.roles as Role[]);
      }
    }
    onOpenChange(newOpen);
  };

  const hasChanges =
    user &&
    (selectedRoles.length !== user.roles?.length ||
      selectedRoles.some((r) => !user.roles?.includes(r)));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Edit User Roles
          </DialogTitle>
          <DialogDescription>
            Update the roles assigned to this user. Roles determine what actions they can perform.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.avatarUrl || undefined} />
              <AvatarFallback>
                {user.displayName?.[0]?.toUpperCase() || user.email[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user.displayName || 'No name'}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {roleOptions.map(({ value, label, description, icon: Icon }) => (
              <div
                key={value}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/30"
              >
                <div className="flex-1">
                  <Label
                    htmlFor={`role-${value}`}
                    className="flex cursor-pointer items-center gap-2 font-medium"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                </div>
                <Switch
                  id={`role-${value}`}
                  checked={selectedRoles.includes(value)}
                  onCheckedChange={(checked) => handleRoleToggle(value, checked)}
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={updateRolesMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateRolesMutation.isPending || !hasChanges}>
              {updateRolesMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
