'use client';

import { X, Clock, FileText, Target, CheckCircle2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Challenge,
  ChallengeVersionFull,
  categoryLabels,
  categoryColors,
  difficultyLabels,
  difficultyColors,
  evidenceTypeLabels,
  calculateTotalPoints,
} from '@/types/challenge';

interface ChallengePreviewProps {
  challenge: Challenge;
  version?: ChallengeVersionFull;
  onClose: () => void;
}

export function ChallengePreview({ challenge, version, onClose }: ChallengePreviewProps) {
  const totalPoints = version ? calculateTotalPoints(version.rubricJson) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl border-l bg-background shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Preview Mode</p>
            <h2 className="text-lg font-semibold">{challenge.title}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Challenge Header */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className={categoryColors[challenge.category]}>
                {categoryLabels[challenge.category]}
              </Badge>
              <Badge variant="outline" className={difficultyColors[challenge.difficulty]}>
                {difficultyLabels[challenge.difficulty]}
              </Badge>
              {version && (
                <Badge variant="secondary">v{version.versionNumber}</Badge>
              )}
              {!challenge.isPublished && (
                <Badge variant="destructive">Draft</Badge>
              )}
            </div>

            <p className="text-muted-foreground">{challenge.description}</p>

            {version?.constraintsJson.maxDurationMinutes && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Time limit: {version.constraintsJson.maxDurationMinutes} minutes</span>
              </div>
            )}
          </div>

          <Separator />

          {/* No version warning */}
          {!version && (
            <Card className="border-amber-500 bg-amber-50">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">No version available</p>
                  <p className="text-sm text-amber-700">
                    Create a version with requirements and rubric to see full preview
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Requirements */}
          {version && version.requirementsJson.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Requirements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {version.requirementsJson
                  .sort((a, b) => a.order - b.order)
                  .map((req, index) => (
                    <div
                      key={req.id}
                      className="flex items-start gap-3 rounded-lg bg-muted/50 p-3"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{req.title}</h4>
                          <span className="text-sm text-muted-foreground">{req.weight}%</span>
                        </div>
                        {req.description && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {req.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {/* Rubric */}
          {version && version.rubricJson.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Scoring Rubric
                  </span>
                  <Badge variant="outline">{totalPoints} total points</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {version.requirementsJson
                  .sort((a, b) => a.order - b.order)
                  .map((req) => {
                    const criteria = version.rubricJson.filter(
                      (c) => c.requirementId === req.id
                    );
                    if (criteria.length === 0) return null;

                    return (
                      <div key={req.id} className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          {req.title}
                        </h4>
                        {criteria.map((criterion) => (
                          <div
                            key={criterion.id}
                            className="flex items-start justify-between rounded-lg border p-3"
                          >
                            <div className="space-y-1">
                              <p className="font-medium">{criterion.title}</p>
                              {criterion.description && (
                                <p className="text-sm text-muted-foreground">
                                  {criterion.description}
                                </p>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {evidenceTypeLabels[criterion.evidenceType]}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <span className="font-bold">{criterion.maxPoints}</span>
                              <span className="text-sm text-muted-foreground"> pts</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          )}

          {/* Constraints */}
          {version && Object.keys(version.constraintsJson).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Constraints
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  {version.constraintsJson.maxDurationMinutes && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time Limit</span>
                      <span>{version.constraintsJson.maxDurationMinutes} minutes</span>
                    </div>
                  )}
                  {version.constraintsJson.maxFiles && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max Files</span>
                      <span>{version.constraintsJson.maxFiles}</span>
                    </div>
                  )}
                  {version.constraintsJson.maxFileSize && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max File Size</span>
                      <span>
                        {(version.constraintsJson.maxFileSize / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                  )}
                  {version.constraintsJson.allowedLanguages && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Allowed Languages</span>
                      <span>{version.constraintsJson.allowedLanguages.join(', ')}</span>
                    </div>
                  )}
                  {version.constraintsJson.requiredFiles && (
                    <div>
                      <span className="text-muted-foreground">Required Files</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {version.constraintsJson.requiredFiles.map((file) => (
                          <Badge key={file} variant="outline" className="font-mono text-xs">
                            {file}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Template Reference */}
          {version?.templateRef && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Starter Template</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={version.templateRef}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline break-all"
                >
                  {version.templateRef}
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
