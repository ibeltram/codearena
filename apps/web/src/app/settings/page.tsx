'use client';

import { useState } from 'react';
import {
  Settings,
  Download,
  Trash2,
  Loader2,
  AlertTriangle,
  Shield,
  Bell,
  User,
  Check,
  X,
} from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useDeletionStatus,
  useExportData,
  useRequestDeletion,
  useCancelDeletion,
} from '@/hooks';
import { useAuthStore } from '@/store';

export default function SettingsPage() {
  const { user, isAuthenticated } = useAuthStore();
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data: deletionStatus, isLoading: isLoadingStatus } = useDeletionStatus();
  const exportMutation = useExportData();
  const deletionMutation = useRequestDeletion();
  const cancelDeletionMutation = useCancelDeletion();

  const handleExportData = async () => {
    try {
      await exportMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  };

  const handleRequestDeletion = async () => {
    if (deleteConfirmText !== 'DELETE MY ACCOUNT') {
      return;
    }

    try {
      await deletionMutation.mutateAsync(deleteConfirmText);
      setIsDeleteDialogOpen(false);
      setDeleteConfirmText('');
    } catch (error) {
      console.error('Failed to request deletion:', error);
    }
  };

  const handleCancelDeletion = async () => {
    try {
      await cancelDeletionMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to cancel deletion:', error);
    }
  };

  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sign In Required</h3>
              <p className="text-muted-foreground">
                Please sign in to access your account settings.
              </p>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  const isPendingDeletion = deletionStatus?.status === 'pending_deletion';

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Account Settings</h1>
            <p className="text-muted-foreground">
              Manage your account preferences and data
            </p>
          </div>
        </div>

        {/* Pending Deletion Alert */}
        {isPendingDeletion && deletionStatus && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Account Deletion Scheduled</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Your account is scheduled for deletion on{' '}
                <strong>
                  {new Date(deletionStatus.deletionScheduledAt!).toLocaleDateString()}
                </strong>
                . You have <strong>{deletionStatus.daysRemaining} days</strong> remaining to
                cancel this request.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelDeletion}
                disabled={cancelDeletionMutation.isPending}
                className="mt-2"
              >
                {cancelDeletionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-2 h-4 w-4" />
                )}
                Cancel Deletion
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Your basic profile information visible to other users
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-muted-foreground">Display Name</Label>
                <p className="font-medium">{user?.displayName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium">{user?.email}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={`/profile/${user?.id}`}>View Public Profile</a>
            </Button>
          </CardContent>
        </Card>

        {/* Data & Privacy Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Data & Privacy
            </CardTitle>
            <CardDescription>
              Export your data or manage your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Data Export */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex-1">
                <h4 className="font-medium flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export Your Data
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Download a copy of all your personal data, including your profile,
                  match history, transactions, and more. The data will be provided as a
                  JSON file.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleExportData}
                disabled={exportMutation.isPending || isPendingDeletion}
              >
                {exportMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Download Data
                  </>
                )}
              </Button>
            </div>

            {/* Data Export Success */}
            {exportMutation.isSuccess && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <Check className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  Your data export has been downloaded successfully.
                </AlertDescription>
              </Alert>
            )}

            {/* Delete Account */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-destructive/50 bg-destructive/5">
              <div className="flex-1">
                <h4 className="font-medium flex items-center gap-2 text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete Account
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Permanently delete your account and all associated data. This action
                  has a 30-day grace period during which you can cancel the request.
                </p>
              </div>
              <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" disabled={isPendingDeletion}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Delete Your Account?
                    </DialogTitle>
                    <DialogDescription>
                      This will schedule your account for permanent deletion. You will have
                      30 days to change your mind before all your data is permanently removed.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Warning:</strong> After 30 days, this action cannot be undone.
                        All your data including:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Profile information</li>
                          <li>Match history</li>
                          <li>Rankings and ratings</li>
                          <li>Credit balance</li>
                          <li>Prize claims</li>
                        </ul>
                        will be permanently deleted.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      <Label htmlFor="confirm">
                        Type <strong className="text-destructive">DELETE MY ACCOUNT</strong> to
                        confirm
                      </Label>
                      <Input
                        id="confirm"
                        placeholder="DELETE MY ACCOUNT"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsDeleteDialogOpen(false);
                        setDeleteConfirmText('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleRequestDeletion}
                      disabled={
                        deleteConfirmText !== 'DELETE MY ACCOUNT' ||
                        deletionMutation.isPending
                      }
                    >
                      {deletionMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete My Account
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Deletion Error */}
            {deletionMutation.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Failed to request account deletion. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Info Section */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Your Privacy Matters</p>
                <p>
                  RepoRivals is committed to protecting your privacy. You have the right to
                  access and export all your personal data, as well as the right to delete
                  your account at any time. For more information, please review our{' '}
                  <a href="/privacy" className="text-primary hover:underline">
                    Privacy Policy
                  </a>
                  .
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
