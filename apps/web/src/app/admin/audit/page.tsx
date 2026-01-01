'use client';

import { useState } from 'react';
import {
  Loader2,
  FileText,
  Filter,
  XCircle,
  Download,
  Calendar,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pagination } from '@/components/ui';
import { AuditTable } from '@/components/admin/audit-table';
import {
  useAdminAuditEvents,
  useAuditStats,
  useExportAuditEvents,
} from '@/hooks/use-admin-audit';
import {
  AuditCategory,
  AuditFilters,
  categoryLabels,
  categoryColors,
} from '@/types/audit';

const ITEMS_PER_PAGE = 50;

const categoryOptions: AuditCategory[] = [
  'auth',
  'admin',
  'moderation',
  'payment',
  'match',
  'submission',
  'challenge',
  'tournament',
  'reward',
  'system',
];

export default function AdminAuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');

  const { data, isLoading, isError, error, isFetching, refetch } =
    useAdminAuditEvents(filters);
  const { data: stats } = useAuditStats(7);
  const exportMutation = useExportAuditEvents();

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryFilter = (category: AuditCategory | 'all') => {
    setFilters((prev) => ({
      ...prev,
      category: category === 'all' ? undefined : category,
      page: 1,
    }));
  };

  const handleEntityTypeFilter = () => {
    if (entityTypeFilter.trim()) {
      setFilters((prev) => ({
        ...prev,
        entityType: entityTypeFilter.trim(),
        page: 1,
      }));
    }
  };

  const handleEventTypeFilter = () => {
    if (eventTypeFilter.trim()) {
      setFilters((prev) => ({
        ...prev,
        eventType: eventTypeFilter.trim(),
        page: 1,
      }));
    }
  };

  const clearAllFilters = () => {
    setFilters({ page: 1, limit: ITEMS_PER_PAGE });
    setEntityTypeFilter('');
    setEventTypeFilter('');
  };

  const handleExport = () => {
    exportMutation.mutate({
      ...filters,
      page: undefined,
      limit: 1000,
    });
  };

  const hasActiveFilters =
    filters.category ||
    filters.entityType ||
    filters.eventType ||
    filters.actorUserId ||
    filters.startDate ||
    filters.endDate;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-muted-foreground">
              Track and review platform activity
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportMutation.isPending}
          >
            <Download className="mr-1 h-4 w-4" />
            {exportMutation.isPending ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-sm text-muted-foreground">Last 7 days</p>
            <p className="text-2xl font-bold">{stats.totalEvents}</p>
            <p className="text-xs text-muted-foreground">total events</p>
          </div>
          {Object.entries(stats.byCategory || {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([category, count]) => (
              <div
                key={category}
                className="rounded-lg border bg-muted/30 px-4 py-3"
              >
                <Badge
                  className={`${categoryColors[category as AuditCategory]} text-xs`}
                >
                  {categoryLabels[category as AuditCategory]}
                </Badge>
                <p className="text-xl font-bold mt-1">{count}</p>
                <p className="text-xs text-muted-foreground">events</p>
              </div>
            ))}
        </div>
      )}

      {/* Filters */}
      <div className="space-y-4 rounded-lg border bg-muted/10 p-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="ml-auto"
            >
              <XCircle className="mr-1 h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Category filter */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Category
            </label>
            <Select
              value={filters.category || 'all'}
              onValueChange={(value) =>
                handleCategoryFilter(value as AuditCategory | 'all')
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryOptions.map((category) => (
                  <SelectItem key={category} value={category}>
                    {categoryLabels[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entity Type filter */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Entity Type
            </label>
            <div className="flex gap-1">
              <Input
                placeholder="e.g., match, user"
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEntityTypeFilter()}
                className="flex-1"
              />
              {filters.entityType && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEntityTypeFilter('');
                    setFilters((prev) => ({
                      ...prev,
                      entityType: undefined,
                      page: 1,
                    }));
                  }}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Event Type filter */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Event Type
            </label>
            <div className="flex gap-1">
              <Input
                placeholder="e.g., login, create"
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEventTypeFilter()}
                className="flex-1"
              />
              {filters.eventType && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEventTypeFilter('');
                    setFilters((prev) => ({
                      ...prev,
                      eventType: undefined,
                      page: 1,
                    }));
                  }}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Date range placeholder */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Date Range
            </label>
            <Button variant="outline" className="w-full justify-start" disabled>
              <Calendar className="mr-2 h-4 w-4" />
              Coming soon
            </Button>
          </div>
        </div>

        {/* Active filters display */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground">Active:</span>
            {filters.category && (
              <Badge
                variant="secondary"
                className="cursor-pointer"
                onClick={() => handleCategoryFilter('all')}
              >
                Category: {categoryLabels[filters.category]}
                <XCircle className="ml-1 h-3 w-3" />
              </Badge>
            )}
            {filters.entityType && (
              <Badge
                variant="secondary"
                className="cursor-pointer"
                onClick={() => {
                  setEntityTypeFilter('');
                  setFilters((prev) => ({
                    ...prev,
                    entityType: undefined,
                    page: 1,
                  }));
                }}
              >
                Entity: {filters.entityType}
                <XCircle className="ml-1 h-3 w-3" />
              </Badge>
            )}
            {filters.eventType && (
              <Badge
                variant="secondary"
                className="cursor-pointer"
                onClick={() => {
                  setEventTypeFilter('');
                  setFilters((prev) => ({
                    ...prev,
                    eventType: undefined,
                    page: 1,
                  }));
                }}
              >
                Event: {filters.eventType}
                <XCircle className="ml-1 h-3 w-3" />
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Error loading audit events: {error?.message || 'Unknown error'}
          </p>
        </div>
      )}

      {/* Audit table */}
      <AuditTable events={data?.data || []} isLoading={isLoading} />

      {/* Results count and pagination */}
      {data && !isLoading && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data.pagination.total === 0
                ? 'No audit events found'
                : `Showing ${
                    (data.pagination.page - 1) * data.pagination.limit + 1
                  }-${Math.min(
                    data.pagination.page * data.pagination.limit,
                    data.pagination.total
                  )} of ${data.pagination.total} events`}
            </p>
          </div>

          {data.pagination.totalPages > 1 && (
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}
    </div>
  );
}
