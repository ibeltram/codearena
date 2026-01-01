'use client';

import { useState, useCallback } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CreditCard,
  Download,
  Filter,
  History,
  Loader2,
  Lock,
  MinusCircle,
  RotateCcw,
  Trophy,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useCreditHistory, exportTransactionHistory } from '@/hooks';
import {
  CreditTransaction,
  CreditTransactionType,
  CreditHistoryFilters,
  formatCredits,
  getTransactionSign,
  transactionTypeLabels,
} from '@/types/wallet';

const ITEMS_PER_PAGE = 10;

const filterOptions: Record<string, string> = {
  all: 'All Transactions',
  purchase: 'Purchases',
  earn: 'Earnings',
  stake_hold: 'Stakes',
  stake_release: 'Releases',
  fee: 'Fees',
  refund: 'Refunds',
  redemption: 'Redemptions',
};

const transactionIcons: Record<CreditTransactionType, React.ReactNode> = {
  purchase: <CreditCard className="h-4 w-4" />,
  earn: <Trophy className="h-4 w-4" />,
  stake_hold: <Lock className="h-4 w-4" />,
  stake_release: <Unlock className="h-4 w-4" />,
  transfer: <ArrowUpRight className="h-4 w-4" />,
  fee: <MinusCircle className="h-4 w-4" />,
  refund: <RotateCcw className="h-4 w-4" />,
  redemption: <Zap className="h-4 w-4" />,
};

interface TransactionRowProps {
  transaction: CreditTransaction;
}

function TransactionRow({ transaction }: TransactionRowProps) {
  const sign = getTransactionSign(transaction.type);
  const isPositive = sign === '+';
  const isNegative = sign === '-';

  const formattedDate = new Date(transaction.createdAt).toLocaleDateString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  );

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            isPositive
              ? 'bg-green-500/10 text-green-500'
              : isNegative
              ? 'bg-red-500/10 text-red-500'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {transactionIcons[transaction.type]}
        </div>
        <div>
          <p className="font-medium">
            {transaction.description || transactionTypeLabels[transaction.type]}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{formattedDate}</span>
            {transaction.match && (
              <>
                <span>•</span>
                <a
                  href={`/matches/${transaction.match.id}`}
                  className="hover:underline"
                >
                  {transaction.match.challenge.title}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        <p
          className={`font-semibold ${
            isPositive
              ? 'text-green-500'
              : isNegative
              ? 'text-red-500'
              : 'text-foreground'
          }`}
        >
          {sign}
          {formatCredits(Math.abs(transaction.amount))}
        </p>
        <Badge variant="outline" className="text-xs">
          {transactionTypeLabels[transaction.type]}
        </Badge>
      </div>
    </div>
  );
}

function TransactionSkeleton() {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48 mt-1" />
        </div>
      </div>
      <div className="text-right">
        <Skeleton className="h-5 w-16 ml-auto" />
        <Skeleton className="h-5 w-20 mt-1 ml-auto" />
      </div>
    </div>
  );
}

export function TransactionHistory() {
  const [filters, setFilters] = useState<CreditHistoryFilters>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching } = useCreditHistory(filters);

  const handleTypeFilter = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      type: value === 'all' ? undefined : (value as CreditTransactionType),
      page: 1,
    }));
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilters((prev) => ({
      ...prev,
      startDate: value ? new Date(value).toISOString() : undefined,
      page: 1,
    }));
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilters((prev) => ({
      ...prev,
      endDate: value ? new Date(value + 'T23:59:59').toISOString() : undefined,
      page: 1,
    }));
  };

  const clearDateFilters = () => {
    setFilters((prev) => ({
      ...prev,
      startDate: undefined,
      endDate: undefined,
      page: 1,
    }));
  };

  const hasDateFilters = filters.startDate || filters.endDate;

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      await exportTransactionHistory({
        type: filters.type,
        startDate: filters.startDate,
        endDate: filters.endDate,
        format: 'csv',
      });
    } catch (error) {
      setExportError('Failed to export transactions. Please try again.');
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  }, [filters.type, filters.startDate, filters.endDate]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={showDateFilters ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowDateFilters(!showDateFilters)}
              className={hasDateFilters ? 'border-primary' : ''}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Date Range
              {hasDateFilters && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                  Active
                </Badge>
              )}
            </Button>
            <Select
              value={filters.type || 'all'}
              onValueChange={handleTypeFilter}
            >
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <span>{filterOptions[filters.type || 'all']}</span>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(filterOptions).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export CSV
            </Button>
          </div>
        </div>

        {/* Date Range Filters */}
        {showDateFilters && (
          <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startDate" className="text-sm text-muted-foreground">
                From
              </Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate ? filters.startDate.split('T')[0] : ''}
                onChange={handleStartDateChange}
                className="w-[160px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endDate" className="text-sm text-muted-foreground">
                To
              </Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate ? filters.endDate.split('T')[0] : ''}
                onChange={handleEndDateChange}
                className="w-[160px]"
              />
            </div>
            {hasDateFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDateFilters}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Clear dates
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* Export error */}
        {exportError && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{exportError}</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <TransactionSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="text-center py-8">
            <p className="text-destructive">
              Failed to load transactions. Please try again.
            </p>
          </div>
        )}

        {/* Transaction list */}
        {data && !isLoading && (
          <>
            {data.data.length > 0 ? (
              <>
                <div className="space-y-0">
                  {data.data.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {data.pagination.totalPages > 1 && (
                  <div className="mt-4">
                    <Pagination
                      currentPage={data.pagination.page}
                      totalPages={data.pagination.totalPages}
                      onPageChange={handlePageChange}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No transactions yet</h3>
                <p className="text-muted-foreground mt-1">
                  Your transaction history will appear here
                </p>
              </div>
            )}
          </>
        )}

        {/* Fetching indicator */}
        {isFetching && !isLoading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
