'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Trophy,
  Calendar,
  Users,
  Gift,
  ArrowLeft,
  Loader2,
  Clock,
  Medal,
  Award,
} from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useSeason,
  useSeasonStandings,
  useSeasonRewards,
  seasonStatusLabels,
  seasonStatusColors,
} from '@/hooks';

// Format date as "MMM d, yyyy" (e.g., "Jan 15, 2024")
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SeasonDetailPage() {
  const params = useParams();
  const seasonId = params.id as string;
  const [activeTab, setActiveTab] = useState('standings');

  const { data: season, isLoading: isLoadingSeason } = useSeason(seasonId);
  const { data: standings, isLoading: isLoadingStandings } = useSeasonStandings(seasonId);
  const { data: rewards, isLoading: isLoadingRewards } = useSeasonRewards(seasonId);

  if (isLoadingSeason) {
    return (
      <MainLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!season) {
    return (
      <MainLayout>
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
          <Trophy className="h-12 w-12 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">Season not found</p>
          <Button variant="outline" asChild>
            <a href="/leaderboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Leaderboard
            </a>
          </Button>
        </div>
      </MainLayout>
    );
  }

  const statusColor = seasonStatusColors[season.status || 'active'] || 'bg-gray-500';
  const statusLabel = seasonStatusLabels[season.status || 'active'] || 'Unknown';

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <a href="/leaderboard">
              <ArrowLeft className="h-5 w-5" />
            </a>
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{season.name}</h1>
              <Badge className={`${statusColor} text-white`}>{statusLabel}</Badge>
              {season.isCurrent && (
                <Badge variant="outline" className="border-green-500 text-green-500">
                  Current Season
                </Badge>
              )}
            </div>
            {season.description && (
              <p className="mt-1 text-muted-foreground">{season.description}</p>
            )}
          </div>
        </div>

        {/* Season Info Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Calendar className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="font-medium">
                  {formatDate(season.startDate)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                <Clock className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">End Date</p>
                <p className="font-medium">
                  {season.endDate
                    ? formatDate(season.endDate)
                    : 'Ongoing'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <Users className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Players</p>
                <p className="font-medium">
                  {standings?.pagination.total || 0} ranked
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
                <Gift className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Prize Pool</p>
                <p className="font-medium">
                  {season.rewards?.totalPrizePool
                    ? `${season.rewards.totalPrizePool} credits`
                    : 'TBD'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="standings">Standings</TabsTrigger>
            <TabsTrigger value="rewards">Rewards</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>

          {/* Standings Tab */}
          <TabsContent value="standings" className="mt-6">
            {isLoadingStandings ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : standings?.data.length === 0 ? (
              <Card>
                <CardContent className="flex min-h-[200px] flex-col items-center justify-center gap-2">
                  <Users className="h-10 w-10 text-muted-foreground" />
                  <p className="text-muted-foreground">No standings yet</p>
                  <p className="text-sm text-muted-foreground">
                    Players will appear here once they complete matches
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {standings?.data.map((player) => (
                      <div
                        key={player.userId}
                        className="flex items-center justify-between p-4"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-8 w-8 items-center justify-center">
                            {player.rank === 1 ? (
                              <Trophy className="h-6 w-6 text-yellow-500" />
                            ) : player.rank === 2 ? (
                              <Medal className="h-6 w-6 text-gray-400" />
                            ) : player.rank === 3 ? (
                              <Medal className="h-6 w-6 text-amber-600" />
                            ) : (
                              <span className="text-lg font-bold text-muted-foreground">
                                #{player.rank}
                              </span>
                            )}
                          </div>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={player.avatarUrl || undefined} />
                            <AvatarFallback>
                              {player.displayName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{player.displayName}</p>
                            <p className="text-sm text-muted-foreground">
                              {player.rating} rating
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Rewards Tab */}
          <TabsContent value="rewards" className="mt-6 space-y-6">
            {/* Reward Tiers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5" />
                  Reward Tiers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {season.rewards?.tiers && season.rewards.tiers.length > 0 ? (
                  <div className="space-y-3">
                    {season.rewards.tiers.map((tier, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-lg border p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            {tier.rankMin === 1 ? (
                              <Trophy className="h-5 w-5 text-yellow-500" />
                            ) : (
                              <Award className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">
                              {tier.rankMin === tier.rankMax
                                ? `Rank #${tier.rankMin}`
                                : `Ranks #${tier.rankMin} - #${tier.rankMax}`}
                            </p>
                            {tier.title && (
                              <p className="text-sm text-muted-foreground">
                                Title: {tier.title}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">
                            +{tier.credits} credits
                          </p>
                          {tier.badge && (
                            <p className="text-sm text-muted-foreground">
                              + {tier.badge} badge
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">
                    No reward tiers configured yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Payouts (for ended seasons) */}
            {season.status === 'ended' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Medal className="h-5 w-5" />
                    Reward Payouts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingRewards ? (
                    <div className="flex min-h-[100px] items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : rewards?.payouts.length === 0 ? (
                    <p className="text-center text-muted-foreground">
                      No rewards have been distributed yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {rewards?.payouts.map((payout) => (
                        <div
                          key={payout.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-muted-foreground">
                              #{payout.rank}
                            </span>
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={payout.avatarUrl || undefined} />
                              <AvatarFallback>
                                {payout.displayName.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{payout.displayName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-green-600">
                              +{payout.credits}
                            </span>
                            {payout.claimed ? (
                              <Badge variant="secondary">Claimed</Badge>
                            ) : (
                              <Badge>Pending</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Rules Tab */}
          <TabsContent value="rules" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Season Rules</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">
                      Minimum games for ranking
                    </span>
                    <span className="font-medium">
                      {season.rules?.minGamesForRanking || 5} games
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Placement games</span>
                    <span className="font-medium">
                      {season.rules?.placementGames || 3} games
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">
                      Inactivity penalty period
                    </span>
                    <span className="font-medium">
                      {season.rules?.inactivityPenaltyDays || 7} days
                    </span>
                  </div>
                  {season.rules?.ratingDecayFactor && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Rating decay factor
                      </span>
                      <span className="font-medium">
                        {(season.rules.ratingDecayFactor * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
