'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Layers,
  FlaskConical,
  GitPullRequest,
  Scale,
  Coins,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useCreateAutomationJob } from '@/hooks';
import {
  AutomationJobType,
  AutomationTier,
  BatchRunConfig,
  EvalPipelineConfig,
  CICheckConfig,
  MultiModelCompareConfig,
  AgentJobConfig,
  AutomationInputConfig,
  jobTypeLabels,
  tierLabels,
  formatCreditsRequired,
  CreditCosts,
} from '@/types/automation';

// Props
interface JobCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedJobType: AutomationJobType | null;
  pricing: CreditCosts | undefined;
  userBalance: number;
}

// Icon mapping
const jobTypeIconMap: Record<AutomationJobType, React.ReactNode> = {
  batch_run: <Layers className="h-5 w-5" />,
  eval_pipeline: <FlaskConical className="h-5 w-5" />,
  ci_check: <GitPullRequest className="h-5 w-5" />,
  multi_model_compare: <Scale className="h-5 w-5" />,
  agent_job: <Bot className="h-5 w-5" />,
};

// Available models for selection
const AVAILABLE_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'claude-3-opus', label: 'Claude 3 Opus' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
  { value: 'gemini-pro', label: 'Gemini Pro' },
  { value: 'llama-3-70b', label: 'Llama 3 70B' },
];

// Output format options
const OUTPUT_FORMATS = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'markdown', label: 'Markdown' },
];

// CI Check options
const CI_CHECK_OPTIONS = [
  { value: 'lint', label: 'Lint' },
  { value: 'typecheck', label: 'Type Check' },
  { value: 'test', label: 'Tests' },
  { value: 'security', label: 'Security' },
  { value: 'performance', label: 'Performance' },
];

// Agent task types
const AGENT_TASK_TYPES = [
  { value: 'refactor', label: 'Refactor Code' },
  { value: 'generate_tests', label: 'Generate Tests' },
  { value: 'documentation', label: 'Write Documentation' },
  { value: 'code_review', label: 'Code Review' },
  { value: 'custom', label: 'Custom Task' },
];

