'use client';

import { useState } from 'react';
import { Check, CreditCard, Loader2, Sparkles, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePurchaseCredits } from '@/hooks';
import {
  CreditPackage,
  defaultCreditPackages,
  formatCredits,
  formatPrice,
} from '@/types/wallet';

interface PackageCardProps {
  pkg: CreditPackage;
  isSelected: boolean;
  isLoading: boolean;
  onSelect: () => void;
  onPurchase: () => void;
}

function PackageCard({
  pkg,
  isSelected,
  isLoading,
  onSelect,
  onPurchase,
}: PackageCardProps) {
  const totalCredits = pkg.credits + (pkg.bonusCredits || 0);
  const pricePerCredit = pkg.price / totalCredits;

  return (
    <Card
      className={`relative cursor-pointer transition-all hover:border-primary/50 ${
        isSelected ? 'border-primary ring-2 ring-primary/20' : ''
      } ${pkg.popular ? 'border-primary/30' : ''}`}
      onClick={onSelect}
    >
      {pkg.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-3">
            <Sparkles className="h-3 w-3 mr-1" />
            Most Popular
          </Badge>
        </div>
      )}

      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span>{pkg.name}</span>
          {isSelected && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-4 w-4" />
            </div>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Credits */}
        <div className="text-center">
          <div className="text-3xl font-bold">{formatCredits(pkg.credits)}</div>
          {pkg.bonusCredits && pkg.bonusCredits > 0 && (
            <Badge variant="secondary" className="mt-1">
              <Zap className="h-3 w-3 mr-1" />+{formatCredits(pkg.bonusCredits)}{' '}
              bonus
            </Badge>
          )}
          <p className="text-sm text-muted-foreground mt-1">credits</p>
        </div>

        {/* Price */}
        <div className="text-center border-t border-b py-3">
          <div className="text-2xl font-semibold">
            {formatPrice(pkg.price, pkg.currency)}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatPrice(Math.round(pricePerCredit * 100) / 100, pkg.currency)}{' '}
            per credit
          </p>
        </div>

        {/* Description */}
        {pkg.description && (
          <p className="text-sm text-muted-foreground text-center">
            {pkg.description}
          </p>
        )}

        {/* Purchase button - touch-friendly */}
        <Button
          className="w-full min-h-[44px]"
          variant={isSelected ? 'default' : 'outline'}
          onClick={(e) => {
            e.stopPropagation();
            onPurchase();
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Buy Now
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export function CreditPackages() {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(
    defaultCreditPackages.find((p) => p.popular)?.id || null
  );
  const purchaseMutation = usePurchaseCredits();

  const handlePurchase = async (packageId: string) => {
    try {
      const result = await purchaseMutation.mutateAsync(packageId);
      // Redirect to Stripe checkout
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (error) {
      console.error('Purchase failed:', error);
      // Error handling could show a toast notification
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Buy Credits
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {defaultCreditPackages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              isSelected={selectedPackage === pkg.id}
              isLoading={
                purchaseMutation.isPending &&
                purchaseMutation.variables === pkg.id
              }
              onSelect={() => setSelectedPackage(pkg.id)}
              onPurchase={() => handlePurchase(pkg.id)}
            />
          ))}
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>
            Secure payments powered by Stripe. Credits are non-refundable and
            non-transferable.
          </p>
          <p className="mt-1">
            By purchasing, you agree to our{' '}
            <a href="/terms" className="underline hover:text-primary">
              Terms of Service
            </a>
            .
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
