'use client';

import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChallengeRequirement,
  RubricCriterion,
  EvidenceType,
  generateId,
  calculateTotalPoints,
  evidenceTypeLabels,
  evidenceTypeDescriptions,
} from '@/types/challenge';

interface RubricEditorProps {
  requirements: ChallengeRequirement[];
  rubric: RubricCriterion[];
  onChange: (rubric: RubricCriterion[]) => void;
}

const EVIDENCE_TYPES: EvidenceType[] = [
  'code_analysis',
  'test_pass',
  'file_exists',
  'output_match',
  'manual_review',
  'ai_review',
];

export function RubricEditor({ requirements, rubric, onChange }: RubricEditorProps) {
  const [expandedRequirements, setExpandedRequirements] = useState<Set<string>>(
    new Set(requirements.map((r) => r.id))
  );

  const totalPoints = calculateTotalPoints(rubric);

  const getCriteriaForRequirement = (requirementId: string) => {
    return rubric.filter((c) => c.requirementId === requirementId);
  };

  const addCriterion = (requirementId: string) => {
    const newCriterion: RubricCriterion = {
      id: generateId(),
      requirementId,
      title: '',
      description: '',
      maxPoints: 10,
      evidenceType: 'code_analysis',
    };
    onChange([...rubric, newCriterion]);
  };

  const updateCriterion = (id: string, updates: Partial<RubricCriterion>) => {
    onChange(rubric.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const removeCriterion = (id: string) => {
    onChange(rubric.filter((c) => c.id !== id));
  };

  const toggleRequirement = (id: string) => {
    const newExpanded = new Set(expandedRequirements);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRequirements(newExpanded);
  };

  if (requirements.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rubric Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-muted-foreground">Add requirements first</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Rubric criteria are linked to requirements
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">Rubric Criteria</CardTitle>
        <div className="text-sm text-muted-foreground">
          Total: {totalPoints} points
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {requirements.map((requirement) => {
          const criteria = getCriteriaForRequirement(requirement.id);
          const isExpanded = expandedRequirements.has(requirement.id);
          const requirementPoints = criteria.reduce((sum, c) => sum + c.maxPoints, 0);

          return (
            <div key={requirement.id} className="rounded-lg border">
              <button
                type="button"
                className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50"
                onClick={() => toggleRequirement(requirement.id)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <div>
                    <span className="font-medium">
                      {requirement.title || 'Untitled Requirement'}
                    </span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      ({requirement.weight}%)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {criteria.length} {criteria.length === 1 ? 'criterion' : 'criteria'}
                  </Badge>
                  <Badge variant="outline">{requirementPoints} pts</Badge>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t p-4 space-y-3">
                  {criteria.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No criteria defined for this requirement
                    </p>
                  )}

                  {criteria.map((criterion) => (
                    <div
                      key={criterion.id}
                      className="rounded-lg bg-muted/50 p-4 space-y-3"
                    >
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <Input
                            placeholder="Criterion title"
                            value={criterion.title}
                            onChange={(e) =>
                              updateCriterion(criterion.id, { title: e.target.value })
                            }
                          />
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            min="0"
                            placeholder="Points"
                            value={criterion.maxPoints || ''}
                            onChange={(e) =>
                              updateCriterion(criterion.id, {
                                maxPoints: parseInt(e.target.value) || 0,
                              })
                            }
                            className="text-right"
                          />
                        </div>
                        <span className="mt-2 text-sm text-muted-foreground">pts</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeCriterion(criterion.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <Input
                        placeholder="Description (optional)"
                        value={criterion.description}
                        onChange={(e) =>
                          updateCriterion(criterion.id, { description: e.target.value })
                        }
                      />

                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Evidence Type
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {EVIDENCE_TYPES.map((type) => (
                            <button
                              key={type}
                              type="button"
                              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                                criterion.evidenceType === type
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted hover:bg-muted/80'
                              }`}
                              onClick={() =>
                                updateCriterion(criterion.id, { evidenceType: type })
                              }
                              title={evidenceTypeDescriptions[type]}
                            >
                              {evidenceTypeLabels[type]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => addCriterion(requirement.id)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Criterion
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
