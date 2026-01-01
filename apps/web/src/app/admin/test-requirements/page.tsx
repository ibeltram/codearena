'use client';

import { useState } from 'react';
import { RequirementsBuilder } from '@/components/admin/requirements-builder';
import { RubricEditor } from '@/components/admin/rubric-editor';
import { TemplateManager } from '@/components/admin/template-manager';
import { ChallengeRequirement, RubricCriterion } from '@/types/challenge';

export default function TestRequirementsPage() {
  const [requirements, setRequirements] = useState<ChallengeRequirement[]>([
    {
      id: '1',
      title: 'Implement API endpoint',
      description: 'Create a RESTful endpoint for user data',
      weight: 40,
      order: 0,
      evidenceType: 'test_pass',
    },
    {
      id: '2',
      title: 'Add authentication',
      description: 'Implement JWT authentication',
      weight: 35,
      order: 1,
      evidenceType: 'code_analysis',
    },
    {
      id: '3',
      title: 'Write tests',
      description: 'Unit tests with >80% coverage',
      weight: 25,
      order: 2,
      evidenceType: 'test_pass',
    },
  ]);

  const [templateRef, setTemplateRef] = useState('');

  const [rubric, setRubric] = useState<RubricCriterion[]>([
    {
      id: 'r1',
      requirementId: '1',
      title: 'API returns correct status codes',
      description: 'GET returns 200, POST returns 201, errors return 4xx/5xx',
      maxPoints: 20,
      evidenceType: 'test_pass',
      evidenceConfig: { testFilePattern: 'tests/api/*.test.ts' },
    },
    {
      id: 'r2',
      requirementId: '2',
      title: 'JWT implementation quality',
      description: 'Proper token signing, expiration, and validation',
      maxPoints: 15,
      evidenceType: 'ai_review',
      evidenceConfig: { aiPrompt: 'Review the JWT implementation for security best practices. Check for proper token expiration, secure storage, and validation.' },
    },
    {
      id: 'r3',
      requirementId: '3',
      title: 'Test coverage',
      description: 'Unit tests cover critical paths',
      maxPoints: 10,
      evidenceType: 'code_analysis',
      evidenceConfig: { analysisRules: 'min-coverage:80' },
    },
  ]);

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Requirements & Rubric Editor Test</h1>
        <p className="text-muted-foreground">
          Test page for the RequirementsBuilder and RubricEditor components.
        </p>
      </div>

      <RequirementsBuilder
        requirements={requirements}
        onChange={setRequirements}
      />

      <RubricEditor
        requirements={requirements}
        rubric={rubric}
        onChange={setRubric}
      />

      <TemplateManager
        templateRef={templateRef}
        onChange={setTemplateRef}
      />

      <div className="p-4 bg-muted rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Current State (Debug)</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium mb-1">Requirements</h3>
            <pre className="text-xs overflow-auto max-h-60">
              {JSON.stringify(requirements, null, 2)}
            </pre>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-1">Rubric</h3>
            <pre className="text-xs overflow-auto max-h-60">
              {JSON.stringify(rubric, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
