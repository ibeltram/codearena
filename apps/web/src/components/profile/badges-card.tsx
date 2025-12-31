'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserBadge } from '@/types/user';
import { Award, Medal, Star, Zap, Crown, Target, Flame } from 'lucide-react';

interface BadgesCardProps {
  badges: UserBadge[];
}

// Map badge icons to Lucide icons
const badgeIcons: Record<string, React.ElementType> = {
  award: Award,
  medal: Medal,
  star: Star,
  zap: Zap,
  crown: Crown,
  target: Target,
  flame: Flame,
};

function getBadgeIcon(icon: string): React.ElementType {
  return badgeIcons[icon] || Award;
}

export function BadgesCard({ badges }: BadgesCardProps) {
  if (badges.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Badges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Award className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No badges earned yet</p>
            <p className="text-sm mt-1">
              Complete challenges to earn badges!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          Badges ({badges.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {badges.map((badge) => {
            const Icon = getBadgeIcon(badge.icon);
            return (
              <div
                key={badge.id}
                className="flex flex-col items-center p-4 bg-muted/50 rounded-lg text-center hover:bg-muted transition-colors"
              >
                <div className="p-3 bg-primary/10 rounded-full mb-2">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h4 className="font-medium text-sm">{badge.name}</h4>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {badge.description}
                </p>
                <Badge variant="outline" className="mt-2 text-xs">
                  {new Date(badge.earnedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
