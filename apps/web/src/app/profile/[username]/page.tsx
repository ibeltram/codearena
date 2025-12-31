'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/main-layout';
import {
  ProfileHeader,
  MatchHistory,
  StatsCard,
  BadgesCard,
} from '@/components/profile';
import { useUserProfile, useUserMatchHistory, useTogglePublicArtifacts } from '@/hooks/use-profile';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  User,
  History,
  BarChart3,
  Award,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuthStore } from '@/store';

// Mock data for development (will be replaced by API calls)
const mockProfile = {
  user: {
    id: 'user-1',
    email: 'coder@example.com',
    displayName: 'ProCoder',
    avatarUrl: null,
    createdAt: '2024-01-15T10:00:00Z',
    lastLoginAt: '2024-12-30T10:00:00Z',
    roles: ['user'] as const,
    isBanned: false,
    isVerified: true,
    preferences: {
      publicArtifacts: true,
      emailNotifications: true,
    },
  },
  ranking: {
    id: 'rank-1',
    seasonId: 'season-1',
    seasonName: 'Season 1',
    rating: 1650,
    deviation: 75,
    volatility: 0.06,
    rank: 42,
    percentile: 85,
    updatedAt: '2024-12-30T10:00:00Z',
  },
  stats: {
    totalMatches: 47,
    wins: 28,
    losses: 15,
    draws: 4,
    winRate: 0.596,
    currentStreak: 3,
    bestStreak: 7,
    averageScore: 78.5,
    byCategory: [
      {
        category: 'frontend' as const,
        matchesPlayed: 20,
        wins: 14,
        losses: 5,
        draws: 1,
        winRate: 0.7,
        averageScore: 82,
      },
      {
        category: 'backend' as const,
        matchesPlayed: 15,
        wins: 8,
        losses: 6,
        draws: 1,
        winRate: 0.533,
        averageScore: 75,
      },
      {
        category: 'fullstack' as const,
        matchesPlayed: 12,
        wins: 6,
        losses: 4,
        draws: 2,
        winRate: 0.5,
        averageScore: 77,
      },
    ],
  },
  badges: [
    {
      id: 'badge-1',
      name: 'First Win',
      description: 'Won your first match',
      icon: 'trophy',
      earnedAt: '2024-01-20T10:00:00Z',
    },
    {
      id: 'badge-2',
      name: 'Hot Streak',
      description: 'Won 5 matches in a row',
      icon: 'flame',
      earnedAt: '2024-03-15T10:00:00Z',
    },
    {
      id: 'badge-3',
      name: 'Frontend Master',
      description: 'Won 10 frontend challenges',
      icon: 'star',
      earnedAt: '2024-06-10T10:00:00Z',
    },
  ],
  recentMatches: [],
};

const mockMatches = [
  {
    id: 'match-1',
    status: 'finalized' as const,
    mode: 'ranked' as const,
    createdBy: 'user-1',
    createdAt: '2024-12-29T14:00:00Z',
    startAt: '2024-12-29T14:05:00Z',
    endAt: '2024-12-29T14:35:00Z',
    lockAt: '2024-12-29T14:35:00Z',
    disputeStatus: 'none' as const,
    challengeVersion: { id: 'cv-1', versionNumber: 1 },
    challenge: {
      id: 'c-1',
      slug: 'react-dashboard',
      title: 'React Dashboard Challenge',
      category: 'frontend' as const,
      difficulty: 'medium' as const,
    },
  },
  {
    id: 'match-2',
    status: 'finalized' as const,
    mode: 'ranked' as const,
    createdBy: 'user-2',
    createdAt: '2024-12-28T10:00:00Z',
    startAt: '2024-12-28T10:05:00Z',
    endAt: '2024-12-28T10:35:00Z',
    lockAt: '2024-12-28T10:35:00Z',
    disputeStatus: 'none' as const,
    challengeVersion: { id: 'cv-2', versionNumber: 1 },
    challenge: {
      id: 'c-2',
      slug: 'api-design',
      title: 'REST API Design',
      category: 'backend' as const,
      difficulty: 'hard' as const,
    },
  },
  {
    id: 'match-3',
    status: 'in_progress' as const,
    mode: 'invite' as const,
    createdBy: 'user-1',
    createdAt: '2024-12-30T09:00:00Z',
    startAt: '2024-12-30T09:05:00Z',
    endAt: null,
    lockAt: null,
    disputeStatus: 'none' as const,
    challengeVersion: { id: 'cv-3', versionNumber: 2 },
    challenge: {
      id: 'c-3',
      slug: 'fullstack-todo',
      title: 'Full-Stack Todo App',
      category: 'fullstack' as const,
      difficulty: 'easy' as const,
    },
  },
];

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

  // Get current user from auth store
  const { user: currentUser, isAuthenticated } = useAuthStore();

  // Fetch profile data from API
  const { data: profile, isLoading, isError } = useUserProfile(username);
  const { data: matchesData } = useUserMatchHistory(username, { page: matchPage, limit: 10 });
  const matches = matchesData?.data || [];

  const togglePublicArtifacts = useTogglePublicArtifacts();

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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
              <DialogDescription>
                Update your display name and avatar.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground text-center">
                Profile editing coming soon!
              </p>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
