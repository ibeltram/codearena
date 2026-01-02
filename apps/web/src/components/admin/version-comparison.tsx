'use client';

import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
  Edit,
  Copy,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Scale,
  FileText,
  List,
  Clock,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  ChallengeVersionFull,
  ChallengeRequirement,
  RubricCriterion,
  ChallengeConstraints,
  evidenceTypeLabels,
} from '@/types/challenge';

interface VersionComparisonProps {
  versions: ChallengeVersionFull[];
  onCloneVersion?: (version: ChallengeVersionFull) => void;
  onSetDefault?: (versionId: string) => void;
  defaultVersionId?: string;
}

type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

interface DiffResult<T> {
  type: DiffType;
  left?: T;
  right?: T;
  key: string;
}

export function VersionComparison({
  versions,
  onCloneVersion,
  onSetDefault,
  defaultVersionId,
}: VersionComparisonProps) {
  const [leftVersionId, setLeftVersionId] = useState<string>(
    versions.length > 1 ? versions[1].id : versions[0]?.id || ''
  );
  const [rightVersionId, setRightVersionId] = useState<string>(
    versions[0]?.id || ''
  );

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    requirements: true,
    rubric: true,
    constraints: true,
  });

  const leftVersion = versions.find((v) => v.id === leftVersionId);
  const rightVersion = versions.find((v) => v.id === rightVersionId);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const swapVersions = () => {
    const temp = leftVersionId;
    setLeftVersionId(rightVersionId);
    setRightVersionId(temp);
  };

  // Calculate diffs
  const requirementsDiff = useMemo(
    () => diffRequirements(leftVersion?.requirementsJson || [], rightVersion?.requirementsJson || []),
    [leftVersion, rightVersion]
  );

  const rubricDiff = useMemo(
    () => diffRubric(leftVersion?.rubricJson || [], rightVersion?.rubricJson || []),
    [leftVersion, rightVersion]
  );

  const constraintsDiff = useMemo(
    () => diffConstraints(leftVersion?.constraintsJson || {}, rightVersion?.constraintsJson || {}),
    [leftVersion, rightVersion]
  );

  // Summary statistics
  const stats = useMemo(() => {
    const reqStats = {
      added: requirementsDiff.filter((d) => d.type === 'added').length,
      removed: requirementsDiff.filter((d) => d.type === 'removed').length,
      modified: requirementsDiff.filter((d) => d.type === 'modified').length,
    };
    const rubricStats = {
      added: rubricDiff.filter((d) => d.type === 'added').length,
      removed: rubricDiff.filter((d) => d.type === 'removed').length,
      modified: rubricDiff.filter((d) => d.type === 'modified').length,
    };
    const constraintStats = {
      added: constraintsDiff.filter((d) => d.type === 'added').length,
      removed: constraintsDiff.filter((d) => d.type === 'removed').length,
      modified: constraintsDiff.filter((d) => d.type === 'modified').length,
    };
    return { reqStats, rubricStats, constraintStats };
  }, [requirementsDiff, rubricDiff, constraintsDiff]);

  if (versions.length < 2) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            At least 2 versions are required for comparison.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Version Selector Header */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Version Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {/* Left Version Selector */}
            <div className="flex-1">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Base Version (Left)
              </label>
              <Select value={leftVersionId} onValueChange={setLeftVersionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id} disabled={v.id === rightVersionId}>
                      v{v.versionNumber}
                      {v.publishedAt && ' (published)'}
                      {v.id === defaultVersionId && ' - Default'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Swap Button */}
            <Button
              variant="outline"
              size="icon"
              className="mt-6"
              onClick={swapVersions}
              title="Swap versions"
            >
              <ArrowLeft className="h-4 w-4" />
              <ArrowRight className="h-4 w-4" />
            </Button>

            {/* Right Version Selector */}
            <div className="flex-1">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Compare Version (Right)
              </label>
              <Select value={rightVersionId} onValueChange={setRightVersionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id} disabled={v.id === leftVersionId}>
                      v{v.versionNumber}
                      {v.publishedAt && ' (published)'}
                      {v.id === defaultVersionId && ' - Default'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="mt-4 flex flex-wrap gap-4">
            <DiffSummary
              label="Requirements"
              stats={stats.reqStats}
              icon={<List className="h-4 w-4" />}
            />
            <DiffSummary
              label="Rubric"
              stats={stats.rubricStats}
              icon={<FileText className="h-4 w-4" />}
            />
            <DiffSummary
              label="Constraints"
              stats={stats.constraintStats}
              icon={<Clock className="h-4 w-4" />}
            />
          </div>

          {/* Actions */}
          {rightVersion && (
            <div className="mt-4 flex gap-2">
              {onCloneVersion && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCloneVersion(rightVersion)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Clone v{rightVersion.versionNumber}
                </Button>
              )}
              {onSetDefault && rightVersion.publishedAt && rightVersion.id !== defaultVersionId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetDefault(rightVersion.id)}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Set v{rightVersion.versionNumber} as Default
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Requirements Diff */}
      <Collapsible
        open={expandedSections.requirements}
        onOpenChange={() => toggleSection('requirements')}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <List className="h-5 w-5" />
                  Requirements
                  <DiffBadges stats={stats.reqStats} />
                </span>
                {expandedSections.requirements ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {requirementsDiff.map((diff) => (
                  <RequirementDiffRow key={diff.key} diff={diff} />
                ))}
                {requirementsDiff.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No requirements in either version
                  </p>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Rubric Diff */}
      <Collapsible
        open={expandedSections.rubric}
        onOpenChange={() => toggleSection('rubric')}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Rubric Criteria
                  <DiffBadges stats={stats.rubricStats} />
                </span>
                {expandedSections.rubric ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {rubricDiff.map((diff) => (
                  <RubricDiffRow key={diff.key} diff={diff} />
                ))}
                {rubricDiff.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No rubric criteria in either version
                  </p>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Constraints Diff */}
      <Collapsible
        open={expandedSections.constraints}
        onOpenChange={() => toggleSection('constraints')}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Constraints
                  <DiffBadges stats={stats.constraintStats} />
                </span>
                {expandedSections.constraints ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {constraintsDiff.map((diff) => (
                  <ConstraintDiffRow key={diff.key} diff={diff} />
                ))}
                {constraintsDiff.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No constraints in either version
                  </p>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

// Helper Components

function DiffSummary({
  label,
  stats,
  icon,
}: {
  label: string;
  stats: { added: number; removed: number; modified: number };
  icon: React.ReactNode;
}) {
  const hasChanges = stats.added > 0 || stats.removed > 0 || stats.modified > 0;

  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      <span className="font-medium">{label}:</span>
      {hasChanges ? (
        <span className="flex items-center gap-1">
          {stats.added > 0 && (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
              +{stats.added}
            </Badge>
          )}
          {stats.removed > 0 && (
            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
              -{stats.removed}
            </Badge>
          )}
          {stats.modified > 0 && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
              ~{stats.modified}
            </Badge>
          )}
        </span>
      ) : (
        <span className="text-muted-foreground">No changes</span>
      )}
    </div>
  );
}

function DiffBadges({
  stats,
}: {
  stats: { added: number; removed: number; modified: number };
}) {
  const hasChanges = stats.added > 0 || stats.removed > 0 || stats.modified > 0;
  if (!hasChanges) return null;

  return (
    <span className="flex items-center gap-1 ml-2">
      {stats.added > 0 && (
        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">
          +{stats.added}
        </Badge>
      )}
      {stats.removed > 0 && (
        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 text-xs">
          -{stats.removed}
        </Badge>
      )}
      {stats.modified > 0 && (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs">
          ~{stats.modified}
        </Badge>
      )}
    </span>
  );
}

function RequirementDiffRow({ diff }: { diff: DiffResult<ChallengeRequirement> }) {
  const req = diff.right || diff.left;
  if (!req) return null;

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-4 p-3 rounded-lg border',
        diff.type === 'added' && 'bg-green-500/5 border-green-500/20',
        diff.type === 'removed' && 'bg-red-500/5 border-red-500/20',
        diff.type === 'modified' && 'bg-amber-500/5 border-amber-500/20',
        diff.type === 'unchanged' && 'bg-muted/30'
      )}
    >
      {/* Left (old) */}
      <div className={cn(!diff.left && 'opacity-30')}>
        {diff.left ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <DiffIcon type={diff.type === 'removed' ? 'removed' : diff.type === 'modified' ? 'modified' : 'unchanged'} />
              <span className="font-medium">{diff.left.title}</span>
              <Badge variant="outline" className="text-xs">
                {diff.left.weight}%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground pl-6">{diff.left.description}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-sm italic">Not present</span>
          </div>
        )}
      </div>

      {/* Right (new) */}
      <div className={cn(!diff.right && 'opacity-30')}>
        {diff.right ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <DiffIcon type={diff.type === 'added' ? 'added' : diff.type === 'modified' ? 'modified' : 'unchanged'} />
              <span className="font-medium">{diff.right.title}</span>
              <Badge variant="outline" className="text-xs">
                {diff.right.weight}%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground pl-6">{diff.right.description}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-sm italic">Removed</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RubricDiffRow({ diff }: { diff: DiffResult<RubricCriterion> }) {
  const criterion = diff.right || diff.left;
  if (!criterion) return null;

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-4 p-3 rounded-lg border',
        diff.type === 'added' && 'bg-green-500/5 border-green-500/20',
        diff.type === 'removed' && 'bg-red-500/5 border-red-500/20',
        diff.type === 'modified' && 'bg-amber-500/5 border-amber-500/20',
        diff.type === 'unchanged' && 'bg-muted/30'
      )}
    >
      {/* Left (old) */}
      <div className={cn(!diff.left && 'opacity-30')}>
        {diff.left ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <DiffIcon type={diff.type === 'removed' ? 'removed' : diff.type === 'modified' ? 'modified' : 'unchanged'} />
              <span className="font-medium">{diff.left.title}</span>
              <Badge variant="outline" className="text-xs">
                {diff.left.maxPoints} pts
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground pl-6">{diff.left.description}</p>
            <div className="pl-6">
              <Badge variant="secondary" className="text-xs">
                {evidenceTypeLabels[diff.left.evidenceType]}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-sm italic">Not present</span>
          </div>
        )}
      </div>

      {/* Right (new) */}
      <div className={cn(!diff.right && 'opacity-30')}>
        {diff.right ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <DiffIcon type={diff.type === 'added' ? 'added' : diff.type === 'modified' ? 'modified' : 'unchanged'} />
              <span className="font-medium">{diff.right.title}</span>
              <Badge variant="outline" className="text-xs">
                {diff.right.maxPoints} pts
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground pl-6">{diff.right.description}</p>
            <div className="pl-6">
              <Badge variant="secondary" className="text-xs">
                {evidenceTypeLabels[diff.right.evidenceType]}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-sm italic">Removed</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ConstraintDiffRow({ diff }: { diff: DiffResult<string> }) {
  return (
    <div
      className={cn(
        'grid grid-cols-3 gap-4 p-3 rounded-lg border items-center',
        diff.type === 'added' && 'bg-green-500/5 border-green-500/20',
        diff.type === 'removed' && 'bg-red-500/5 border-red-500/20',
        diff.type === 'modified' && 'bg-amber-500/5 border-amber-500/20',
        diff.type === 'unchanged' && 'bg-muted/30'
      )}
    >
      <div className="flex items-center gap-2">
        <DiffIcon type={diff.type} />
        <span className="font-medium capitalize">{formatConstraintKey(diff.key)}</span>
      </div>
      <div className={cn('text-sm', !diff.left && 'text-muted-foreground')}>
        {diff.left || '—'}
      </div>
      <div className={cn('text-sm', !diff.right && 'text-muted-foreground')}>
        {diff.right || '—'}
      </div>
    </div>
  );
}

