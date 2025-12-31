'use client';

import { Wallet } from 'lucide-react';

import { MainLayout } from '@/components/layout';
import {
  WalletBalance,
  CreditPackages,
  TransactionHistory,
  ActiveHolds,
  RewardsCTA,
} from '@/components/wallet';

export default function WalletPage() {
  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Wallet</h1>
            <p className="text-muted-foreground">
              Manage your credits, purchase more, and view transaction history
            </p>
          </div>
        </div>

        {/* Balance cards */}
        <section>
          <WalletBalance />
        </section>

        {/* Rewards CTA */}
        <section>
          <RewardsCTA />
        </section>

        {/* Active holds */}
        <section>
          <ActiveHolds />
        </section>

        {/* Credit packages for purchase */}
        <section>
          <CreditPackages />
        </section>

        {/* Transaction history */}
        <section>
          <TransactionHistory />
        </section>
      </div>
    </MainLayout>
  );
}
