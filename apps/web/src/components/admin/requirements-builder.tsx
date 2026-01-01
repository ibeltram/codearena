'use client';

import { useState } from 'react';
import { Plus, GripVertical, Trash2, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChallengeRequirement,
  EvidenceType,
  generateId,
  calculateTotalWeight,
  validateRequirementWeights,
  evidenceTypeLabels,
} from '@/types/challenge';

interface RequirementsBuilderProps {
  requirements: ChallengeRequirement[];
  onChange: (requirements: ChallengeRequirement[]) => void;
}

// Color palette for weight visualization bars
const WEIGHT_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-yellow-500',
  'bg-red-500',
];

// Weight distribution visualization component
function WeightDistributionBar({ requirements }: { requirements: ChallengeRequirement[] }) {
  const totalWeight = calculateTotalWeight(requirements);

  if (requirements.length === 0 || totalWeight === 0) {
    return (
      <div className="h-8 w-full rounded-md bg-muted flex items-center justify-center">
        <span className="text-xs text-muted-foreground">No requirements</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="h-8 w-full rounded-md overflow-hidden flex bg-muted">
        {requirements.map((req, index) => {
          const widthPercent = (req.weight / Math.max(totalWeight, 100)) * 100;
          return (
            <div
              key={req.id}
              className={`${WEIGHT_COLORS[index % WEIGHT_COLORS.length]} transition-all duration-300 flex items-center justify-center`}
              style={{ width: `${widthPercent}%` }}
              title={`${req.title || `Requirement ${index + 1}`}: ${req.weight}%`}
            >
              {widthPercent > 10 && (
                <span className="text-xs font-medium text-white truncate px-1">
                  {req.weight}%
                </span>
              )}
            </div>
          );
        })}
        {totalWeight < 100 && (
          <div
            className="bg-muted-foreground/20 flex items-center justify-center"
            style={{ width: `${100 - totalWeight}%` }}
          >
            <span className="text-xs text-muted-foreground">
              {100 - totalWeight}%
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {requirements.map((req, index) => (
          <div key={req.id} className="flex items-center gap-1 text-xs">
            <div className={`w-3 h-3 rounded-sm ${WEIGHT_COLORS[index % WEIGHT_COLORS.length]}`} />
            <span className="text-muted-foreground truncate max-w-[100px]">
              {req.title || `Req ${index + 1}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RequirementsBuilder({ requirements, onChange }: RequirementsBuilderProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const totalWeight = calculateTotalWeight(requirements);
  const isValid = validateRequirementWeights(requirements);

  const addRequirement = () => {
    const newRequirement: ChallengeRequirement = {
      id: generateId(),
      title: '',
      description: '',
      weight: 0,
      order: requirements.length,
      evidenceType: 'test_pass',
    };
    onChange([...requirements, newRequirement]);
  };

  const updateRequirement = (index: number, updates: Partial<ChallengeRequirement>) => {
    const updated = requirements.map((req, i) =>
      i === index ? { ...req, ...updates } : req
    );
    onChange(updated);
  };

  const removeRequirement = (index: number) => {
    const updated = requirements
      .filter((_, i) => i !== index)
      .map((req, i) => ({ ...req, order: i }));
    onChange(updated);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const updated = [...requirements];
      const [removed] = updated.splice(draggedIndex, 1);
      updated.splice(dragOverIndex, 0, removed);
      // Update order values
      onChange(updated.map((req, i) => ({ ...req, order: i })));
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const distributeWeightsEvenly = () => {
    if (requirements.length === 0) return;
    const baseWeight = Math.floor(100 / requirements.length);
    const remainder = 100 % requirements.length;
    const updated = requirements.map((req, i) => ({
      ...req,
      weight: baseWeight + (i < remainder ? 1 : 0),
    }));
    onChange(updated);
  };

  return (
    <Card>
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Requirements</CardTitle>
          <div className="flex items-center gap-2">
            <div
              className={`text-sm ${
                isValid ? 'text-green-600' : 'text-amber-600'
              }`}
            >
              Total: {totalWeight}%
              {!isValid && requirements.length > 0 && ' (must be 100%)'}
            </div>
            {requirements.length > 0 && !isValid && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={distributeWeightsEvenly}
              >
                Distribute Evenly
              </Button>
            )}
          </div>
        </div>
        {/* Weight Distribution Visualization */}
        <div className="pt-2">
          <p className="text-sm text-muted-foreground mb-2">Weight Distribution</p>
          <WeightDistributionBar requirements={requirements} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {requirements.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-muted-foreground">No requirements yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add requirements to define what participants must complete
            </p>
          </div>
        )}

        {requirements.map((requirement, index) => (
          <div
            key={requirement.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`rounded-lg border p-4 ${
              dragOverIndex === index ? 'border-primary bg-primary/5' : ''
            } ${draggedIndex === index ? 'opacity-50' : ''}`}
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                className="mt-2 cursor-grab text-muted-foreground hover:text-foreground"
                onMouseDown={(e) => e.preventDefault()}
              >
                <GripVertical className="h-5 w-5" />
              </button>
              <div className="flex-1 space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Requirement title"
                      value={requirement.title}
                      onChange={(e) =>
                        updateRequirement(index, { title: e.target.value })
                      }
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Weight"
                      value={requirement.weight || ''}
                      onChange={(e) =>
                        updateRequirement(index, {
                          weight: parseInt(e.target.value) || 0,
                        })
                      }
                      className="text-right"
                    />
                  </div>
                  <span className="mt-2 text-sm text-muted-foreground">%</span>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Description (optional)"
                      value={requirement.description}
                      onChange={(e) =>
                        updateRequirement(index, { description: e.target.value })
                      }
                    />
                  </div>
                  <div className="w-40">
                    <Select
                      value={requirement.evidenceType || 'test_pass'}
                      onValueChange={(value: EvidenceType) =>
                        updateRequirement(index, { evidenceType: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Evidence Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(evidenceTypeLabels) as EvidenceType[]).map((type) => (
                          <SelectItem key={type} value={type}>
                            {evidenceTypeLabels[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeRequirement(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={addRequirement}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Requirement
        </Button>

        {requirements.length > 0 && !isValid && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4" />
            <span>Requirement weights must total exactly 100%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
