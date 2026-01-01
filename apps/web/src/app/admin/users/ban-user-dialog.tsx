'use client';

import { useState } from 'react';
import { Ban, Loader2, AlertTriangle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { type AdminUser } from '@/hooks';

interface BanUserDialogProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBan: (reason: string) => Promise<void>;
  isLoading: boolean;
}

export function BanUserDialog({
  user,
  open,
  onOpenChange,
  onBan,
  isLoading,
}: BanUserDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (reason.trim().length < 5) {
      setError('Reason must be at least 5 characters');
      return;
    }

    try {
      await onBan(reason);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ban user');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setReason('');
      setError('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Ban className="h-5 w-5" />
            Ban User
          </DialogTitle>
          <DialogDescription>
            This will prevent the user from accessing the platform. They will not be able to
            participate in matches or make transactions.
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
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for ban *</Label>
            <Textarea
              id="reason"
              placeholder="Explain why this user is being banned..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              minLength={5}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {reason.length}/500 characters (minimum 5)
            </p>
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
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Banning...
                </>
              ) : (
                <>
                  <Ban className="mr-2 h-4 w-4" />
                  Ban User
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
