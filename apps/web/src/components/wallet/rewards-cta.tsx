'use client';

import Link from 'next/link';
import { Gift, ArrowRight, Zap, Server, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const rewardCategories = [
  {
    icon: Zap,
    label: 'SaaS Credits',
    description: 'Vercel, Supabase, Railway & more',
    color: 'text-yellow-500',
  },
  {
    icon: Server,
    label: 'Compute Credits',
    description: 'GPU, cloud, and infrastructure',
    color: 'text-blue-500',
  },
  {
    icon: Sparkles,
    label: 'Leaderboard Rewards',
    description: 'Automatic rewards for top performers',
    color: 'text-purple-500',
  },
];

export function RewardsCTA() {
  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
      <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,rgba(255,255,255,0.3))]" />

      <CardHeader className="relative pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Redeem Rewards</CardTitle>
              <CardDescription>
                Turn your credits into real value
              </CardDescription>
            </div>
          </div>
          <Link href="/rewards">
            <Button className="gap-2">
              Browse Rewards
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="relative pt-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {rewardCategories.map((category) => (
            <Link
              key={category.label}
              href="/rewards"
              className="group flex items-start gap-3 rounded-lg border bg-card/50 p-3 transition-colors hover:bg-accent hover:border-accent"
            >
              <div className={`mt-0.5 ${category.color}`}>
                <category.icon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium group-hover:text-accent-foreground">
                  {category.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {category.description}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" />
            New Partners
          </Badge>
          <span>Check out our latest partner offerings</span>
        </div>
      </CardContent>
    </Card>
  );
}
