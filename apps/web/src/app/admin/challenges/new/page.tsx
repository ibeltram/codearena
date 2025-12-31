'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ChallengeForm } from '@/components/admin';
import { useCreateChallenge } from '@/hooks';
import { CreateChallengeInput } from '@/types/challenge';

export default function NewChallengePage() {
  const router = useRouter();
  const createMutation = useCreateChallenge();

  const handleSubmit = async (data: CreateChallengeInput) => {
    try {
      const result = await createMutation.mutateAsync(data);
      // Redirect to the challenge editor page
      router.push(`/admin/challenges/${result.challenge.id}`);
    } catch (err) {
      console.error('Failed to create challenge:', err);
      alert('Failed to create challenge. Please try again.');
    }
  };

  const handleCancel = () => {
    router.push('/admin/challenges');
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/challenges">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plus className="h-6 w-6" />
            New Challenge
          </h1>
          <p className="text-muted-foreground">
            Create a new coding challenge
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <ChallengeForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={createMutation.isPending}
          submitLabel="Create Challenge"
        />
      </div>
    </div>
  );
}
