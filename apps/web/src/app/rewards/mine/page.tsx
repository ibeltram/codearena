'use client';

import { useState } from 'react';
import {
  Gift,
  Trophy,
  History,
  Copy,
  Check,
  Mail,
  Clock,
  Filter,
  Coins,
  ChevronRight,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  useRewardRedemptions,
  useLeaderboardRewards,
  useClaimLeaderboardReward,
  useResendRedemptionCode,
} from '@/hooks';
import {
  RewardRedemption,
  RewardRedemptionStatus,
  LeaderboardPayout,
  redemptionStatusLabels,
  redemptionStatusColors,
  leaderboardTypeLabels,
  leaderboardPayoutStatusLabels,
  leaderboardPayoutStatusColors,
  formatCreditsRequired,
} from '@/types/rewards';

export default function MyRewardsPage() {
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'history'>('active');
  const [statusFilter, setStatusFilter] = useState<RewardRedemptionStatus | 'all'>('all');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [selectedRedemption, setSelectedRedemption] = useState<RewardRedemption | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Fetch data
  const { data: redemptionsResponse, isLoading: loadingRedemptions } = useRewardRedemptions({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    limit: 50,
  });
  const { data: leaderboardResponse, isLoading: loadingLeaderboard } = useLeaderboardRewards();

  const claimMutation = useClaimLeaderboardReward();
  const resendMutation = useResendRedemptionCode();

  const redemptions = redemptionsResponse?.data || [];
  const leaderboardRewards = leaderboardResponse?.data || [];

  // Get unique partners for filter
  const uniquePartners = [...new Set(redemptions.map((r) => r.partnerSlug))].filter(Boolean);

  // Filter redemptions
  const filteredRedemptions = redemptions.filter((r) => {
    if (partnerFilter !== 'all' && r.partnerSlug !== partnerFilter) return false;
    return true;
  });

  // Separate active (issued, not expired) vs history
  const activeRedemptions = filteredRedemptions.filter(
    (r) => r.status === 'issued' && (!r.expiresAt || new Date(r.expiresAt) > new Date())
  );
  const historyRedemptions = filteredRedemptions.filter(
    (r) => r.status !== 'issued' || (r.expiresAt && new Date(r.expiresAt) <= new Date())
  );

  // Pending leaderboard rewards (issued but not claimed)
  const pendingLeaderboardRewards = leaderboardRewards.filter((r) => r.status === 'issued');

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleClaimLeaderboardReward = async (payout: LeaderboardPayout) => {
    try {
      await claimMutation.mutateAsync(payout.id);
    } catch (error) {
      console.error('Failed to claim reward:', error);
    }
  };

  const handleResendCode = async (redemptionId: string) => {
    try {
      await resendMutation.mutateAsync(redemptionId);
    } catch (error) {
      console.error('Failed to resend code:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const getActivationInstructions = (partnerSlug: string | undefined): string => {
    if (!partnerSlug) return 'Visit the partner website to activate your code.';
    const instructions: Record<string, string> = {
      vercel: 'Visit vercel.com/account/billing and add your credits.',
      supabase: 'Go to supabase.com/dashboard/account/billing to apply.',
      railway: 'Navigate to railway.app/account/billing to redeem.',
      render: 'Visit dashboard.render.com/billing to use your code.',
      'fly-io': 'Go to fly.io/dashboard/billing to add credits.',
      sentry: 'Visit sentry.io/settings/billing/ to apply.',
      linear: 'Navigate to linear.app/settings/billing to redeem.',
      notion: 'Go to notion.so/settings-and-members/billing.',
    };
    return instructions[partnerSlug] || 'Visit the partner website to activate your code.';
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">My Rewards</h1>
              <p className="text-muted-foreground">
                Manage your redeemed rewards and claim leaderboard prizes
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <a href="/rewards">
              Browse Rewards
              <ChevronRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="active" className="gap-2">
              <Gift className="h-4 w-4" />
              Active Rewards
              {activeRedemptions.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeRedemptions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              <Trophy className="h-4 w-4" />
              Pending Claims
              {pendingLeaderboardRewards.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {pendingLeaderboardRewards.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          {/* Active Rewards Tab */}
          <TabsContent value="active" className="mt-6">
            {loadingRedemptions ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : activeRedemptions.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No Active Rewards</h3>
                  <p className="text-muted-foreground mt-2 mb-4">
                    You don't have any active reward codes to use.
                  </p>
                  <Button asChild>
                    <a href="/rewards">Browse Rewards</a>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {activeRedemptions.map((redemption) => (
                  <Card key={redemption.id} className="overflow-hidden">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{redemption.partnerName}</h3>
                            <Badge
                              variant="outline"
                              className={`${redemptionStatusColors[redemption.status]} text-white`}
                            >
                              {redemptionStatusLabels[redemption.status]}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Tier: {redemption.tierSlug} &bull; {formatCreditsRequired(redemption.creditsSpent)} credits spent
                          </p>

                          {/* Code Display */}
                          {redemption.codeIssued && (
                            <div className="bg-muted rounded-lg p-4 flex items-center justify-between">
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Your Code</div>
                                <div className="text-xl font-mono font-bold tracking-wider">
                                  {redemption.codeIssued}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCopyCode(redemption.codeIssued!)}
                                >
                                  {codeCopied ? (
                                    <>
                                      <Check className="h-4 w-4 mr-1 text-green-500" />
                                      Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-4 w-4 mr-1" />
                                      Copy
                                    </>
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleResendCode(redemption.id)}
                                  disabled={resendMutation.isPending}
                                >
                                  <Mail className="h-4 w-4 mr-1" />
                                  {resendMutation.isPending ? 'Sending...' : 'Resend'}
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Expiration Notice */}
                          {redemption.expiresAt && (
                            <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>
                                Expires: {formatDate(redemption.expiresAt)}
                                {isExpired(redemption.expiresAt) && (
                                  <span className="text-destructive ml-2">(Expired)</span>
                                )}
                              </span>
                            </div>
                          )}

                          {/* Activation Instructions */}
                          <div className="mt-3 text-sm text-muted-foreground flex items-start gap-2">
                            <ExternalLink className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>{getActivationInstructions(redemption.partnerSlug)}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Pending Claims Tab */}
          <TabsContent value="pending" className="mt-6">
            {loadingLeaderboard ? (
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : pendingLeaderboardRewards.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No Pending Claims</h3>
                  <p className="text-muted-foreground mt-2">
                    Leaderboard rewards will appear here when you place in the top ranks.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingLeaderboardRewards.map((payout) => (
                  <Card key={payout.id} className="overflow-hidden border-yellow-500/50">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Trophy className="h-5 w-5 text-yellow-500" />
                            <h3 className="font-semibold">
                              {leaderboardTypeLabels[payout.leaderboardType]} Leaderboard Reward
                            </h3>
                            <Badge variant="outline" className="bg-yellow-500 text-white">
                              Rank #{payout.rank}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            {payout.rewardDescription}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>
                              Period: {formatDate(payout.periodStart)} - {formatDate(payout.periodEnd)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Coins className="h-4 w-4 text-primary" />
                              {formatCreditsRequired(payout.rewardValue)} credits
                            </span>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleClaimLeaderboardReward(payout)}
                          disabled={claimMutation.isPending}
                        >
                          {claimMutation.isPending ? 'Claiming...' : 'Claim Reward'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-6">
            {/* Filters */}
            <div className="flex gap-4 mb-6">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="issued">Issued</SelectItem>
                  <SelectItem value="activated">Activated</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>

              {uniquePartners.length > 0 && (
                <Select value={partnerFilter} onValueChange={setPartnerFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by partner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Partners</SelectItem>
                    {uniquePartners.map((partner) => (
                      <SelectItem key={partner} value={partner!}>
                        {partner}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {loadingRedemptions ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : historyRedemptions.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No Redemption History</h3>
                  <p className="text-muted-foreground mt-2">
                    Your past redemptions will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {historyRedemptions.map((redemption) => (
                  <Card
                    key={redemption.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedRedemption(redemption)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="font-medium">{redemption.partnerName}</div>
                            <div className="text-sm text-muted-foreground">
                              {redemption.tierSlug} &bull; {formatDate(redemption.createdAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-sm text-muted-foreground">
                            {formatCreditsRequired(redemption.creditsSpent)} credits
                          </div>
                          <Badge
                            variant="outline"
                            className={`${redemptionStatusColors[redemption.status]} text-white`}
                          >
                            {redemptionStatusLabels[redemption.status]}
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Redemption Detail Modal */}
        <Dialog open={!!selectedRedemption} onOpenChange={() => setSelectedRedemption(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Redemption Details</DialogTitle>
              <DialogDescription>
                View details about this reward redemption.
              </DialogDescription>
            </DialogHeader>

            {selectedRedemption && (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Partner</span>
                  <span className="font-medium">{selectedRedemption.partnerName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tier</span>
                  <span>{selectedRedemption.tierSlug}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Credits Spent</span>
                  <span className="flex items-center gap-1">
                    <Coins className="h-4 w-4 text-primary" />
                    {formatCreditsRequired(selectedRedemption.creditsSpent)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant="outline"
                    className={`${redemptionStatusColors[selectedRedemption.status]} text-white`}
                  >
                    {redemptionStatusLabels[selectedRedemption.status]}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Redeemed</span>
                  <span>{formatDate(selectedRedemption.createdAt)}</span>
                </div>
                {selectedRedemption.issuedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Issued</span>
                    <span>{formatDate(selectedRedemption.issuedAt)}</span>
                  </div>
                )}
                {selectedRedemption.expiresAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Expires</span>
                    <span className={isExpired(selectedRedemption.expiresAt) ? 'text-destructive' : ''}>
                      {formatDate(selectedRedemption.expiresAt)}
                      {isExpired(selectedRedemption.expiresAt) && ' (Expired)'}
                    </span>
                  </div>
                )}

                {/* Code display if available */}
                {selectedRedemption.codeIssued && (
                  <div className="bg-muted rounded-lg p-4 mt-4">
                    <div className="text-xs text-muted-foreground mb-1">Redemption Code</div>
                    <div className="text-xl font-mono font-bold tracking-wider mb-3">
                      {selectedRedemption.codeIssued}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyCode(selectedRedemption.codeIssued!)}
                      >
                        {codeCopied ? (
                          <>
                            <Check className="h-4 w-4 mr-1 text-green-500" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResendCode(selectedRedemption.id)}
                        disabled={resendMutation.isPending}
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        {resendMutation.isPending ? 'Sending...' : 'Resend Email'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedRedemption(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
