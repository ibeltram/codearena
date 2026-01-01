'use client';

import { useState } from 'react';
import { Loader2, Clock, FileJson, Link as LinkIcon, Box } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RequirementsBuilder } from './requirements-builder';
import { RubricEditor } from './rubric-editor';
import { TemplateManager } from './template-manager';
import {
  ChallengeRequirement,
  RubricCriterion,
  ChallengeConstraints,
  CreateVersionInput,
  ChallengeVersionFull,
  validateRequirementWeights,
} from '@/types/challenge';

interface VersionEditorProps {
  existingVersions: ChallengeVersionFull[];
  onSave: (data: CreateVersionInput) => Promise<void>;
  isSaving?: boolean;
}

export function VersionEditor({
  existingVersions,
  onSave,
  isSaving,
}: VersionEditorProps) {
  // Initialize from latest version if exists
  const latestVersion = existingVersions[0];

  const [requirements, setRequirements] = useState<ChallengeRequirement[]>(
    latestVersion?.requirementsJson || []
  );
  const [rubric, setRubric] = useState<RubricCriterion[]>(
    latestVersion?.rubricJson || []
  );
  const [constraints, setConstraints] = useState<ChallengeConstraints>(
    latestVersion?.constraintsJson || {}
  );
  const [templateRef, setTemplateRef] = useState(latestVersion?.templateRef || '');
  const [judgeImageRef, setJudgeImageRef] = useState(latestVersion?.judgeImageRef || '');

  const [showConstraints, setShowConstraints] = useState(false);

  const isValid =
    requirements.length > 0 &&
    validateRequirementWeights(requirements) &&
    rubric.length > 0;

  const handleSave = async () => {
    if (!isValid) return;

    const data: CreateVersionInput = {
      requirementsJson: requirements,
      rubricJson: rubric,
      constraintsJson: constraints,
      ...(templateRef && { templateRef }),
      ...(judgeImageRef && { judgeImageRef }),
    };

    await onSave(data);
  };

  return (
    <div className="space-y-6">
      {/* Version history */}
      {existingVersions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Version History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {existingVersions.map((version) => (
                <Badge
                  key={version.id}
                  variant={version.publishedAt ? 'default' : 'secondary'}
                  className="cursor-default"
                >
                  v{version.versionNumber}
                  {version.publishedAt && (
                    <span className="ml-1 text-xs opacity-75">
                      (published {new Date(version.publishedAt).toLocaleDateString()})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Editing will create v{existingVersions.length + 1}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Requirements */}
      <RequirementsBuilder requirements={requirements} onChange={setRequirements} />

      {/* Rubric */}
      <RubricEditor
        requirements={requirements}
        rubric={rubric}
        onChange={setRubric}
      />

      {/* Template Manager */}
      <TemplateManager
        templateRef={templateRef}
        onChange={setTemplateRef}
      />

      {/* Judge Image Reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            Judge Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="judgeImageRef">Judge Image Reference</Label>
            <Input
              id="judgeImageRef"
              placeholder="ghcr.io/org/judge-image:tag or Docker Hub image"
              value={judgeImageRef}
              onChange={(e) => setJudgeImageRef(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Docker image for automated judging (optional)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Constraints */}
      <Card>
        <CardHeader
          className="pb-3 cursor-pointer"
          onClick={() => setShowConstraints(!showConstraints)}
        >
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Box className="h-4 w-4" />
              Constraints
            </span>
            <Badge variant="outline">
              {showConstraints ? 'Hide' : 'Show'}
            </Badge>
          </CardTitle>
        </CardHeader>
        {showConstraints && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxDuration" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Max Duration (minutes)
                </Label>
                <Input
                  id="maxDuration"
                  type="number"
                  min="0"
                  placeholder="e.g., 60"
                  value={constraints.maxDurationMinutes || ''}
                  onChange={(e) =>
                    setConstraints((prev) => ({
                      ...prev,
                      maxDurationMinutes: parseInt(e.target.value) || undefined,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxFiles">Max Files</Label>
                <Input
                  id="maxFiles"
                  type="number"
                  min="0"
                  placeholder="e.g., 50"
                  value={constraints.maxFiles || ''}
                  onChange={(e) =>
                    setConstraints((prev) => ({
                      ...prev,
                      maxFiles: parseInt(e.target.value) || undefined,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxFileSize">Max File Size (bytes)</Label>
                <Input
                  id="maxFileSize"
                  type="number"
                  min="0"
                  placeholder="e.g., 1048576"
                  value={constraints.maxFileSize || ''}
                  onChange={(e) =>
                    setConstraints((prev) => ({
                      ...prev,
                      maxFileSize: parseInt(e.target.value) || undefined,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="allowedLanguages">Allowed Languages</Label>
                <Input
                  id="allowedLanguages"
                  placeholder="e.g., typescript, javascript, python"
                  value={constraints.allowedLanguages?.join(', ') || ''}
                  onChange={(e) =>
                    setConstraints((prev) => ({
                      ...prev,
                      allowedLanguages: e.target.value
                        ? e.target.value.split(',').map((s) => s.trim())
                        : undefined,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="requiredFiles">Required Files</Label>
              <Input
                id="requiredFiles"
                placeholder="e.g., package.json, README.md, src/index.ts"
                value={constraints.requiredFiles?.join(', ') || ''}
                onChange={(e) =>
                  setConstraints((prev) => ({
                    ...prev,
                    requiredFiles: e.target.value
                      ? e.target.value.split(',').map((s) => s.trim())
                      : undefined,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="forbiddenPatterns">Forbidden Patterns (regex)</Label>
              <Input
                id="forbiddenPatterns"
                placeholder="e.g., node_modules, \\.env$"
                value={constraints.forbiddenPatterns?.join(', ') || ''}
                onChange={(e) =>
                  setConstraints((prev) => ({
                    ...prev,
                    forbiddenPatterns: e.target.value
                      ? e.target.value.split(',').map((s) => s.trim())
                      : undefined,
                  }))
                }
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Save Button */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
        <div className="text-sm">
          {!isValid && (
            <span className="text-amber-600">
              {requirements.length === 0
                ? 'Add at least one requirement'
                : !validateRequirementWeights(requirements)
                ? 'Requirement weights must total 100%'
                : 'Add at least one rubric criterion'}
            </span>
          )}
          {isValid && (
            <span className="text-green-600">
              Ready to save version {existingVersions.length + 1}
            </span>
          )}
        </div>
        <Button onClick={handleSave} disabled={!isValid || isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save as Draft Version
        </Button>
      </div>
    </div>
  );
}
