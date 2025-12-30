'use client';

import { Coins, Lock, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreditBalance } from '@/hooks';
import { formatCredits } from '@/types/wallet';

interface BalanceCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  description: string;
  variant?: 'default' | 'primary' | 'warning';
}

function BalanceCard({
  title,
  value,
  icon,
  description,
  variant = 'default',
}: BalanceCardProps) {
  const bgClasses = {
    default: 'bg-card',
    primary: 'bg-primary/10 border-primary/20',
    warning: 'bg-orange-500/10 border-orange-500/20',
  };

  const iconBgClasses = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary text-primary-foreground',
    warning: 'bg-orange-500 text-white',
  };

  return (
    <Card className={bgClasses[variant]}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBgClasses[variant]}`}
        >
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatCredits(value)}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function BalanceCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-40 mt-2" />
      </CardContent>
    </Card>
  );
}

export function WalletBalance() {
  const { data, isLoading, isError } = useCreditBalance();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <BalanceCardSkeleton />
        <BalanceCardSkeleton />
        <BalanceCardSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive bg-destructive/10">
        <CardContent className="py-6">
          <p className="text-destructive text-center">
            Failed to load balance. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { available, reserved, total } = data.data;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <BalanceCard
        title="Total Balance"
        value={total}
        icon={<Wallet className="h-4 w-4" />}
        description="Combined available and reserved credits"
        variant="primary"
      />
      <BalanceCard
        title="Available"
        value={available}
        icon={<Coins className="h-4 w-4" />}
        description="Credits ready to use for matches or services"
      />
      <BalanceCard
        title="Reserved"
        value={reserved}
        icon={<Lock className="h-4 w-4" />}
        description="Credits held for active matches"
        variant={reserved > 0 ? 'warning' : 'default'}
      />
    </div>
  );
}
