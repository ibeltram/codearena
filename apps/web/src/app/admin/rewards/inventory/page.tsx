'use client';

import { useState } from 'react';
import {
  Loader2,
  Package,
  Upload,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Filter,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAdminInventory,
  useAdminRewardsPartners,
  InventoryPartnerStats,
} from '@/hooks/use-admin-rewards';
import { BulkUploadDialog } from '@/components/admin/bulk-upload-dialog';

// Low inventory threshold
const LOW_THRESHOLD = 10;
const CRITICAL_THRESHOLD = 5;

type StatusFilter = 'all' | 'healthy' | 'low' | 'critical';

function getInventoryStatus(available: number): {
  label: string;
  color: string;
  icon: typeof CheckCircle;
} {
  if (available >= LOW_THRESHOLD) {
    return { label: 'Healthy', color: 'text-green-500', icon: CheckCircle };
  }
  if (available >= CRITICAL_THRESHOLD) {
    return { label: 'Low', color: 'text-yellow-500', icon: AlertTriangle };
  }
  return { label: 'Critical', color: 'text-red-500', icon: XCircle };
}

export default function AdminRewardsInventoryPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const { data: inventoryData, isLoading, isError, error, isFetching } = useAdminInventory();
  const { data: partnersData } = useAdminRewardsPartners();

  // Filter inventory based on status
  const filterInventory = (partners: InventoryPartnerStats[]): InventoryPartnerStats[] => {
    if (statusFilter === 'all') return partners;

    return partners.filter((partner) => {
      return partner.tiers.some((tier) => {
        const status = getInventoryStatus(tier.available);
        if (statusFilter === 'healthy') return status.label === 'Healthy';
        if (statusFilter === 'low') return status.label === 'Low';
        if (statusFilter === 'critical') return status.label === 'Critical';
        return true;
      });
    });
  };

  const filteredInventory = inventoryData ? filterInventory(inventoryData.data) : [];

  // Count issues
  const lowStockCount = inventoryData?.data.reduce((count, partner) => {
    return count + partner.tiers.filter((t) => t.available < LOW_THRESHOLD && t.available >= CRITICAL_THRESHOLD).length;
  }, 0) || 0;

  const criticalStockCount = inventoryData?.data.reduce((count, partner) => {
    return count + partner.tiers.filter((t) => t.available < CRITICAL_THRESHOLD).length;
  }, 0) || 0;

  const handleUpload = (partnerId?: string) => {
    setSelectedPartnerId(partnerId || null);
    setUploadDialogOpen(true);
  };

  const clearFilters = () => {
    setStatusFilter('all');
  };

  const hasActiveFilters = statusFilter !== 'all';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500 text-white">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Reward Inventory</h1>
            <p className="text-muted-foreground">
              Manage reward codes and monitor stock levels
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          <Button onClick={() => handleUpload()}>
            <Upload className="mr-2 h-4 w-4" />
            Upload Codes
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Available</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {inventoryData?.totals.available.toLocaleString() || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reserved</CardTitle>
            <Package className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {inventoryData?.totals.reserved.toLocaleString() || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={lowStockCount > 0 ? 'border-yellow-500' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${lowStockCount > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className={`text-2xl font-bold ${lowStockCount > 0 ? 'text-yellow-500' : ''}`}>
                {lowStockCount} tier{lowStockCount !== 1 ? 's' : ''}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={criticalStockCount > 0 ? 'border-red-500' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <XCircle className={`h-4 w-4 ${criticalStockCount > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className={`text-2xl font-bold ${criticalStockCount > 0 ? 'text-red-500' : ''}`}>
                {criticalStockCount} tier{criticalStockCount !== 1 ? 's' : ''}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Status:</span>
          <div className="flex gap-2">
            {(['all', 'healthy', 'low', 'critical'] as StatusFilter[]).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className={
                  status === 'healthy'
                    ? statusFilter === status
                      ? 'bg-green-500 hover:bg-green-600'
                      : ''
                    : status === 'low'
                    ? statusFilter === status
                      ? 'bg-yellow-500 hover:bg-yellow-600'
                      : ''
                    : status === 'critical'
                    ? statusFilter === status
                      ? 'bg-red-500 hover:bg-red-600'
                      : ''
                    : ''
                }
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XCircle className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Error loading inventory: {error?.message || 'Unknown error'}
          </p>
        </div>
      )}

      {/* Inventory by partner */}
      <div className="space-y-4">
        {isLoading ? (
          // Loading skeleton
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <Skeleton key={j} className="h-24" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        ) : filteredInventory.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">
              {statusFilter !== 'all'
                ? 'No inventory matching the selected filter'
                : 'No inventory data. Upload codes to get started.'}
            </p>
          </div>
        ) : (
          filteredInventory.map((partner) => (
            <Card key={partner.partnerId}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">{partner.partnerName}</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpload(partner.partnerId)}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  Upload
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {partner.tiers.map((tier) => {
                    const status = getInventoryStatus(tier.available);
                    const StatusIcon = status.icon;

                    return (
                      <div
                        key={tier.tierSlug}
                        className="rounded-lg border p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{tier.tierSlug}</span>
                          <div className={`flex items-center gap-1 ${status.color}`}>
                            <StatusIcon className="h-4 w-4" />
                            <span className="text-xs">{status.label}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Available:</span>
                            <span className={`ml-1 font-medium ${status.color}`}>
                              {tier.available}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Reserved:</span>
                            <span className="ml-1 font-medium text-yellow-500">
                              {tier.reserved}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Redeemed:</span>
                            <span className="ml-1 font-medium text-blue-500">
                              {tier.redeemed}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Expired:</span>
                            <span className="ml-1 font-medium text-gray-500">
                              {tier.expired}
                            </span>
                          </div>
                        </div>
                        <div className="pt-1 text-xs text-muted-foreground">
                          Total: {tier.total} codes
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Bulk upload dialog */}
      <BulkUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        partnerId={selectedPartnerId}
        partners={partnersData?.data || []}
      />
    </div>
  );
}
