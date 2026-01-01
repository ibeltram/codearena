'use client';

import { Shield, TrendingUp, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useStakeCap } from '@/hooks/use-stake-cap';
import { formatCredits } from '@/types/wallet';
import {
  stakeCapTierLabels,
  stakeCapTierColors,
  stakeCapTierIconColors,
  StakeCapTier,
} from '@/types/stake-cap';
import { cn } from '@/lib/utils';

function StakeCapSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function TierProgressBar({
  currentTier,
  rating,
  tiers,
}: {
  currentTier: StakeCapTier;
  rating: number;
  tiers: Record<StakeCapTier, { minRating: number; maxRating: number; cap: number }>;
}) {
  const tierOrder: StakeCapTier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  const currentIndex = tierOrder.indexOf(currentTier);

  // Calculate progress within current tier to next tier
  const currentTierInfo = tiers[currentTier];
  const nextTierIndex = Math.min(currentIndex + 1, tierOrder.length - 1);
  const nextTier = tierOrder[nextTierIndex];
  const nextTierInfo = tiers[nextTier];

  let progress = 100;
  let pointsToNext = 0;

  if (currentTier !== 'diamond') {
    const tierRange = nextTierInfo.minRating - currentTierInfo.minRating;
    const ratingInTier = rating - currentTierInfo.minRating;
    progress = Math.min(100, Math.max(0, (ratingInTier / tierRange) * 100));
    pointsToNext = nextTierInfo.minRating - rating;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Rating Progress</span>
        {currentTier !== 'diamond' && pointsToNext > 0 && (
          <span className="text-muted-foreground">
            {pointsToNext} points to {stakeCapTierLabels[nextTier]}
          </span>
        )}
      </div>
      <div className="flex gap-1">
        {tierOrder.map((tier, index) => (
          <div key={tier} className="flex-1 relative group">
            <div
              className={cn(
                'h-2 rounded-full transition-all',
                index < currentIndex
                  ? 'bg-primary'
                  : index === currentIndex
                  ? 'bg-primary/30'
                  : 'bg-muted'
              )}
            >
              {index === currentIndex && (
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              )}
            </div>
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {stakeCapTierLabels[tier]} ({tiers[tier].minRating}+)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StakeCapInfo() {
  const { data, isLoading, isError } = useStakeCap();

  if (isLoading) {
    return <StakeCapSkeleton />;
  }

  if (isError || !data) {
    return (
      <Card className="border-muted">
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            <span>Sign in to see your stake cap</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { stakeCap, stakeCapTier, rating, deviation, tiers } = data;
  const tierLabel = stakeCapTierLabels[stakeCapTier];
  const tierColorClass = stakeCapTierColors[stakeCapTier];
  const tierIconColor = stakeCapTierIconColors[stakeCapTier];

  // Check if stake cap is reduced due to high deviation
  const baseCapForTier = tiers[stakeCapTier].cap;
  const isReducedDueToDeviation = stakeCap < baseCapForTier;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Shield className={cn('h-5 w-5', tierIconColor)} />
          Stake Cap
        </CardTitle>
        <Badge className={cn('text-xs', tierColorClass)}>{tierLabel} Tier</Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Current stake cap */}
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-bold">{formatCredits(stakeCap)}</span>
              <span className="text-muted-foreground ml-2">credits max per match</span>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Rating: {rating}
              </div>
            </div>
          </div>

          {/* Deviation warning if applicable */}
          {isReducedDueToDeviation && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <Info className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              <div className="text-sm text-yellow-700 dark:text-yellow-400">
                Your stake cap is reduced from {formatCredits(baseCapForTier)} to{' '}
                {formatCredits(stakeCap)} due to high rating deviation ({Math.round(deviation)}).
                Play more matches to increase your cap!
              </div>
            </div>
          )}

          {/* Progress to next tier */}
          <TierProgressBar currentTier={stakeCapTier} rating={rating} tiers={tiers} />

          {/* Tier breakdown */}
          <div className="mt-6">
            <div className="text-sm font-medium mb-2 text-muted-foreground">
              Stake Cap Tiers
            </div>
            <div className="grid grid-cols-5 gap-1 text-center text-xs">
              {(['bronze', 'silver', 'gold', 'platinum', 'diamond'] as StakeCapTier[]).map(
                (tier) => (
                  <div
                    key={tier}
                    className={cn(
                      'p-2 rounded-lg transition-all',
                      tier === stakeCapTier
                        ? 'bg-primary/10 border border-primary/20'
                        : 'bg-muted/50'
                    )}
                  >
                    <div
                      className={cn(
                        'font-medium',
                        tier === stakeCapTier ? 'text-primary' : 'text-muted-foreground'
                      )}
                    >
                      {stakeCapTierLabels[tier]}
                    </div>
                    <div className="text-muted-foreground">{tiers[tier].minRating}+</div>
                    <div
                      className={cn(
                        'font-bold mt-1',
                        tier === stakeCapTier ? 'text-primary' : ''
                      )}
                    >
                      {formatCredits(tiers[tier].cap)}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
