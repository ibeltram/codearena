'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Loader2, Search, FileCode } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui';
import { ChallengeTable } from '@/components/admin';
import {
  useAdminChallenges,
  usePublishChallenge,
  useUnpublishChallenge,
  useDeleteChallenge,
} from '@/hooks';
import { ChallengeFilters } from '@/types/challenge';

const ITEMS_PER_PAGE = 20;

export default function AdminChallengesPage() {
  const [filters, setFilters] = useState<ChallengeFilters>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, isError, error, isFetching } = useAdminChallenges(filters);
  const publishMutation = usePublishChallenge();
  const unpublishMutation = useUnpublishChallenge();
  const deleteMutation = useDeleteChallenge();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((prev) => ({ ...prev, search: searchInput, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePublish = async (id: string) => {
    try {
      await publishMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to publish:', err);
    }
  };

  const handleUnpublish = async (id: string) => {
    try {
      await unpublishMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to unpublish:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this challenge? This action cannot be undone.')) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileCode className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Challenges</h1>
            <p className="text-muted-foreground">
              Create and manage coding challenges
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          <Button asChild>
            <Link href="/admin/challenges/new">
              <Plus className="mr-2 h-4 w-4" />
              New Challenge
            </Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search challenges..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {filters.search && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearchInput('');
              setFilters((prev) => ({ ...prev, search: undefined, page: 1 }));
            }}
          >
            Clear
          </Button>
        )}
      </form>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Error loading challenges: {error?.message || 'Unknown error'}
          </p>
        </div>
      )}

      {/* Challenge table */}
      <ChallengeTable
        challenges={data?.data || []}
        isLoading={isLoading}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onDelete={handleDelete}
      />

      {/* Results count and pagination */}
      {data && !isLoading && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data.pagination.total === 0
                ? 'No challenges found'
                : `Showing ${
                    (data.pagination.page - 1) * data.pagination.limit + 1
                  }-${Math.min(
                    data.pagination.page * data.pagination.limit,
                    data.pagination.total
                  )} of ${data.pagination.total} challenges`}
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
