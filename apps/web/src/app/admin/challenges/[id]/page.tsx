'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  FileText,
  Settings,
  LayoutList,
  CheckCircle2,
  GitCompare,
  Copy,
  Star,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ChallengeForm, VersionEditor, VersionComparison, ChallengePreview } from '@/components/admin';
import {
  useAdminChallenge,
  useUpdateChallenge,
  useDeleteChallenge,
  usePublishChallenge,
  useUnpublishChallenge,
  useCreateChallengeVersion,
  usePublishChallengeVersion,
  useSetDefaultVersion,
} from '@/hooks';
import {
  categoryLabels,
  categoryColors,
  difficultyLabels,
  difficultyColors,
  CreateVersionInput,
  UpdateChallengeInput,
  ChallengeVersionFull,
} from '@/types/challenge';

export default function ChallengeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const challengeId = params.id as string;

  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState('version');

  const { data: challenge, isLoading, isError, error } = useAdminChallenge(challengeId);
  const updateMutation = useUpdateChallenge();
  const deleteMutation = useDeleteChallenge();
  const publishMutation = usePublishChallenge();
  const unpublishMutation = useUnpublishChallenge();
  const createVersionMutation = useCreateChallengeVersion();
  const publishVersionMutation = usePublishChallengeVersion();
  const setDefaultVersionMutation = useSetDefaultVersion();

  // Clone version state
  const [clonedVersionData, setClonedVersionData] = useState<ChallengeVersionFull | null>(null);

  const handleUpdateDetails = async (data: UpdateChallengeInput) => {
    try {
      await updateMutation.mutateAsync({ id: challengeId, data });
    } catch (err) {
      console.error('Failed to update:', err);
      alert('Failed to update challenge.');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this challenge? This cannot be undone.')) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(challengeId);
      router.push('/admin/challenges');
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete challenge.');
    }
  };

  const handlePublish = async () => {
    try {
      await publishMutation.mutateAsync(challengeId);
    } catch (err) {
      console.error('Failed to publish:', err);
      alert('Failed to publish challenge. Make sure it has at least one version.');
    }
  };

  const handleUnpublish = async () => {
    try {
      await unpublishMutation.mutateAsync(challengeId);
    } catch (err) {
      console.error('Failed to unpublish:', err);
    }
  };

  const handleSaveVersion = async (data: CreateVersionInput) => {
    try {
      await createVersionMutation.mutateAsync({ challengeId, data });
    } catch (err) {
      console.error('Failed to create version:', err);
      alert('Failed to save version.');
    }
  };

  const handlePublishVersion = async (versionId: string) => {
    try {
      await publishVersionMutation.mutateAsync({ challengeId, versionId });
    } catch (err) {
      console.error('Failed to publish version:', err);
    }
  };

  const handleCloneVersion = (version: ChallengeVersionFull) => {
    // Store the version data and switch to the editor tab
    setClonedVersionData(version);
    setActiveTab('version');
  };

  const handleSetDefaultVersion = async (versionId: string) => {
    try {
      await setDefaultVersionMutation.mutateAsync({ challengeId, versionId });
    } catch (err) {
      console.error('Failed to set default version:', err);
      alert('Failed to set default version. Make sure the version is published.');
    }
  };

  if (isLoading) {
    return <ChallengeDetailSkeleton />;
  }

  if (isError || !challenge) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/challenges">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <Card className="border-destructive">
          <CardContent className="py-6">
            <p className="text-destructive text-center">
              {error?.message || 'Challenge not found'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const latestVersion = challenge.versions?.[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
              <Link href="/admin/challenges">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">{challenge.title}</h1>
          </div>
          <div className="flex items-center gap-2 ml-10">
            <Badge className={categoryColors[challenge.category]}>
              {categoryLabels[challenge.category]}
            </Badge>
            <Badge variant="outline" className={difficultyColors[challenge.difficulty]}>
              {difficultyLabels[challenge.difficulty]}
            </Badge>
            {challenge.isPublished ? (
              <Badge className="bg-green-500">Published</Badge>
            ) : (
              <Badge variant="secondary">Draft</Badge>
            )}
            {latestVersion && (
              <Badge variant="outline">v{latestVersion.versionNumber}</Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowPreview(true)}>
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          {challenge.isPublished ? (
            <Button
              variant="outline"
              onClick={handleUnpublish}
              disabled={unpublishMutation.isPending}
            >
              {unpublishMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <EyeOff className="mr-2 h-4 w-4" />
              )}
              Unpublish
            </Button>
          ) : (
            <Button onClick={handlePublish} disabled={publishMutation.isPending}>
              {publishMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Publish
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="version" className="flex items-center gap-2">
            <LayoutList className="h-4 w-4" />
            Requirements & Rubric
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex items-center gap-2" disabled={(challenge.versions?.length || 0) < 2}>
            <GitCompare className="h-4 w-4" />
            Compare
          </TabsTrigger>
          <TabsTrigger value="details" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Version Editor Tab */}
        <TabsContent value="version" className="mt-6">
          {/* Cloned version notice */}
          {clonedVersionData && (
            <Card className="mb-6 border-blue-500/50 bg-blue-500/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-500">
                    <Copy className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Editing cloned data from v{clonedVersionData.versionNumber}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setClonedVersionData(null)}
                  >
                    Clear Clone
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <VersionEditor
            existingVersions={challenge.versions || []}
            onSave={handleSaveVersion}
            isSaving={createVersionMutation.isPending}
            initialData={clonedVersionData || undefined}
          />

          {/* Publish latest version button */}
          {latestVersion && !latestVersion.publishedAt && (
            <div className="mt-4 flex items-center justify-end gap-2 rounded-lg border bg-muted/50 p-4">
              <span className="text-sm text-muted-foreground">
                Version {latestVersion.versionNumber} is a draft
              </span>
              <Button
                onClick={() => handlePublishVersion(latestVersion.id)}
                disabled={publishVersionMutation.isPending}
              >
                {publishVersionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Publish Version
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Compare Tab */}
        <TabsContent value="compare" className="mt-6">
          {(challenge.versions?.length || 0) >= 2 ? (
            <VersionComparison
              versions={challenge.versions || []}
              onCloneVersion={handleCloneVersion}
              onSetDefault={handleSetDefaultVersion}
              defaultVersionId={challenge.defaultVersionId || undefined}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <GitCompare className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  Create at least 2 versions to enable comparison view.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="mt-6">
          <div className="max-w-2xl">
            <ChallengeForm
              initialData={{
                slug: challenge.slug,
                title: challenge.title,
                description: challenge.description,
                category: challenge.category,
                difficulty: challenge.difficulty,
              }}
              onSubmit={handleUpdateDetails}
              onCancel={() => setActiveTab('version')}
              isLoading={updateMutation.isPending}
              submitLabel="Save Changes"
            />
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-6">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Deleting this challenge will remove all versions, requirements, and rubrics.
                This action cannot be undone.
              </p>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete Challenge
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview Panel */}
      {showPreview && (
        <ChallengePreview
          challenge={challenge}
          version={latestVersion}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

function ChallengeDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      <Skeleton className="h-10 w-96" />

      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
