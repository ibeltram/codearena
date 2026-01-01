'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  UserProfile,
  getRankTier,
  rankTierLabels,
  rankTierColors,
} from '@/types/user';
import {
  Trophy,
  Target,
  Flame,
  Share2,
  Settings,
  CheckCircle,
  Shield,
  Flag,
} from 'lucide-react';
import { ReportUserDialog } from './report-user-dialog';

interface ProfileHeaderProps {
  profile: UserProfile;
  isOwnProfile?: boolean;
  onEditClick?: () => void;
}

export function ProfileHeader({
  profile,
  isOwnProfile = false,
  onEditClick,
}: ProfileHeaderProps) {
  const { user, ranking, stats } = profile;
  const [copied, setCopied] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const rankTier = ranking ? getRankTier(ranking.rating) : null;

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const initials = user.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar and Basic Info */}
          <div className="flex items-start gap-4">
            <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
              <AvatarImage src={user.avatarUrl || undefined} alt={user.displayName} />
              <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{user.displayName}</h1>
                {user.isVerified && (
                  <CheckCircle className="h-5 w-5 text-blue-500" />
                )}
                {user.roles.includes('admin') && (
                  <Badge variant="destructive" className="text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Admin
                  </Badge>
                )}
                {user.roles.includes('moderator') && (
                  <Badge variant="secondary" className="text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Mod
                  </Badge>
                )}
              </div>

              {/* Rank Badge */}
              {ranking && rankTier && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={`${rankTierColors[rankTier]} font-semibold`}>
                    <Trophy className="h-3 w-3 mr-1" />
                    {rankTierLabels[rankTier]}
                  </Badge>
                  <span className="text-lg font-bold text-foreground">
                    {Math.round(ranking.rating)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    #{ranking.rank}
                  </span>
                </div>
              )}

              {/* Member since */}
              <p className="text-sm text-muted-foreground mt-2">
                Member since{' '}
                {new Date(user.createdAt).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="flex-1">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Target className="h-4 w-4" />
                  <span className="text-xs">Matches</span>
                </div>
                <p className="text-2xl font-bold">{stats.totalMatches}</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Trophy className="h-4 w-4" />
                  <span className="text-xs">Wins</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{stats.wins}</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Flame className="h-4 w-4" />
                  <span className="text-xs">Win Rate</span>
                </div>
                <p className="text-2xl font-bold">
                  {stats.totalMatches > 0
                    ? `${Math.round(stats.winRate * 100)}%`
                    : '-'}
                </p>
              </div>
            </div>

            {/* Streak Info */}
            {stats.currentStreak > 0 && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                <Flame className="h-4 w-4 text-orange-500" />
                <span className="font-medium">
                  {stats.currentStreak} game win streak!
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {isOwnProfile && (
              <Button variant="outline" size="sm" onClick={onEditClick}>
                <Settings className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="justify-start"
            >
              <Share2 className="h-4 w-4 mr-2" />
              {copied ? 'Copied!' : 'Share Profile'}
            </Button>
            {/* Report button - only show on other users' profiles */}
            {!isOwnProfile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReportDialogOpen(true)}
                className="justify-start text-muted-foreground hover:text-red-600"
              >
                <Flag className="h-4 w-4 mr-2" />
                Report User
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      {/* Report User Dialog */}
      {!isOwnProfile && (
        <ReportUserDialog
          userId={user.id}
          userName={user.displayName}
          isOpen={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
        />
      )}
    </Card>
  );
}
