'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SimpleSelect as Select } from '@/components/ui/select';
import { LeaderboardFilters as FilterState, Season } from '@/types/leaderboard';
import { ChallengeCategory, categoryLabels } from '@/types/challenge';

interface LeaderboardFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  seasons: Season[] | undefined;
  isLoadingSeasons: boolean;
}

const categoryOptions: Array<{ value: ChallengeCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All Categories' },
  { value: 'frontend', label: categoryLabels.frontend },
  { value: 'backend', label: categoryLabels.backend },
  { value: 'fullstack', label: categoryLabels.fullstack },
  { value: 'algorithm', label: categoryLabels.algorithm },
  { value: 'devops', label: categoryLabels.devops },
];

export function LeaderboardFilters({
  filters,
  onFilterChange,
  seasons,
  isLoadingSeasons,
}: LeaderboardFiltersProps) {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, search: e.target.value, page: 1 });
  };

  const handleSeasonChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, seasonId: e.target.value || undefined, page: 1 });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as ChallengeCategory | 'all';
    onFilterChange({ ...filters, category: value, page: 1 });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Search input */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search players..."
          value={filters.search || ''}
          onChange={handleSearchChange}
          className="pl-10"
        />
      </div>

      {/* Season select */}
      <Select
        value={filters.seasonId || ''}
        onChange={handleSeasonChange}
        className="w-full sm:w-48"
        disabled={isLoadingSeasons}
      >
        <option value="">
          {isLoadingSeasons ? 'Loading...' : 'Current Season'}
        </option>
        {seasons?.map((season) => (
          <option key={season.id} value={season.id}>
            {season.name}
            {season.isCurrent ? ' (Current)' : ''}
          </option>
        ))}
      </Select>

      {/* Category select */}
      <Select
        value={filters.category || 'all'}
        onChange={handleCategoryChange}
        className="w-full sm:w-48"
      >
        {categoryOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
