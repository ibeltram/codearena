'use client';

import {
  Edit,
  Power,
  PowerOff,
  MoreHorizontal,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AdminPartnerReward } from '@/hooks/use-admin-rewards';
import { rewardTypeLabels } from '@/types/rewards';

interface PartnerTableProps {
  partners: AdminPartnerReward[];
  isLoading: boolean;
  onEdit: (partner: AdminPartnerReward) => void;
  onToggleActive: (partner: AdminPartnerReward) => void;
  isToggling?: string; // ID of partner currently being toggled
}

export function PartnerTable({
  partners,
  isLoading,
  onEdit,
  onToggleActive,
  isToggling,
}: PartnerTableProps) {
  if (isLoading) {
    return <PartnerTableSkeleton />;
  }

  if (partners.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No partners found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Click &quot;Add Partner&quot; to create your first reward partner.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Partner</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Tiers</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Credits Range</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {partners.map((partner) => (
            <PartnerRow
              key={partner.id}
              partner={partner}
              onEdit={onEdit}
              onToggleActive={onToggleActive}
              isToggling={isToggling === partner.id}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PartnerRowProps {
  partner: AdminPartnerReward;
  onEdit: (partner: AdminPartnerReward) => void;
  onToggleActive: (partner: AdminPartnerReward) => void;
  isToggling: boolean;
}

function PartnerRow({ partner, onEdit, onToggleActive, isToggling }: PartnerRowProps) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Logo */}
          {partner.logoUrl ? (
            <img
              src={partner.logoUrl}
              alt={partner.name}
              className="h-10 w-10 rounded-lg object-contain bg-muted p-1"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
              {partner.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium">{partner.name}</p>
            <p className="text-sm text-muted-foreground">{partner.partnerSlug}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline">
          {rewardTypeLabels[partner.rewardType]}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {partner.tiers.map((tier) => (
            <Badge key={tier.slug} variant="secondary" className="text-xs">
              {tier.name}
            </Badge>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm">
          {partner.creditsRequiredMin.toLocaleString()} - {partner.creditsRequiredMax.toLocaleString()}
        </span>
      </td>
      <td className="px-4 py-3">
        {partner.isActive ? (
          <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
        ) : (
          <Badge variant="secondary" className="bg-gray-500 hover:bg-gray-600 text-white">
            Inactive
          </Badge>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={isToggling}>
              {isToggling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(partner)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Partner
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onToggleActive(partner)}
              className={partner.isActive ? 'text-destructive' : 'text-green-600'}
            >
              {partner.isActive ? (
                <>
                  <PowerOff className="mr-2 h-4 w-4" />
                  Deactivate
                </>
              ) : (
                <>
                  <Power className="mr-2 h-4 w-4" />
                  Activate
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function PartnerTableSkeleton() {
  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Partner</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Tiers</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Credits Range</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="mt-1 h-3 w-16" />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-20" />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-24" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-16" />
              </td>
              <td className="px-4 py-3 text-right">
                <Skeleton className="ml-auto h-8 w-8" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
