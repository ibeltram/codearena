'use client';

import { useState } from 'react';
import {
  Loader2,
  Users,
  Filter,
  XCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui';
import { UserTable } from '@/components/admin';
import {
  useAdminUsers,
  useBanUser,
  useUnbanUser,
  type AdminUser,
  type AdminUsersFilters,
} from '@/hooks';
import { UserDetailDialog } from './user-detail-dialog';
import { BanUserDialog } from './ban-user-dialog';
import { EditRolesDialog } from './edit-roles-dialog';

const ITEMS_PER_PAGE = 20;

type RoleFilter = 'user' | 'admin' | 'moderator' | undefined;

const roleFilterOptions: { value: RoleFilter; label: string; icon: typeof UserIcon }[] = [
  { value: 'admin', label: 'Admin', icon: ShieldAlert },
  { value: 'moderator', label: 'Moderator', icon: ShieldCheck },
  { value: 'user', label: 'User', icon: UserIcon },
];

export default function AdminUsersPage() {
  const [filters, setFilters] = useState<AdminUsersFilters>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });
  const [searchInput, setSearchInput] = useState('');

  // Dialog state
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false);

  const { data, isLoading, isError, error, isFetching } = useAdminUsers(filters);
  const banUserMutation = useBanUser();
  const unbanUserMutation = useUnbanUser();

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRoleFilter = (role: RoleFilter) => {
    setFilters((prev) => ({ ...prev, role, page: 1 }));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((prev) => ({ ...prev, search: searchInput || undefined, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ page: 1, limit: ITEMS_PER_PAGE });
    setSearchInput('');
  };

  const handleViewUser = (user: AdminUser) => {
    setSelectedUser(user);
    setViewDialogOpen(true);
  };

  const handleBanUser = (user: AdminUser) => {
    setSelectedUser(user);
    setBanDialogOpen(true);
  };

  const handleUnbanUser = async (user: AdminUser) => {
    try {
      await unbanUserMutation.mutateAsync(user.id);
    } catch (err) {
      console.error('Failed to unban user:', err);
    }
  };

  const handleEditRoles = (user: AdminUser) => {
    setSelectedUser(user);
    setRolesDialogOpen(true);
  };

  const hasActiveFilters = filters.role || filters.search;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 text-white">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="text-muted-foreground">
              Manage users, roles, and moderation actions
            </p>
          </div>
        </div>
        {isFetching && !isLoading && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Summary badges */}
      {data && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
            <span className="text-sm text-muted-foreground">Total Users:</span>
            <Badge variant="secondary">{data.pagination.total}</Badge>
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {/* Role filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Role:</span>
          <div className="flex gap-2">
            {roleFilterOptions.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={filters.role === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleRoleFilter(value)}
              >
                <Icon className="mr-1 h-3 w-3" />
                {label}
              </Button>
            ))}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <XCircle className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Error loading users: {error?.message || 'Unknown error'}
          </p>
        </div>
      )}

      {/* User table */}
      <UserTable
        users={data?.data || []}
        isLoading={isLoading}
        onViewUser={handleViewUser}
        onBanUser={handleBanUser}
        onUnbanUser={handleUnbanUser}
        onEditRoles={handleEditRoles}
      />

      {/* Results count and pagination */}
      {data && !isLoading && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data.pagination.total === 0
                ? 'No users found'
                : `Showing ${
                    (data.pagination.page - 1) * data.pagination.limit + 1
                  }-${Math.min(
                    data.pagination.page * data.pagination.limit,
                    data.pagination.total
                  )} of ${data.pagination.total} users`}
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

      {/* Dialogs */}
      <UserDetailDialog
        user={selectedUser}
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
      />

      <BanUserDialog
        user={selectedUser}
        open={banDialogOpen}
        onOpenChange={setBanDialogOpen}
        onBan={async (reason) => {
          if (selectedUser) {
            await banUserMutation.mutateAsync({
              userId: selectedUser.id,
              data: { reason },
            });
            setBanDialogOpen(false);
          }
        }}
        isLoading={banUserMutation.isPending}
      />

      <EditRolesDialog
        user={selectedUser}
        open={rolesDialogOpen}
        onOpenChange={setRolesDialogOpen}
      />
    </div>
  );
}
