'use client';

import { useState } from 'react';
import {
  Loader2,
  Gift,
  Plus,
  Filter,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PartnerTable } from '@/components/admin/partner-table';
import { PartnerFormDialog } from '@/components/admin/partner-form-dialog';
import {
  useAdminRewardsPartners,
  useUpdatePartner,
  useDeactivatePartner,
  AdminPartnerReward,
} from '@/hooks/use-admin-rewards';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type StatusFilter = 'all' | 'active' | 'inactive';

export default function AdminRewardsPartnersPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<AdminPartnerReward | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    partner: AdminPartnerReward | null;
    action: 'activate' | 'deactivate';
  }>({ open: false, partner: null, action: 'deactivate' });

  const { data, isLoading, isError, error, isFetching } = useAdminRewardsPartners();
  const updatePartner = useUpdatePartner();
  const deactivatePartner = useDeactivatePartner();

  const isToggling = updatePartner.isPending || deactivatePartner.isPending;
  const togglingId = updatePartner.variables?.id;

  // Filter partners by status
  const filteredPartners = data?.data.filter((partner) => {
    if (statusFilter === 'active') return partner.isActive;
    if (statusFilter === 'inactive') return !partner.isActive;
    return true;
  }) || [];

  const activeCount = data?.data.filter((p) => p.isActive).length || 0;
  const inactiveCount = data?.data.filter((p) => !p.isActive).length || 0;

  const handleAddPartner = () => {
    setSelectedPartner(null);
    setFormOpen(true);
  };

  const handleEditPartner = (partner: AdminPartnerReward) => {
    setSelectedPartner(partner);
    setFormOpen(true);
  };

  const handleToggleActive = (partner: AdminPartnerReward) => {
    setConfirmDialog({
      open: true,
      partner,
      action: partner.isActive ? 'deactivate' : 'activate',
    });
  };

  const handleConfirmToggle = async () => {
    const { partner, action } = confirmDialog;
    if (!partner) return;

    try {
      if (action === 'deactivate') {
        await deactivatePartner.mutateAsync(partner.id);
      } else {
        await updatePartner.mutateAsync({
          id: partner.id,
          data: { isActive: true },
        });
      }
      setConfirmDialog({ open: false, partner: null, action: 'deactivate' });
    } catch (error) {
      console.error('Failed to toggle partner status:', error);
    }
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500 text-white">
            <Gift className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Rewards Partners</h1>
            <p className="text-muted-foreground">
              Manage reward partners and their tiers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          <Button onClick={handleAddPartner}>
            <Plus className="mr-2 h-4 w-4" />
            Add Partner
          </Button>
        </div>
      </div>

      {/* Summary badges */}
      {data && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Total Partners:</span>
            <Badge variant="secondary">{data.data.length}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Active:</span>
            <Badge className="bg-green-500">{activeCount}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Inactive:</span>
            <Badge variant="secondary">{inactiveCount}</Badge>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Status:</span>
          <div className="flex gap-2">
            {(['all', 'active', 'inactive'] as StatusFilter[]).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
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
            Error loading partners: {error?.message || 'Unknown error'}
          </p>
        </div>
      )}

      {/* Partner table */}
      <PartnerTable
        partners={filteredPartners}
        isLoading={isLoading}
        onEdit={handleEditPartner}
        onToggleActive={handleToggleActive}
        isToggling={isToggling ? togglingId : undefined}
      />

      {/* Results count */}
      {data && !isLoading && (
        <p className="text-sm text-muted-foreground">
          {filteredPartners.length === 0
            ? 'No partners found'
            : `Showing ${filteredPartners.length} partner${filteredPartners.length !== 1 ? 's' : ''}`}
        </p>
      )}

      {/* Partner form dialog */}
      <PartnerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        partner={selectedPartner}
      />

      {/* Confirm toggle dialog */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ ...confirmDialog, open: false })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.action === 'deactivate' ? 'Deactivate Partner' : 'Activate Partner'}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.action === 'deactivate' ? (
                <>
                  Are you sure you want to deactivate{' '}
                  <strong>{confirmDialog.partner?.name}</strong>? This partner will no
                  longer be visible in the marketplace.
                </>
              ) : (
                <>
                  Are you sure you want to activate{' '}
                  <strong>{confirmDialog.partner?.name}</strong>? This partner will
                  become visible in the marketplace.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}
              disabled={isToggling}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog.action === 'deactivate' ? 'destructive' : 'default'}
              onClick={handleConfirmToggle}
              disabled={isToggling}
            >
              {isToggling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmDialog.action === 'deactivate' ? 'Deactivate' : 'Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
