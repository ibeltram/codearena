'use client';

import { ExternalLink, Lock, Timer } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreditHolds } from '@/hooks';
import {
  CreditHold,
  formatCredits,
  holdStatusColors,
  holdStatusLabels,
} from '@/types/wallet';

interface HoldCardProps {
  hold: CreditHold;
}

function HoldCard({ hold }: HoldCardProps) {
  const createdDate = new Date(hold.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">
              {hold.match?.challenge?.title || 'Match Stake'}
            </p>
            <Badge
              className={`${holdStatusColors[hold.status]} text-white text-xs`}
            >
              {holdStatusLabels[hold.status]}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Timer className="h-3 w-3" />
            <span>Created {createdDate}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-semibold text-orange-500">
            -{formatCredits(hold.amountReserved)}
          </p>
          <p className="text-xs text-muted-foreground">credits reserved</p>
        </div>
        {hold.match && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/matches/${hold.match.id}`}>
              <ExternalLink className="h-4 w-4 mr-1" />
              View Match
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function HoldCardSkeleton() {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-32 mt-1" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-20 mt-1" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}

export function ActiveHolds() {
  const { data, isLoading, isError } = useCreditHolds();

  // Filter to only show active holds
  const activeHolds = data?.data.filter((hold) => hold.status === 'active') || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Active Holds
          {activeHolds.length > 0 && (
            <Badge variant="secondary">{activeHolds.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            <HoldCardSkeleton />
            <HoldCardSkeleton />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="text-center py-8">
            <p className="text-destructive">
              Failed to load holds. Please try again.
            </p>
          </div>
        )}

        {/* Holds list */}
        {data && !isLoading && (
          <>
            {activeHolds.length > 0 ? (
              <div className="space-y-3">
                {activeHolds.map((hold) => (
                  <HoldCard key={hold.id} hold={hold} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-muted/20 rounded-lg">
                <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No Active Holds</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Credits are held when you join a match with a stake
                </p>
              </div>
            )}
          </>
        )}

        {/* Info text */}
        <p className="text-xs text-muted-foreground mt-4">
          Holds are created when you join a match with a credit stake. They are
          automatically released when the match ends or if you forfeit.
        </p>
      </CardContent>
    </Card>
  );
}
