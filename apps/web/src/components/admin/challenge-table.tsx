'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Challenge,
  categoryLabels,
  categoryColors,
  difficultyLabels,
  difficultyColors,
} from '@/types/challenge';

interface ChallengeTableProps {
  challenges: Challenge[];
  isLoading?: boolean;
  onPublish?: (id: string) => void;
  onUnpublish?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ChallengeTable({
  challenges,
  isLoading,
  onPublish,
  onUnpublish,
  onDelete,
}: ChallengeTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  if (isLoading) {
    return <ChallengeTableSkeleton />;
  }

  if (challenges.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No challenges found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first challenge to get started
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Challenge</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Category</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Difficulty</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Version</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Updated</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {challenges.map((challenge) => (
            <tr key={challenge.id} className="border-b last:border-b-0 hover:bg-muted/25">
              <td className="px-4 py-3">
                <div>
                  <Link
                    href={`/admin/challenges/${challenge.id}`}
                    className="font-medium hover:underline"
                  >
                    {challenge.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                    {challenge.slug}
                  </p>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary" className={categoryColors[challenge.category]}>
                  {categoryLabels[challenge.category]}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className={difficultyColors[challenge.difficulty]}>
                  {difficultyLabels[challenge.difficulty]}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {challenge.isPublished ? (
                  <Badge className="bg-green-500">Published</Badge>
                ) : (
                  <Badge variant="secondary">Draft</Badge>
                )}
              </td>
              <td className="px-4 py-3">
                {challenge.latestVersion ? (
                  <span className="text-sm">
                    v{challenge.latestVersion.versionNumber}
                    {challenge.latestVersion.publishedAt && (
                      <span className="ml-1 text-xs text-muted-foreground">(live)</span>
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">No version</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  {new Date(challenge.updatedAt).toLocaleDateString()}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/challenges/${challenge.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setOpenMenuId(openMenuId === challenge.id ? null : challenge.id)
                      }
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                    {openMenuId === challenge.id && (
                      <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
                        <Link
                          href={`/challenges/${challenge.slug}`}
                          target="_blank"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                          onClick={() => setOpenMenuId(null)}
                        >
                          <ExternalLink className="h-4 w-4" />
                          View Public Page
                        </Link>
                        <button
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                          onClick={() => {
                            navigator.clipboard.writeText(challenge.slug);
                            setOpenMenuId(null);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                          Copy Slug
                        </button>
                        <div className="my-1 border-t" />
                        {challenge.isPublished ? (
                          <button
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                            onClick={() => {
                              onUnpublish?.(challenge.id);
                              setOpenMenuId(null);
                            }}
                          >
                            <EyeOff className="h-4 w-4" />
                            Unpublish
                          </button>
                        ) : (
                          <button
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                            onClick={() => {
                              onPublish?.(challenge.id);
                              setOpenMenuId(null);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                            Publish
                          </button>
                        )}
                        <button
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            onDelete?.(challenge.id);
                            setOpenMenuId(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChallengeTableSkeleton() {
  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Challenge</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Category</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Difficulty</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Version</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Updated</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-1 h-3 w-24" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-20" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-20" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-16" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-12" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-20" />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
