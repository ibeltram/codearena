'use client';

import Link from 'next/link';
import { Clock, Zap, FileCode } from 'lucide-react';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Challenge,
  categoryLabels,
  categoryColors,
  difficultyLabels,
  difficultyColors,
} from '@/types/challenge';

interface ChallengeCardProps {
  challenge: Challenge;
}

export function ChallengeCard({ challenge }: ChallengeCardProps) {
  const hasTemplate = !!challenge.latestVersion?.templateRef;

  // Format the relative time
  const createdDate = new Date(challenge.createdAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

  let timeAgo: string;
  if (diffDays === 0) {
    timeAgo = 'Today';
  } else if (diffDays === 1) {
    timeAgo = 'Yesterday';
  } else if (diffDays < 7) {
    timeAgo = `${diffDays} days ago`;
  } else if (diffDays < 30) {
    timeAgo = `${Math.floor(diffDays / 7)} weeks ago`;
  } else {
    timeAgo = `${Math.floor(diffDays / 30)} months ago`;
  }

  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg line-clamp-1">
              <Link
                href={`/challenges/${challenge.slug}`}
                className="hover:text-primary transition-colors"
              >
                {challenge.title}
              </Link>
            </CardTitle>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Badge
              className={`${categoryColors[challenge.category]} text-white text-xs`}
            >
              {categoryLabels[challenge.category]}
            </Badge>
          </div>
        </div>
        <CardDescription className="line-clamp-2 mt-1.5">
          {challenge.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-3 flex-1">
        <div className="flex flex-wrap gap-2">
          {/* Difficulty badge */}
          <Badge
            variant="outline"
            className={`border-2 ${difficultyColors[challenge.difficulty].replace('bg-', 'border-')} ${difficultyColors[challenge.difficulty].replace('bg-', 'text-').replace('-500', '-600')}`}
          >
            {difficultyLabels[challenge.difficulty]}
          </Badge>

          {/* Template badge */}
          {hasTemplate && (
            <Badge variant="secondary" className="gap-1">
              <FileCode className="h-3 w-3" />
              Template
            </Badge>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-3 border-t flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {/* Time indicator */}
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {timeAgo}
          </span>
        </div>

        <Button asChild size="sm">
          <Link href={`/challenges/${challenge.slug}`}>
            <Zap className="h-4 w-4 mr-1" />
            View
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
