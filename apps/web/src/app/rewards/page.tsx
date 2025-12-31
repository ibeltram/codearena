'use client';

import { useState } from 'react';
import { Gift, Coins, Sparkles, Zap, Server, AlertCircle } from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { PartnerCard, PartnerCardSkeleton } from '@/components/rewards';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useRewardPartners, useRedeemReward, useCreditBalance } from '@/hooks';
import {
  PartnerReward,
  RewardTier,
  RewardType,
  formatCreditsRequired,
  rewardTypeLabels,
} from '@/types/rewards';
import { formatCredits } from '@/types/wallet';

export default function RewardsPage() {
  const [selectedType, setSelectedType] = useState<RewardType | 'all'>('all');
  const [selectedPartner, setSelectedPartner] = useState<PartnerReward | null>(
    null
  );
  const [selectedTier, setSelectedTier] = useState<RewardTier | null>(null);
  const [showRedemptionModal, setShowRedemptionModal] = useState(false);
  const [redemptionResult, setRedemptionResult] = useState<{
    code: string;
    partner: string;
    tier: string;
  } | null>(null);

  // Fetch data
  const {
    data: partnersResponse,
    isLoading: loadingPartners,
    error: partnersError,
  } = useRewardPartners(
    selectedType !== 'all' ? { rewardType: selectedType } : {}
  );
  const { data: balanceResponse } = useCreditBalance();
  const redeemMutation = useRedeemReward();

  const partners = partnersResponse?.data || [];
  const userBalance = balanceResponse?.data?.available || 0;

  // Filter partners by type
  const filteredPartners =
    selectedType === 'all'
      ? partners
      : partners.filter((p) => p.rewardType === selectedType);

  const handleSelectTier = (partner: PartnerReward, tier: RewardTier) => {
    setSelectedPartner(partner);
    setSelectedTier(tier);
    setShowRedemptionModal(true);
  };

  const handleRedeem = async () => {
    if (!selectedPartner || !selectedTier) return;

    try {
      const result = await redeemMutation.mutateAsync({
        partnerSlug: selectedPartner.partnerSlug,
        tierSlug: selectedTier.slug,
      });

      setRedemptionResult({
        code: result.data.code,
        partner: selectedPartner.name,
        tier: selectedTier.name,
      });
      setShowRedemptionModal(false);
    } catch (error) {
      console.error('Redemption failed:', error);
    }
  };

  const closeModals = () => {
    setShowRedemptionModal(false);
    setSelectedPartner(null);
    setSelectedTier(null);
    setRedemptionResult(null);
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border p-8">
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,rgba(255,255,255,0.5))]" />
          <div className="relative space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Gift className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Rewards Marketplace</h1>
                <p className="text-muted-foreground">
                  Turn your wins into real value
                </p>
              </div>
            </div>

            <p className="max-w-2xl text-muted-foreground">
              Redeem your hard-earned credits for hosting credits, compute
              resources, and SaaS platform perks from our partner ecosystem.
            </p>

            {/* User Balance Display */}
            <div className="flex items-center gap-4 mt-4">
              <Card className="bg-card/50 backdrop-blur">
                <CardContent className="flex items-center gap-3 p-4">
                  <Coins className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Your Balance
                    </div>
                    <div className="text-2xl font-bold">
                      {formatCredits(userBalance)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button variant="outline" asChild>
                <a href="/wallet">Add Credits</a>
              </Button>
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <Tabs
          value={selectedType}
          onValueChange={(v) => setSelectedType(v as RewardType | 'all')}
        >
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="all" className="gap-2">
              <Sparkles className="h-4 w-4" />
              All Rewards
            </TabsTrigger>
            <TabsTrigger value="saas_offset" className="gap-2">
              <Zap className="h-4 w-4" />
              {rewardTypeLabels.saas_offset}
            </TabsTrigger>
            <TabsTrigger value="compute_credit" className="gap-2">
              <Server className="h-4 w-4" />
              {rewardTypeLabels.compute_credit}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedType} className="mt-6">
            {/* Error State */}
            {partnersError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Failed to load rewards partners. Please try again later.
                </AlertDescription>
              </Alert>
            )}

            {/* Loading State */}
            {loadingPartners && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <PartnerCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loadingPartners && filteredPartners.length === 0 && (
              <Card className="text-center py-12">
                <CardContent>
                  <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No Rewards Available</h3>
                  <p className="text-muted-foreground mt-2">
                    Check back soon for new partner rewards.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Partner Grid */}
            {!loadingPartners && filteredPartners.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredPartners.map((partner) => (
                  <PartnerCard
                    key={partner.id}
                    partner={partner}
                    userBalance={userBalance}
                    onSelectTier={handleSelectTier}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Redemption Confirmation Modal */}
        <Dialog open={showRedemptionModal} onOpenChange={setShowRedemptionModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Redemption</DialogTitle>
              <DialogDescription>
                You are about to redeem credits for a reward.
              </DialogDescription>
            </DialogHeader>

            {selectedPartner && selectedTier && (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted overflow-hidden">
                    {selectedPartner.logoUrl ? (
                      <img
                        src={selectedPartner.logoUrl}
                        alt={selectedPartner.name}
                        className="h-10 w-10 object-contain"
                      />
                    ) : (
                      <Gift className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold">{selectedPartner.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedTier.name}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tier Value</span>
                    <span>{selectedTier.valueDescription}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Credits Required</span>
                    <span className="font-semibold flex items-center gap-1">
                      <Coins className="h-3 w-3 text-primary" />
                      {formatCreditsRequired(selectedTier.creditsRequired)}
                    </span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Your Balance After
                      </span>
                      <span
                        className={
                          userBalance - selectedTier.creditsRequired < 0
                            ? 'text-destructive'
                            : ''
                        }
                      >
                        {formatCredits(
                          userBalance - selectedTier.creditsRequired
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Once redeemed, you will receive a unique code that can be
                    used with {selectedPartner.name}. Redemptions are
                    non-refundable.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRedemptionModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRedeem}
                disabled={
                  redeemMutation.isPending ||
                  !selectedTier ||
                  selectedTier.creditsRequired > userBalance
                }
              >
                {redeemMutation.isPending ? 'Processing...' : 'Confirm Redemption'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Success Modal */}
        <Dialog
          open={!!redemptionResult}
          onOpenChange={(open) => !open && closeModals()}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-green-500 flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Redemption Successful!
              </DialogTitle>
              <DialogDescription>
                Your reward code has been generated.
              </DialogDescription>
            </DialogHeader>

            {redemptionResult && (
              <div className="space-y-4 py-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">
                    {redemptionResult.partner} - {redemptionResult.tier}
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">
                      Your Code
                    </div>
                    <div className="text-2xl font-mono font-bold tracking-wider">
                      {redemptionResult.code}
                    </div>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Copy this code and use it on the partner's website to
                    activate your reward. This code has been saved to your
                    account and can be viewed in "My Rewards".
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" asChild>
                <a href="/rewards/mine">View My Rewards</a>
              </Button>
              <Button onClick={closeModals}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
