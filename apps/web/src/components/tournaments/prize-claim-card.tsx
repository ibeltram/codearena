'use client';

import { useState } from 'react';
import { Gift, Loader2, Check, X, DollarSign, Wallet, Package, Server } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useCreatePrizeClaim, useMyPrizeClaims } from '@/hooks/use-prize-claims';
import {
  PrizeType,
  PaymentDetails,
  prizeTypeLabels,
  prizeClaimStatusLabels,
  prizeClaimStatusColors,
  PrizeClaim,
} from '@/types/tournament';

interface PrizeInfo {
  placement: number;
  type: PrizeType;
  value: string;
}

interface PrizeClaimCardProps {
  tournamentId: string;
  tournamentName: string;
  isCompleted: boolean;
  userPlacement: number | null;
  prizeInfo: PrizeInfo | null;
}

const prizeTypeIcons: Record<PrizeType, typeof DollarSign> = {
  cash: DollarSign,
  crypto: Wallet,
  hardware: Package,
  saas_bundle: Server,
};

export function PrizeClaimCard({
  tournamentId,
  tournamentName,
  isCompleted,
  userPlacement,
  prizeInfo,
}: PrizeClaimCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<PrizeType>(prizeInfo?.type || 'cash');
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({});
  const [error, setError] = useState<string | null>(null);

  const createClaimMutation = useCreatePrizeClaim();

  // Check if user already has a claim for this tournament
  const { data: claimsData } = useMyPrizeClaims({ tournamentId });
  const existingClaim = claimsData?.data?.[0];

  // Don't show if not completed or user didn't place
  if (!isCompleted || !userPlacement || !prizeInfo) {
    return null;
  }

  const handleSubmit = async () => {
    setError(null);

    // Validate based on prize type
    if (selectedType === 'cash' && !paymentDetails.paypalEmail) {
      setError('PayPal email is required for cash prizes');
      return;
    }
    if (selectedType === 'crypto' && !paymentDetails.walletAddress) {
      setError('Wallet address is required for cryptocurrency prizes');
      return;
    }
    if (selectedType === 'hardware') {
      const addr = paymentDetails.shippingAddress;
      if (!addr?.name || !addr?.street || !addr?.city || !addr?.state || !addr?.postalCode || !addr?.country) {
        setError('Complete shipping address is required for hardware prizes');
        return;
      }
    }

    try {
      await createClaimMutation.mutateAsync({
        tournamentId,
        data: {
          prizeType: selectedType,
          paymentDetails,
        },
      });
      setIsDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit claim');
    }
  };

  const PrizeIcon = prizeTypeIcons[prizeInfo.type];

  // If user already has a claim, show the status
  if (existingClaim) {
    return (
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Prize Claim
          </CardTitle>
          <CardDescription>
            Your prize claim for {tournamentName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExistingClaimDisplay claim={existingClaim} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-amber-500" />
          Claim Your Prize!
        </CardTitle>
        <CardDescription>
          Congratulations on placing #{userPlacement} in {tournamentName}!
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-lg bg-background border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-500/10">
              <PrizeIcon className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="font-medium">{prizeTypeLabels[prizeInfo.type]} Prize</p>
              <p className="text-sm text-muted-foreground">{prizeInfo.value}</p>
            </div>
          </div>
          <Badge className="bg-amber-500">#{userPlacement}</Badge>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" size="lg">
              <Gift className="mr-2 h-4 w-4" />
              Claim Prize
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Claim Your Prize</DialogTitle>
              <DialogDescription>
                Please provide the details needed to fulfill your {prizeTypeLabels[prizeInfo.type].toLowerCase()} prize.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Prize Type Selection (if multiple options available) */}
              <div className="space-y-2">
                <Label>Prize Type</Label>
                <Select
                  value={selectedType}
                  onValueChange={(value) => setSelectedType(value as PrizeType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Cash (PayPal)
                      </div>
                    </SelectItem>
                    <SelectItem value="crypto">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        Cryptocurrency
                      </div>
                    </SelectItem>
                    <SelectItem value="hardware">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Hardware
                      </div>
                    </SelectItem>
                    <SelectItem value="saas_bundle">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        SaaS Bundle
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Conditional fields based on prize type */}
              {selectedType === 'cash' && (
                <div className="space-y-2">
                  <Label htmlFor="paypal">PayPal Email *</Label>
                  <Input
                    id="paypal"
                    type="email"
                    placeholder="your@email.com"
                    value={paymentDetails.paypalEmail || ''}
                    onChange={(e) =>
                      setPaymentDetails({ ...paymentDetails, paypalEmail: e.target.value })
                    }
                  />
                </div>
              )}

              {selectedType === 'crypto' && (
                <div className="space-y-2">
                  <Label htmlFor="wallet">Wallet Address *</Label>
                  <Input
                    id="wallet"
                    placeholder="0x..."
                    value={paymentDetails.walletAddress || ''}
                    onChange={(e) =>
                      setPaymentDetails({ ...paymentDetails, walletAddress: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your USDC (ETH/Polygon) wallet address
                  </p>
                </div>
              )}

              {selectedType === 'hardware' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      value={paymentDetails.shippingAddress?.name || ''}
                      onChange={(e) =>
                        setPaymentDetails({
                          ...paymentDetails,
                          shippingAddress: {
                            ...paymentDetails.shippingAddress!,
                            name: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="street">Street Address *</Label>
                    <Input
                      id="street"
                      placeholder="123 Main St"
                      value={paymentDetails.shippingAddress?.street || ''}
                      onChange={(e) =>
                        setPaymentDetails({
                          ...paymentDetails,
                          shippingAddress: {
                            ...paymentDetails.shippingAddress!,
                            street: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="city">City *</Label>
                      <Input
                        id="city"
                        placeholder="San Francisco"
                        value={paymentDetails.shippingAddress?.city || ''}
                        onChange={(e) =>
                          setPaymentDetails({
                            ...paymentDetails,
                            shippingAddress: {
                              ...paymentDetails.shippingAddress!,
                              city: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State *</Label>
                      <Input
                        id="state"
                        placeholder="CA"
                        value={paymentDetails.shippingAddress?.state || ''}
                        onChange={(e) =>
                          setPaymentDetails({
                            ...paymentDetails,
                            shippingAddress: {
                              ...paymentDetails.shippingAddress!,
                              state: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="postal">Postal Code *</Label>
                      <Input
                        id="postal"
                        placeholder="94102"
                        value={paymentDetails.shippingAddress?.postalCode || ''}
                        onChange={(e) =>
                          setPaymentDetails({
                            ...paymentDetails,
                            shippingAddress: {
                              ...paymentDetails.shippingAddress!,
                              postalCode: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">Country *</Label>
                      <Input
                        id="country"
                        placeholder="USA"
                        value={paymentDetails.shippingAddress?.country || ''}
                        onChange={(e) =>
                          setPaymentDetails({
                            ...paymentDetails,
                            shippingAddress: {
                              ...paymentDetails.shippingAddress!,
                              country: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedType === 'saas_bundle' && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={paymentDetails.paypalEmail || ''}
                    onChange={(e) =>
                      setPaymentDetails({ ...paymentDetails, paypalEmail: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll send the SaaS credits and instructions to this email
                  </p>
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createClaimMutation.isPending}
              >
                {createClaimMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Claim'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function ExistingClaimDisplay({ claim }: { claim: PrizeClaim }) {
  const statusColor = prizeClaimStatusColors[claim.status];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={statusColor}>{prizeClaimStatusLabels[claim.status]}</Badge>
          <span className="text-sm text-muted-foreground">
            #{claim.placement} Place
          </span>
        </div>
        <span className="text-sm font-medium">{claim.amountOrBundleRef}</span>
      </div>

      {claim.status === 'pending' && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            Your claim is being reviewed. You&apos;ll be notified once it&apos;s processed.
          </AlertDescription>
        </Alert>
      )}

      {claim.status === 'approved' && (
        <Alert className="border-green-500/50 bg-green-500/10">
          <Check className="h-4 w-4 text-green-500" />
          <AlertDescription>
            Your claim has been approved! Fulfillment is in progress.
          </AlertDescription>
        </Alert>
      )}

      {claim.status === 'fulfilled' && (
        <Alert className="border-blue-500/50 bg-blue-500/10">
          <Check className="h-4 w-4 text-blue-500" />
          <AlertDescription>
            Your prize has been fulfilled!
            {claim.fulfilledAt && (
              <span className="block text-xs mt-1">
                Completed on {new Date(claim.fulfilledAt).toLocaleDateString()}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {claim.status === 'denied' && (
        <Alert variant="destructive">
          <X className="h-4 w-4" />
          <AlertDescription>
            Your claim was denied.
            {claim.denialReason && (
              <span className="block mt-1">Reason: {claim.denialReason}</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        Submitted on {new Date(claim.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
}
