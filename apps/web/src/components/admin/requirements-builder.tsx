'use client';

import { useState } from 'react';
import { Plus, GripVertical, Trash2, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChallengeRequirement,
  generateId,
  calculateTotalWeight,
  validateRequirementWeights,
} from '@/types/challenge';

interface RequirementsBuilderProps {
  requirements: ChallengeRequirement[];
  onChange: (requirements: ChallengeRequirement[]) => void;
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
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
                <Input
                  placeholder="Description (optional)"
                  value={requirement.description}
                  onChange={(e) =>
                    updateRequirement(index, { description: e.target.value })
                  }
                />
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
