'use client';

import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TournamentFilters as FilterState,
  TournamentStatus,
  TournamentFormat,
  statusLabels,
  formatLabels,
} from '@/types/tournament';

interface TournamentFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

const statusOptions: { value: TournamentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'registration_open', label: 'Open' },
  { value: 'in_progress', label: 'Live' },
  { value: 'completed', label: 'Completed' },
];

const formatOptions: { value: TournamentFormat | 'all'; label: string }[] = [
  { value: 'all', label: 'All Formats' },
  { value: 'single_elimination', label: 'Single Elim' },
  { value: 'double_elimination', label: 'Double Elim' },
  { value: 'swiss', label: 'Swiss' },
  { value: 'round_robin', label: 'Round Robin' },
];

export function TournamentFilters({
  filters,
  onFilterChange,
}: TournamentFiltersProps) {
  const handleStatusChange = (status: TournamentStatus | 'all') => {
    onFilterChange({
      ...filters,
      status: status === 'all' ? undefined : status,
      page: 1,
    });
  };

  const handleFormatChange = (format: TournamentFormat | 'all') => {
    onFilterChange({
      ...filters,
      format: format === 'all' ? undefined : format,
      page: 1,
    });
  };

  const handleUpcomingToggle = () => {
    onFilterChange({
      ...filters,
      upcoming: filters.upcoming ? undefined : true,
      page: 1,
    });
  };

  const clearFilters = () => {
    onFilterChange({
      page: 1,
      limit: filters.limit,
    });
  };

  const hasActiveFilters = filters.status || filters.format || filters.upcoming;

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {statusOptions.map((option) => (
          <Button
            key={option.value}
            variant={
              (option.value === 'all' && !filters.status) ||
              filters.status === option.value
                ? 'default'
                : 'outline'
            }
            size="sm"
            onClick={() => handleStatusChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Format filter */}
        <select
          value={filters.format || 'all'}
          onChange={(e) =>
            handleFormatChange(e.target.value as TournamentFormat | 'all')
          }
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {formatOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Upcoming toggle */}
        <Button
          variant={filters.upcoming ? 'default' : 'outline'}
          size="sm"
          onClick={handleUpcomingToggle}
        >
          Upcoming Only
        </Button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {filters.status && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() => handleStatusChange('all')}
            >
              {statusLabels[filters.status]}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {filters.format && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() => handleFormatChange('all')}
            >
              {formatLabels[filters.format]}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {filters.upcoming && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={handleUpcomingToggle}
            >
              Upcoming
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
