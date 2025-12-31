'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Gift,
  Check,
  X,
  User,
  Trophy,
  DollarSign,
  Wallet,
  Package,
  Server,
  Clock,
  FileText,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  usePrizeClaim,
  useApprovePrizeClaim,
  useFulfillPrizeClaim,
  useUpdatePrizeClaim,
} from '@/hooks/use-prize-claims';
import {
  prizeClaimStatusLabels,
  prizeClaimStatusColors,
  prizeTypeLabels,
  PrizeType,
  PaymentDetails,
} from '@/types/tournament';

const prizeTypeIcons: Record<PrizeType, typeof DollarSign> = {
  cash: DollarSign,
  crypto: Wallet,
  hardware: Package,
  saas_bundle: Server,
};

export default function AdminPrizeClaimDetailPage() {
  const params = useParams();
  const router = useRouter();
  const claimId = params.id as string;

  const [adminNotes, setAdminNotes] = useState('');
  const [denialReason, setDenialReason] = useState('');
  const [showDenyForm, setShowDenyForm] = useState(false);

  const { data: claim, isLoading, isError, error } = usePrizeClaim(claimId);
  const approveMutation = useApprovePrizeClaim();
  const fulfillMutation = useFulfillPrizeClaim();
  const updateMutation = useUpdatePrizeClaim();

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync({
        claimId,
        data: { adminNotes: adminNotes || undefined },
      });
    } catch (err) {
      console.error('Failed to approve claim:', err);
    }
  };

  const handleDeny = async () => {
    try {
      await updateMutation.mutateAsync({
        claimId,
        data: {
          status: 'denied',
          denialReason: denialReason || undefined,
          adminNotes: adminNotes || undefined,
        },
      });
      setShowDenyForm(false);
    } catch (err) {
      console.error('Failed to deny claim:', err);
    }
  };

  const handleFulfill = async () => {
    try {
      await fulfillMutation.mutateAsync({
        claimId,
        data: { adminNotes: adminNotes || undefined },
      });
    } catch (err) {
      console.error('Failed to fulfill claim:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !claim) {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/prize-claims"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Prize Claims
        </Link>

        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-12 text-center">
            <Gift className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Prize Claim Not Found</h3>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'The prize claim you\'re looking for doesn\'t exist.'}
            </p>
            <Button asChild>
              <Link href="/admin/prize-claims">Back to Prize Claims</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const PrizeIcon = prizeTypeIcons[claim.prizeType];
  const paymentDetails = claim.paymentDetails as PaymentDetails || {};

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/admin/prize-claims"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Prize Claims
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500 text-white">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Prize Claim Details</h1>
            <p className="text-sm text-muted-foreground font-mono">{claim.id}</p>
          </div>
        </div>
        <Badge className={prizeClaimStatusColors[claim.status]}>
          {prizeClaimStatusLabels[claim.status]}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Claimant Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Claimant Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{claim.user?.displayName || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">User ID</p>
              <p className="font-mono text-sm">{claim.userId}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tournament</p>
              <Link
                href={`/tournaments/${claim.tournamentId}`}
                className="font-medium hover:underline text-primary"
              >
                {claim.tournament?.name || 'Unknown Tournament'}
              </Link>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Placement</p>
              <Badge
                className={
                  claim.placement === 1
                    ? 'bg-amber-500'
                    : claim.placement === 2
                    ? 'bg-gray-400'
                    : claim.placement === 3
                    ? 'bg-orange-400'
                    : ''
                }
              >
                #{claim.placement}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Prize Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Prize Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-500/10">
                <PrizeIcon className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="font-medium">{prizeTypeLabels[claim.prizeType]}</p>
                <p className="text-lg font-bold">{claim.amountOrBundleRef}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {claim.prizeType === 'cash' && paymentDetails.paypalEmail && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">PayPal Email</p>
                <p className="font-mono text-lg">{paymentDetails.paypalEmail}</p>
              </div>
            )}

            {claim.prizeType === 'crypto' && paymentDetails.walletAddress && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Wallet Address</p>
                <p className="font-mono text-sm break-all">{paymentDetails.walletAddress}</p>
              </div>
            )}

            {claim.prizeType === 'hardware' && paymentDetails.shippingAddress && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Shipping Address</p>
                <div className="rounded-lg border p-4 bg-muted/30">
                  <p className="font-medium">{paymentDetails.shippingAddress.name}</p>
                  <p>{paymentDetails.shippingAddress.street}</p>
                  <p>
                    {paymentDetails.shippingAddress.city}, {paymentDetails.shippingAddress.state}{' '}
                    {paymentDetails.shippingAddress.postalCode}
                  </p>
                  <p>{paymentDetails.shippingAddress.country}</p>
                </div>
              </div>
            )}

            {claim.prizeType === 'saas_bundle' && paymentDetails.paypalEmail && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Email for SaaS Delivery</p>
                <p className="font-mono text-lg">{paymentDetails.paypalEmail}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <div>
                <p className="text-sm font-medium">Submitted</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(claim.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            {claim.reviewedAt && (
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <div>
                  <p className="text-sm font-medium">Reviewed</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(claim.reviewedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
            {claim.fulfilledAt && (
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-purple-500" />
                <div>
                  <p className="text-sm font-medium">Fulfilled</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(claim.fulfilledAt).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
            {claim.status === 'denied' && claim.denialReason && (
              <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm font-medium text-destructive">Denial Reason</p>
                <p className="text-sm mt-1">{claim.denialReason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admin Actions */}
        {claim.status !== 'fulfilled' && claim.status !== 'denied' && (
          <Card>
            <CardHeader>
              <CardTitle>Admin Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="adminNotes">Admin Notes (optional)</Label>
                <Textarea
                  id="adminNotes"
                  placeholder="Add any notes about this claim..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {showDenyForm && (
                <div className="space-y-2 p-4 rounded-lg border border-destructive/50 bg-destructive/5">
                  <Label htmlFor="denialReason">Denial Reason</Label>
                  <Textarea
                    id="denialReason"
                    placeholder="Explain why this claim is being denied..."
                    value={denialReason}
                    onChange={(e) => setDenialReason(e.target.value)}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={handleDeny}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <X className="mr-2 h-4 w-4" />
                      )}
                      Confirm Denial
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowDenyForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {!showDenyForm && (
                <div className="flex gap-2">
                  {claim.status === 'pending' && (
                    <>
                      <Button
                        className="bg-green-600 hover:bg-green-700"
                        onClick={handleApprove}
                        disabled={approveMutation.isPending}
                      >
                        {approveMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-4 w-4" />
                        )}
                        Approve Claim
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => setShowDenyForm(true)}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Deny Claim
                      </Button>
                    </>
                  )}

                  {claim.status === 'approved' && (
                    <Button
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={handleFulfill}
                      disabled={fulfillMutation.isPending}
                    >
                      {fulfillMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Gift className="mr-2 h-4 w-4" />
                      )}
                      Mark as Fulfilled
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
