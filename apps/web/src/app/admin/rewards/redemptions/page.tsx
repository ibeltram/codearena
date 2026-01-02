'use client';

import { useState, useMemo } from 'react';
import {
  Loader2,
  Receipt,
  Filter,
  XCircle,
  Download,
  Search,
  RefreshCcw,
  Eye,
  RotateCcw,
  TrendingUp,
  Users,
  DollarSign,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  useAdminRedemptions,
  useAdminRewardsPartners,
  useRefundRedemption,
  AdminRedemption,
} from '@/hooks/use-admin-rewards';

type StatusFilter = 'all' | 'pending' | 'issued' | 'activated' | 'expired' | 'refunded';

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-500';
    case 'issued':
      return 'bg-blue-500';
    case 'activated':
      return 'bg-green-500';
    case 'expired':
      return 'bg-gray-500';
    case 'refunded':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminRewardsRedemptionsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [userSearch, setUserSearch] = useState('');
  const [selectedRedemption, setSelectedRedemption] = useState<AdminRedemption | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');

  const limit = 20;

  // Build filters
  const filters = useMemo(() => ({
    page,
    limit,
    status: statusFilter !== 'all' ? statusFilter as 'pending' | 'issued' | 'activated' | 'expired' | 'refunded' : undefined,
    partnerId: partnerFilter !== 'all' ? partnerFilter : undefined,
  }), [page, statusFilter, partnerFilter]);

  const { data, isLoading, isError, error, isFetching, refetch } = useAdminRedemptions(filters);
  const { data: partnersData } = useAdminRewardsPartners();
  const refundMutation = useRefundRedemption();

  // Filter by user search locally (API doesn't support text search)
  const filteredRedemptions = useMemo(() => {
    if (!data?.data || !userSearch.trim()) return data?.data || [];
    const search = userSearch.toLowerCase();
    return data.data.filter(
      (r) =>
        r.userEmail.toLowerCase().includes(search) ||
        r.userDisplayName.toLowerCase().includes(search)
    );
  }, [data?.data, userSearch]);

  // Calculate analytics
  const analytics = useMemo(() => {
    if (!data?.data) return null;
    const redemptions = data.data;
    const totalCredits = redemptions.reduce((sum, r) => sum + r.creditsSpent, 0);
    const uniqueUsers = new Set(redemptions.map((r) => r.userId)).size;
    const byStatus = redemptions.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { totalCredits, uniqueUsers, byStatus };
  }, [data?.data]);

  const handleViewDetails = (redemption: AdminRedemption) => {
    setSelectedRedemption(redemption);
    setDetailDialogOpen(true);
  };

  const handleOpenRefund = (redemption: AdminRedemption) => {
    setSelectedRedemption(redemption);
    setRefundReason('');
    setRefundDialogOpen(true);
  };

  const handleConfirmRefund = async () => {
    if (!selectedRedemption || !refundReason.trim()) return;

    try {
      await refundMutation.mutateAsync({
        id: selectedRedemption.id,
        data: { reason: refundReason },
      });
      setRefundDialogOpen(false);
      setSelectedRedemption(null);
      setRefundReason('');
    } catch (error) {
      console.error('Refund failed:', error);
    }
  };

  const handleExportCSV = () => {
    if (!data?.data) return;

    const headers = [
      'ID',
      'User Email',
      'User Name',
      'Partner',
      'Tier',
      'Credits Spent',
      'Code',
      'Status',
      'Issued At',
      'Activated At',
      'Expires At',
      'Created At',
    ];

    const rows = data.data.map((r) => [
      r.id,
      r.userEmail,
      r.userDisplayName,
      r.partnerName,
      r.tierSlug,
      r.creditsSpent,
      r.codeIssued || '',
      r.status,
      r.issuedAt || '',
      r.activatedAt || '',
      r.expiresAt || '',
      r.createdAt,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `redemptions-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setPartnerFilter('all');
    setUserSearch('');
    setPage(1);
  };

  const hasActiveFilters = statusFilter !== 'all' || partnerFilter !== 'all' || userSearch.trim() !== '';

  const canRefund = (status: string) => ['pending', 'issued', 'expired'].includes(status);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 text-white">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Redemptions</h1>
            <p className="text-muted-foreground">
              Monitor and manage reward redemptions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={handleExportCSV} disabled={!data?.data?.length}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Analytics cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Redemptions</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {data?.pagination.total.toLocaleString() || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Redeemed</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {analytics?.totalCredits.toLocaleString() || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">On this page</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {analytics?.uniqueUsers || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">On this page</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Breakdown</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <div className="flex flex-wrap gap-1">
                {analytics?.byStatus && Object.entries(analytics.byStatus).map(([status, count]) => (
                  <Badge key={status} className={getStatusColor(status)} variant="secondary">
                    {status}: {count}
                  </Badge>
                ))}
                {(!analytics?.byStatus || Object.keys(analytics.byStatus).length === 0) && (
                  <span className="text-sm text-muted-foreground">No data</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>

        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by user email or name..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="w-64"
          />
        </div>

        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as StatusFilter); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="activated">Activated</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>

        <Select value={partnerFilter} onValueChange={(value) => { setPartnerFilter(value); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Partner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            {partnersData?.data.map((partner) => (
              <SelectItem key={partner.id} value={partner.id}>
                {partner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XCircle className="mr-1 h-4 w-4" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Error loading redemptions: {error?.message || 'Unknown error'}
          </p>
        </div>
      )}

      {/* Redemptions table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : filteredRedemptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Receipt className="mx-auto h-12 w-12 mb-2" />
                    No redemptions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRedemptions.map((redemption) => (
                  <TableRow key={redemption.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{redemption.userDisplayName}</div>
                        <div className="text-sm text-muted-foreground">{redemption.userEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell>{redemption.partnerName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{redemption.tierSlug}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {redemption.creditsSpent.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(redemption.status)}>
                        {redemption.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(redemption.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(redemption)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canRefund(redemption.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenRefund(redemption)}
                            className="text-destructive hover:text-destructive"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, data.pagination.total)} of {data.pagination.total} redemptions
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {data.pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page === data.pagination.totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Redemption Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Redemption Details</DialogTitle>
            <DialogDescription>
              Full details for this redemption
            </DialogDescription>
          </DialogHeader>
          {selectedRedemption && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">User</Label>
                  <p className="font-medium">{selectedRedemption.userDisplayName}</p>
                  <p className="text-sm text-muted-foreground">{selectedRedemption.userEmail}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Partner</Label>
                  <p className="font-medium">{selectedRedemption.partnerName}</p>
                  <p className="text-sm text-muted-foreground">{selectedRedemption.tierSlug}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Credits Spent</Label>
                  <p className="text-xl font-bold">{selectedRedemption.creditsSpent.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge className={`${getStatusColor(selectedRedemption.status)} mt-1`}>
                    {selectedRedemption.status}
                  </Badge>
                </div>
              </div>

              {selectedRedemption.codeIssued && (
                <div>
                  <Label className="text-muted-foreground">Code Issued</Label>
                  <div className="mt-1 rounded-lg bg-muted p-3 font-mono text-sm">
                    {selectedRedemption.codeIssued}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Created At</Label>
                  <p>{formatDate(selectedRedemption.createdAt)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Issued At</Label>
                  <p>{formatDate(selectedRedemption.issuedAt)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Activated At</Label>
                  <p>{formatDate(selectedRedemption.activatedAt)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Expires At</Label>
                  <p>{formatDate(selectedRedemption.expiresAt)}</p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                ID: {selectedRedemption.id}
              </div>
            </div>
          )}
          <DialogFooter>
            {selectedRedemption && canRefund(selectedRedemption.status) && (
              <Button
                variant="destructive"
                onClick={() => {
                  setDetailDialogOpen(false);
                  handleOpenRefund(selectedRedemption);
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Process Refund
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Confirmation Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              This will restore {selectedRedemption?.creditsSpent.toLocaleString()} credits to the user's account
              and mark this redemption as refunded.
            </DialogDescription>
          </DialogHeader>
          {selectedRedemption && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User:</span>
                  <span className="font-medium">{selectedRedemption.userDisplayName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Partner:</span>
                  <span>{selectedRedemption.partnerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credits to Refund:</span>
                  <span className="font-bold text-green-500">
                    +{selectedRedemption.creditsSpent.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refund-reason">Refund Reason (required)</Label>
                <Textarea
                  id="refund-reason"
                  placeholder="Enter the reason for this refund (minimum 10 characters)..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  rows={3}
                />
                {refundReason.length > 0 && refundReason.length < 10 && (
                  <p className="text-xs text-destructive">
                    Reason must be at least 10 characters
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefundDialogOpen(false)}
              disabled={refundMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRefund}
              disabled={refundMutation.isPending || refundReason.length < 10}
            >
              {refundMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