// Batch Run Form
function BatchRunForm({
  config,
  onChange,
}: {
  config: Partial<BatchRunConfig>;
  onChange: (config: Partial<BatchRunConfig>) => void;
}) {
  const prompts = config.prompts || [];

  const addPrompt = () => {
    onChange({
      ...config,
      prompts: [...prompts, { id: `prompt-${Date.now()}`, content: '' }],
    });
  };

  const removePrompt = (index: number) => {
    const newPrompts = [...prompts];
    newPrompts.splice(index, 1);
    onChange({ ...config, prompts: newPrompts });
  };

  const updatePrompt = (index: number, content: string) => {
    const newPrompts = [...prompts];
    newPrompts[index] = { ...newPrompts[index], content };
    onChange({ ...config, prompts: newPrompts });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Model</Label>
        <Select
          value={config.model || ''}
          onValueChange={(value) => onChange({ ...config, model: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {AVAILABLE_MODELS.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Prompts ({prompts.length}/100)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPrompt}
            disabled={prompts.length >= 100}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Prompt
          </Button>
        </div>
        <ScrollArea className="h-[200px] rounded-md border p-2">
          {prompts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No prompts added yet. Click "Add Prompt" to start.
            </div>
          ) : (
            <div className="space-y-3">
              {prompts.map((prompt, index) => (
                <div key={prompt.id} className="flex gap-2">
                  <Textarea
                    placeholder={`Prompt ${index + 1}`}
                    value={prompt.content}
                    onChange={(e) => updatePrompt(index, e.target.value)}
                    className="min-h-[60px]"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePrompt(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Max Concurrency</Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={config.maxConcurrency || 5}
            onChange={(e) =>
              onChange({ ...config, maxConcurrency: parseInt(e.target.value) || 5 })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Output Format</Label>
          <Select
            value={config.outputFormat || 'json'}
            onValueChange={(value) =>
              onChange({ ...config, outputFormat: value as 'json' | 'csv' | 'markdown' })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPUT_FORMATS.map((format) => (
                <SelectItem key={format.value} value={format.value}>
                  {format.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// Eval Pipeline Form
function EvalPipelineForm({
  config,
  onChange,
}: {
  config: Partial<EvalPipelineConfig>;
  onChange: (config: Partial<EvalPipelineConfig>) => void;
}) {
  const testCases = config.testCases || [];

  const addTestCase = () => {
    onChange({
      ...config,
      testCases: [...testCases, { id: `test-${Date.now()}`, input: '' }],
    });
  };

  const removeTestCase = (index: number) => {
    const newTestCases = [...testCases];
    newTestCases.splice(index, 1);
    onChange({ ...config, testCases: newTestCases });
  };

  const updateTestCase = (
    index: number,
    field: 'input' | 'expectedOutput' | 'rubric',
    value: string
  ) => {
    const newTestCases = [...testCases];
    newTestCases[index] = { ...newTestCases[index], [field]: value };
    onChange({ ...config, testCases: newTestCases });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Model</Label>
        <Select
          value={config.model || ''}
          onValueChange={(value) => onChange({ ...config, model: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {AVAILABLE_MODELS.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Test Cases ({testCases.length}/50)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTestCase}
            disabled={testCases.length >= 50}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Test Case
          </Button>
        </div>
        <ScrollArea className="h-[200px] rounded-md border p-2">
          {testCases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No test cases added yet. Click "Add Test Case" to start.
            </div>
          ) : (
            <div className="space-y-4">
              {testCases.map((testCase, index) => (
                <Card key={testCase.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Test Case {index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTestCase(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Input prompt"
                      value={testCase.input}
                      onChange={(e) => updateTestCase(index, 'input', e.target.value)}
                      className="min-h-[40px]"
                    />
                    <Textarea
                      placeholder="Expected output (optional)"
                      value={testCase.expectedOutput || ''}
                      onChange={(e) => updateTestCase(index, 'expectedOutput', e.target.value)}
                      className="min-h-[40px]"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="space-y-2">
        <Label>Pass Threshold (%)</Label>
        <Input
          type="number"
          min={0}
          max={100}
          value={config.passThreshold || 70}
          onChange={(e) =>
            onChange({ ...config, passThreshold: parseInt(e.target.value) || 70 })
          }
        />
      </div>
    </div>
  );
}

// CI Check Form
function CICheckForm({
  config,
  onChange,
}: {
  config: Partial<CICheckConfig>;
  onChange: (config: Partial<CICheckConfig>) => void;
}) {
  const checks = config.checks || [];

  const toggleCheck = (check: string) => {
    const newChecks = checks.includes(check as any)
      ? checks.filter((c) => c !== check)
      : [...checks, check as any];
    onChange({ ...config, checks: newChecks });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Repository URL</Label>
        <Input
          placeholder="https://github.com/owner/repo"
          value={config.repository || ''}
          onChange={(e) => onChange({ ...config, repository: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Branch</Label>
          <Input
            placeholder="main"
            value={config.branch || ''}
            onChange={(e) => onChange({ ...config, branch: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>PR Number (optional)</Label>
          <Input
            type="number"
            placeholder="123"
            value={config.pullRequestNumber || ''}
            onChange={(e) =>
              onChange({
                ...config,
                pullRequestNumber: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Checks to Run</Label>
        <div className="grid grid-cols-2 gap-2">
          {CI_CHECK_OPTIONS.map((check) => (
            <div
              key={check.value}
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                checks.includes(check.value as any)
                  ? 'bg-primary/10 border-primary'
                  : 'hover:bg-muted'
              }`}
              onClick={() => toggleCheck(check.value)}
            >
              <Switch checked={checks.includes(check.value as any)} />
              <span className="text-sm">{check.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <Label>Generate Fixes</Label>
          <Switch
            checked={config.generateFixes || false}
            onCheckedChange={(checked) => onChange({ ...config, generateFixes: checked })}
          />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <Label>Post Comment</Label>
          <Switch
            checked={config.postComment || false}
            onCheckedChange={(checked) => onChange({ ...config, postComment: checked })}
          />
        </div>
      </div>
    </div>
  );
}

// Multi-Model Compare Form
function MultiModelCompareForm({
  config,
  onChange,
}: {
  config: Partial<MultiModelCompareConfig>;
  onChange: (config: Partial<MultiModelCompareConfig>) => void;
}) {
  const models = config.models || [];

  const toggleModel = (model: string) => {
    const newModels = models.includes(model)
      ? models.filter((m) => m !== model)
      : [...models, model];
    onChange({ ...config, models: newModels });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Prompt to Compare</Label>
        <Textarea
          placeholder="Enter the prompt you want to test across multiple models..."
          value={config.prompt || ''}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          className="min-h-[100px]"
        />
      </div>

      <div className="space-y-2">
        <Label>Models to Compare ({models.length}/5)</Label>
        <div className="grid grid-cols-2 gap-2">
          {AVAILABLE_MODELS.map((model) => (
            <div
              key={model.value}
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                models.includes(model.value)
                  ? 'bg-primary/10 border-primary'
                  : 'hover:bg-muted'
              } ${models.length >= 5 && !models.includes(model.value) ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (models.length < 5 || models.includes(model.value)) {
                  toggleModel(model.value);
                }
              }}
            >
              <Switch checked={models.includes(model.value)} />
              <span className="text-sm">{model.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Output Format</Label>
        <Select
          value={config.outputFormat || 'table'}
          onValueChange={(value) =>
            onChange({ ...config, outputFormat: value as 'json' | 'markdown' | 'table' })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="table">Table</SelectItem>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Agent Job Form
function AgentJobForm({
  config,
  onChange,
}: {
  config: Partial<AgentJobConfig>;
  onChange: (config: Partial<AgentJobConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Task Type</Label>
        <Select
          value={config.taskType || ''}
          onValueChange={(value) =>
            onChange({
              ...config,
              taskType: value as AgentJobConfig['taskType'],
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select task type" />
          </SelectTrigger>
          <SelectContent>
            {AGENT_TASK_TYPES.map((task) => (
              <SelectItem key={task.value} value={task.value}>
                {task.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Repository URL (optional)</Label>
        <Input
          placeholder="https://github.com/owner/repo"
          value={config.repository || ''}
          onChange={(e) => onChange({ ...config, repository: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Target Files (comma-separated, optional)</Label>
        <Input
          placeholder="src/components/*.tsx, src/utils/*.ts"
          value={config.targetFiles?.join(', ') || ''}
          onChange={(e) =>
            onChange({
              ...config,
              targetFiles: e.target.value
                ? e.target.value.split(',').map((f) => f.trim())
                : undefined,
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Instructions</Label>
        <Textarea
          placeholder="Describe what you want the agent to do..."
          value={config.instructions || ''}
          onChange={(e) => onChange({ ...config, instructions: e.target.value })}
          className="min-h-[100px]"
        />
      </div>

      <div className="space-y-2">
        <Label>Output Format</Label>
        <Select
          value={config.outputFormat || 'report'}
          onValueChange={(value) =>
            onChange({ ...config, outputFormat: value as 'patch' | 'files' | 'report' })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="report">Report</SelectItem>
            <SelectItem value="patch">Patch</SelectItem>
            <SelectItem value="files">Files</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Main component
export function JobCreationWizard({
  open,
  onOpenChange,
  selectedJobType,
  pricing,
  userBalance,
}: JobCreationWizardProps) {
  const router = useRouter();
  const createJobMutation = useCreateAutomationJob();

  // Form state
  const [step, setStep] = useState<'config' | 'review'>('config');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState<AutomationTier>('small');
  const [config, setConfig] = useState<Partial<AutomationInputConfig>>({});
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      setStep('config');
      setName('');
      setDescription('');
      setTier('small');
      setConfig({});
      setError(null);
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  // Get credit cost
  const creditCost = selectedJobType && pricing ? pricing[selectedJobType][tier] : 0;
  const canAfford = userBalance >= creditCost;

  // Validate config
  const validateConfig = useCallback(() => {
    if (!name.trim()) {
      setError('Job name is required');
      return false;
    }

    if (!selectedJobType) {
      setError('Job type is required');
      return false;
    }

    switch (selectedJobType) {
      case 'batch_run': {
        const batchConfig = config as Partial<BatchRunConfig>;
        if (!batchConfig.model) {
          setError('Please select a model');
          return false;
        }
        if (!batchConfig.prompts || batchConfig.prompts.length === 0) {
          setError('Please add at least one prompt');
          return false;
        }
        if (batchConfig.prompts.some((p) => !p.content.trim())) {
          setError('All prompts must have content');
          return false;
        }
        break;
      }
      case 'eval_pipeline': {
        const evalConfig = config as Partial<EvalPipelineConfig>;
        if (!evalConfig.model) {
          setError('Please select a model');
          return false;
        }
        if (!evalConfig.testCases || evalConfig.testCases.length === 0) {
          setError('Please add at least one test case');
          return false;
        }
        if (evalConfig.testCases.some((t) => !t.input.trim())) {
          setError('All test cases must have input');
          return false;
        }
        break;
      }
      case 'ci_check': {
        const ciConfig = config as Partial<CICheckConfig>;
        if (!ciConfig.repository?.trim()) {
          setError('Repository URL is required');
          return false;
        }
        if (!ciConfig.branch?.trim()) {
          setError('Branch name is required');
          return false;
        }
        if (!ciConfig.checks || ciConfig.checks.length === 0) {
          setError('Please select at least one check');
          return false;
        }
        break;
      }
      case 'multi_model_compare': {
        const compareConfig = config as Partial<MultiModelCompareConfig>;
        if (!compareConfig.prompt?.trim()) {
          setError('Prompt is required');
          return false;
        }
        if (!compareConfig.models || compareConfig.models.length < 2) {
          setError('Please select at least 2 models to compare');
          return false;
        }
        break;
      }
      case 'agent_job': {
        const agentConfig = config as Partial<AgentJobConfig>;
        if (!agentConfig.taskType) {
          setError('Please select a task type');
          return false;
        }
        if (!agentConfig.instructions?.trim()) {
          setError('Instructions are required');
          return false;
        }
        break;
      }
    }

    setError(null);
    return true;
  }, [name, selectedJobType, config]);

  // Handle next step
  const handleNext = () => {
    if (validateConfig()) {
      setStep('review');
    }
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!validateConfig() || !selectedJobType) return;

    try {
      // Build the full config with type discriminator
      const fullConfig = {
        type: selectedJobType,
        ...config,
      } as AutomationInputConfig;

      const result = await createJobMutation.mutateAsync({
        name,
        description: description || undefined,
        jobType: selectedJobType,
        tier,
        config: fullConfig,
      });

      // Success - close dialog and navigate to job
      handleOpenChange(false);
      router.push(`/automation/jobs/${result.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create job');
    }
  };

  // Render form based on job type
  const renderForm = () => {
    if (!selectedJobType) return null;

    const formProps = {
      config,
      onChange: setConfig as any,
    };

    switch (selectedJobType) {
      case 'batch_run':
        return <BatchRunForm {...formProps} />;
      case 'eval_pipeline':
        return <EvalPipelineForm {...formProps} />;
      case 'ci_check':
        return <CICheckForm {...formProps} />;
      case 'multi_model_compare':
        return <MultiModelCompareForm {...formProps} />;
      case 'agent_job':
        return <AgentJobForm {...formProps} />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedJobType && jobTypeIconMap[selectedJobType]}
            Create {selectedJobType && jobTypeLabels[selectedJobType]} Job
          </DialogTitle>
          <DialogDescription>
            {step === 'config'
              ? 'Configure your automation job settings.'
              : 'Review your job configuration before submitting.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'config' ? (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Job Name *</Label>
                  <Input
                    placeholder="My automation job"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={255}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea
                    placeholder="Describe what this job does..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={1000}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tier</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['small', 'medium', 'large'] as AutomationTier[]).map((t) => {
                      const cost = selectedJobType && pricing ? pricing[selectedJobType][t] : 0;
                      const affordable = userBalance >= cost;
                      return (
                        <div
                          key={t}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            tier === t
                              ? 'bg-primary/10 border-primary'
                              : affordable
                              ? 'hover:bg-muted'
                              : 'opacity-50 cursor-not-allowed'
                          }`}
                          onClick={() => affordable && setTier(t)}
                        >
                          <div className="font-medium">{tierLabels[t]}</div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Coins className="h-3 w-3" />
                            {formatCreditsRequired(cost)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Job-specific config */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Configuration</Label>
                {renderForm()}
              </div>
            </div>
          ) : (
            // Review step
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Job Name</span>
                    <span className="font-medium">{name}</span>
                  </div>
                  {description && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Description</span>
                      <span className="text-sm text-right max-w-[200px] truncate">
                        {description}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Job Type</span>
                    <Badge variant="outline">
                      {selectedJobType && jobTypeLabels[selectedJobType]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tier</span>
                    <Badge variant="secondary">{tierLabels[tier]}</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Credit Cost</span>
                    <div className="flex items-center gap-1 font-semibold text-primary">
                      <Coins className="h-4 w-4" />
                      {formatCreditsRequired(creditCost)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Your Balance</span>
                    <div className="flex items-center gap-1">
                      <Coins className="h-4 w-4" />
                      {formatCreditsRequired(userBalance)}
                    </div>
                  </div>
                  {!canAfford && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        You don't have enough credits for this job.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2">Configuration Summary</h4>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[150px]">
                    {JSON.stringify(config, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
          {step === 'config' ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleNext}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('config')}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canAfford || createJobMutation.isPending}
              >
                {createJobMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Job
                    <Coins className="ml-2 h-4 w-4" />
                    {formatCreditsRequired(creditCost)}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