function DiffIcon({ type }: { type: DiffType }) {
  switch (type) {
    case 'added':
      return <Plus className="h-4 w-4 text-green-500" />;
    case 'removed':
      return <Minus className="h-4 w-4 text-red-500" />;
    case 'modified':
      return <Edit className="h-4 w-4 text-amber-500" />;
    default:
      return <Check className="h-4 w-4 text-muted-foreground" />;
  }
}

// Diff calculation functions

function diffRequirements(
  left: ChallengeRequirement[],
  right: ChallengeRequirement[]
): DiffResult<ChallengeRequirement>[] {
  const results: DiffResult<ChallengeRequirement>[] = [];
  const rightMap = new Map(right.map((r) => [r.id, r]));
  const leftMap = new Map(left.map((r) => [r.id, r]));

  // Check left items
  for (const leftItem of left) {
    const rightItem = rightMap.get(leftItem.id);
    if (!rightItem) {
      results.push({ type: 'removed', left: leftItem, key: leftItem.id });
    } else if (
      leftItem.title !== rightItem.title ||
      leftItem.description !== rightItem.description ||
      leftItem.weight !== rightItem.weight ||
      leftItem.evidenceType !== rightItem.evidenceType
    ) {
      results.push({ type: 'modified', left: leftItem, right: rightItem, key: leftItem.id });
    } else {
      results.push({ type: 'unchanged', left: leftItem, right: rightItem, key: leftItem.id });
    }
  }

  // Check for new items in right
  for (const rightItem of right) {
    if (!leftMap.has(rightItem.id)) {
      results.push({ type: 'added', right: rightItem, key: rightItem.id });
    }
  }

  return results.sort((a, b) => {
    // Show removed first, then modified, then unchanged, then added
    const order: Record<DiffType, number> = { removed: 0, modified: 1, unchanged: 2, added: 3 };
    return order[a.type] - order[b.type];
  });
}

