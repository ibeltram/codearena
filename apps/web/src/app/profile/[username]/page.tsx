'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/main-layout';
import {
  ProfileHeader,
  MatchHistory,
  StatsCard,
  BadgesCard,
} from '@/components/profile';
import { useUserProfile, useUserMatchHistory, useTogglePublicArtifacts, useUpdateProfile } from '@/hooks/use-profile';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  User,
  History,
  BarChart3,
  Award,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/store';

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex gap-6">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="flex-1 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-20 w-24" />
              <Skeleton className="h-20 w-24" />
              <Skeleton className="h-20 w-24" />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Skeleton className="h-96" />
        </div>
        <div>
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [matchPage, setMatchPage] = useState(1);

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Get current user from auth store
  const { user: currentUser, isAuthenticated, setUser } = useAuthStore();

  // Fetch profile data from API
  const { data: profile, isLoading, isError } = useUserProfile(username);
  const { data: matchesData } = useUserMatchHistory(username, { page: matchPage, limit: 10 });
  const matches = matchesData?.data || [];

  const togglePublicArtifacts = useTogglePublicArtifacts();
  const updateProfile = useUpdateProfile();

  // Initialize form when profile loads or dialog opens
  useEffect(() => {
    if (profile?.user && editDialogOpen) {
      setEditDisplayName(profile.user.displayName || '');
      setEditAvatarUrl(profile.user.avatarUrl || '');
      setEditError(null);
    }
  }, [profile?.user, editDialogOpen]);

  // Check if viewing own profile by comparing with auth user
  const isOwnProfile = useMemo(() => {
    if (!isAuthenticated || !currentUser || !profile?.user) {
      return false;
    }
    // Check by ID or by username/displayName
    return currentUser.id === profile.user.id ||
           currentUser.displayName.toLowerCase() === username.toLowerCase();
  }, [isAuthenticated, currentUser, profile?.user, username]);

  const handleTogglePublicArtifacts = async (checked: boolean) => {
    try {
      await togglePublicArtifacts.mutateAsync(checked);
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="container max-w-6xl py-8">
          <ProfileSkeleton />
        </div>
      </MainLayout>
    );
  }

  if (isError || !profile) {
    return (
      <MainLayout>
        <div className="container max-w-6xl py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load profile. The user may not exist or there was a
              server error.
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container max-w-6xl py-8">
        {/* Profile Header */}
        <ProfileHeader
          profile={profile}
          isOwnProfile={isOwnProfile}
          onEditClick={() => setEditDialogOpen(true)}
        />

        {/* Content Tabs */}
        <Tabs defaultValue="matches" className="space-y-6">
          <TabsList>
            <TabsTrigger value="matches" className="gap-2">
              <History className="h-4 w-4" />
              Match History
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Statistics
            </TabsTrigger>
            <TabsTrigger value="badges" className="gap-2">
              <Award className="h-4 w-4" />
              Badges
            </TabsTrigger>
            {isOwnProfile && (
              <TabsTrigger value="settings" className="gap-2">
                <User className="h-4 w-4" />
                Settings
              </TabsTrigger>
            )}
          </TabsList>

          {/* Match History Tab */}
          <TabsContent value="matches">
            <MatchHistory
              matches={matches}
              currentUserId={profile.user.id}
              showLoadMore={matches.length >= 10}
              onLoadMore={() => setMatchPage((p) => p + 1)}
            />
          </TabsContent>

          {/* Statistics Tab */}
          <TabsContent value="stats">
            <StatsCard stats={profile.stats} />
          </TabsContent>

          {/* Badges Tab */}
          <TabsContent value="badges">
            <BadgesCard badges={profile.badges} />
          </TabsContent>

          {/* Settings Tab (only for own profile) */}
          {isOwnProfile && (
            <TabsContent value="settings">
              <Card>
                <CardContent className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">
                      Privacy Settings
                    </h3>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label
                          htmlFor="public-artifacts"
                          className="text-base flex items-center gap-2"
                        >
                          {profile.user.preferences.publicArtifacts ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                          Public Artifacts
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Allow other users to view your submitted code
                        </p>
                      </div>
                      <Switch
                        id="public-artifacts"
                        checked={profile.user.preferences.publicArtifacts}
                        onCheckedChange={handleTogglePublicArtifacts}
                        disabled={togglePublicArtifacts.isPending}
                      />
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Account Information
                    </h3>
                    <div className="space-y-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Email</span>
                        <span>{profile.user.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Member Since
                        </span>
                        <span>
                          {new Date(profile.user.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Last Active
                        </span>
                        <span>
                          {profile.user.lastLoginAt
                            ? new Date(
                                profile.user.lastLoginAt
                              ).toLocaleDateString()
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* Edit Profile Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
              <DialogDescription>
                Update your display name and avatar.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setEditError(null);

                // Validate
                if (!editDisplayName.trim()) {
                  setEditError('Display name is required');
                  return;
                }
                if (editDisplayName.trim().length < 2) {
                  setEditError('Display name must be at least 2 characters');
                  return;
                }
                if (editAvatarUrl && !editAvatarUrl.match(/^https?:\/\/.+/)) {
                  setEditError('Avatar URL must be a valid URL');
                  return;
                }

                try {
                  const result = await updateProfile.mutateAsync({
                    displayName: editDisplayName.trim(),
                    avatarUrl: editAvatarUrl.trim() || undefined,
                  });

                  // Update auth store if the user data is returned
                  if (result?.data && currentUser) {
                    setUser({
                      ...currentUser,
                      displayName: result.data.displayName,
                      avatarUrl: result.data.avatarUrl || null,
                    });
                  }

                  setEditDialogOpen(false);
                } catch (error) {
                  setEditError('Failed to update profile. Please try again.');
                  console.error('Profile update error:', error);
                }
              }}
            >
              <div className="space-y-6 py-4">
                {/* Avatar Preview */}
                <div className="flex justify-center">
                  <Avatar className="h-20 w-20 border-2 border-muted">
                    <AvatarImage src={editAvatarUrl || undefined} alt="Avatar preview" />
                    <AvatarFallback className="text-xl font-bold bg-primary text-primary-foreground">
                      {editDisplayName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2) || '?'}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Display Name */}
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    placeholder="Your display name"
                    maxLength={100}
                    autoComplete="name"
                  />
                  <p className="text-xs text-muted-foreground">
                    This is how your name will appear on the platform.
                  </p>
                </div>

                {/* Avatar URL */}
                <div className="space-y-2">
                  <Label htmlFor="avatarUrl">Avatar URL (optional)</Label>
                  <Input
                    id="avatarUrl"
                    value={editAvatarUrl}
                    onChange={(e) => setEditAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                    type="url"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter a URL to an image for your profile picture.
                  </p>
                </div>

                {/* Error message */}
                {editError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-sm text-destructive">{editError}</p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  disabled={updateProfile.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
      </div>
    </MainLayout>
  );
}
