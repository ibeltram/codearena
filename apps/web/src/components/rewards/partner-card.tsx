'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Gift, Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PartnerReward,
  RewardTier,
  formatCreditsRequired,
  getTierAvailabilityStatus,
  rewardTypeLabels,
} from '@/types/rewards';

interface PartnerCardProps {
  partner: PartnerReward;
  userBalance?: number;
  onSelectTier: (partner: PartnerReward, tier: RewardTier) => void;
}

export function PartnerCard({
  partner,
  userBalance = 0,
  onSelectTier,
}: PartnerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const lowestTier = partner.tiers.reduce(
    (min, tier) =>
      tier.creditsRequired < min.creditsRequired ? tier : min,
    partner.tiers[0]
  );

  const canAffordAny = partner.tiers.some(
    (tier) => tier.creditsRequired <= userBalance
  );

  return (
    <Card
      className={`relative transition-all hover:shadow-md ${
        canAffordAny ? 'hover:border-primary/50' : 'opacity-75'
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          {/* Partner Logo */}
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted overflow-hidden flex-shrink-0">
            {partner.logoUrl ? (
              <img
                src={partner.logoUrl}
                alt={`${partner.name} logo`}
                className="h-10 w-10 object-contain"
              />
            ) : (
              <Gift className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          {/* Partner Info */}
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg flex items-center gap-2">
              {partner.name}
            </CardTitle>
            <Badge variant="secondary" className="mt-1 text-xs">
              {rewardTypeLabels[partner.rewardType]}
            </Badge>
          </div>

          {/* Starting From */}
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-muted-foreground">From</div>
            <div className="font-semibold flex items-center gap-1">
              <Coins className="h-4 w-4 text-primary" />
              {formatCreditsRequired(lowestTier.creditsRequired)}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {partner.description}
        </p>

        {/* Tiers Grid */}
        <div className="grid gap-2">
          {(isExpanded ? partner.tiers : partner.tiers.slice(0, 2)).map(
            (tier) => {
              const canAfford = tier.creditsRequired <= userBalance;
              const availability = getTierAvailabilityStatus(tier.available);

              return (
                <div
                  key={tier.slug}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    canAfford
                      ? 'bg-card hover:bg-muted/50 cursor-pointer'
                      : 'bg-muted/30 opacity-60'
                  }`}
                  onClick={() => canAfford && onSelectTier(partner, tier)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{tier.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{tier.valueDescription}</span>
                      <span className={availability.color}>
                        {availability.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="font-semibold flex items-center gap-1">
                        <Coins className="h-3 w-3 text-primary" />
                        {formatCreditsRequired(tier.creditsRequired)}
                      </div>
                    </div>
                    {canAfford && tier.available !== 0 && (
                      <Button size="sm" variant="outline" className="h-8">
                        Redeem
                      </Button>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>

        {/* Expand/Collapse for more tiers */}
        {partner.tiers.length > 2 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Show {partner.tiers.length - 2} More Tiers
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Loading skeleton for partner cards
export function PartnerCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
          <div className="text-right space-y-1">
            <div className="h-3 w-12 bg-muted rounded" />
            <div className="h-5 w-16 bg-muted rounded" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-2/3 bg-muted rounded" />
        <div className="space-y-2">
          <div className="h-16 w-full bg-muted rounded" />
          <div className="h-16 w-full bg-muted rounded" />
        </div>
      </CardContent>
    </Card>
  );
}
