'use client';

import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  ChallengeCategory,
  ChallengeDifficulty,
  ChallengeSortOption,
  ChallengeFilters as FilterState,
  categoryLabels,
  difficultyLabels,
} from '@/types/challenge';

interface ChallengeFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export function ChallengeFilters({ filters, onFilterChange }: ChallengeFiltersProps) {
  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onFilterChange({
      ...filters,
      category: value ? (value as ChallengeCategory) : undefined,
      page: 1, // Reset to first page on filter change
    });
  };

  const handleDifficultyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onFilterChange({
      ...filters,
      difficulty: value ? (value as ChallengeDifficulty) : undefined,
      page: 1,
    });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({
      ...filters,
      sort: e.target.value as ChallengeSortOption,
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({
      ...filters,
      search: e.target.value || undefined,
      page: 1,
    });
  };

  const clearFilters = () => {
    onFilterChange({
      page: 1,
      limit: filters.limit,
      sort: 'newest',
    });
  };

  const hasActiveFilters =
    filters.category || filters.difficulty || filters.search;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search challenges..."
          value={filters.search || ''}
          onChange={handleSearchChange}
          className="pl-9"
        />
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3">
        {/* Category filter */}
        <div className="w-40">
          <Select
            value={filters.category || ''}
            onChange={handleCategoryChange}
          >
            <option value="">All Categories</option>
            {(Object.keys(categoryLabels) as ChallengeCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {categoryLabels[cat]}
              </option>
            ))}
          </Select>
        </div>

        {/* Difficulty filter */}
        <div className="w-40">
          <Select
            value={filters.difficulty || ''}
            onChange={handleDifficultyChange}
          >
            <option value="">All Difficulties</option>
            {(Object.keys(difficultyLabels) as ChallengeDifficulty[]).map(
              (diff) => (
                <option key={diff} value={diff}>
                  {difficultyLabels[diff]}
                </option>
              )
            )}
          </Select>
        </div>

        {/* Sort */}
        <div className="w-36">
          <Select value={filters.sort || 'newest'} onChange={handleSortChange}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="popular">Popular</option>
            <option value="title">Title A-Z</option>
          </Select>
        </div>

        {/* Clear filters button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