function diffRubric(
  left: RubricCriterion[],
  right: RubricCriterion[]
): DiffResult<RubricCriterion>[] {
  const results: DiffResult<RubricCriterion>[] = [];
  const rightMap = new Map(right.map((r) => [r.id, r]));
  const leftMap = new Map(left.map((r) => [r.id, r]));

  // Check left items
  for (const leftItem of left) {
    const rightItem = rightMap.get(leftItem.id);
    if (!rightItem) {
      results.push({ type: 'removed', left: leftItem, key: leftItem.id });
    } else if (
      leftItem.title !== rightItem.title ||
      leftItem.description !== rightItem.description ||
      leftItem.maxPoints !== rightItem.maxPoints ||
      leftItem.evidenceType !== rightItem.evidenceType
    ) {
      results.push({ type: 'modified', left: leftItem, right: rightItem, key: leftItem.id });
    } else {
      results.push({ type: 'unchanged', left: leftItem, right: rightItem, key: leftItem.id });
    }
  }

  // Check for new items in right
  for (const rightItem of right) {
    if (!leftMap.has(rightItem.id)) {
      results.push({ type: 'added', right: rightItem, key: rightItem.id });
    }
  }

  return results.sort((a, b) => {
    const order: Record<DiffType, number> = { removed: 0, modified: 1, unchanged: 2, added: 3 };
    return order[a.type] - order[b.type];
  });
}

function diffConstraints(
  left: ChallengeConstraints,
  right: ChallengeConstraints
): DiffResult<string>[] {
  const results: DiffResult<string>[] = [];
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]) as Set<keyof ChallengeConstraints>;

  for (const key of keys) {
    const leftVal = formatConstraintValue(left[key]);
    const rightVal = formatConstraintValue(right[key]);

    if (leftVal && !rightVal) {
      results.push({ type: 'removed', left: leftVal, key });
    } else if (!leftVal && rightVal) {
      results.push({ type: 'added', right: rightVal, key });
    } else if (leftVal !== rightVal) {
      results.push({ type: 'modified', left: leftVal, right: rightVal, key });
    } else if (leftVal && rightVal) {
      results.push({ type: 'unchanged', left: leftVal, right: rightVal, key });
    }
  }

  return results.sort((a, b) => {
    const order: Record<DiffType, number> = { removed: 0, modified: 1, unchanged: 2, added: 3 };
    return order[a.type] - order[b.type];
  });
}

function formatConstraintValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function formatConstraintKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
