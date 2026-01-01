'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  Layers,
  FlaskConical,
  GitPullRequest,
  Scale,
  Coins,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import { useState } from 'react';

import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import {
  useAutomationJob,
  useAutomationJobResults,
  useCancelAutomationJob,
  useRetryAutomationJob,
} from '@/hooks';
import {
  AutomationJobType,
  AutomationJobStatus,
  AutomationJobResult,
  jobTypeLabels,
  tierLabels,
  statusLabels,
  formatCreditsRequired,
} from '@/types/automation';

// Icon mapping for job types
const jobTypeIconMap: Record<AutomationJobType, React.ReactNode> = {
  batch_run: <Layers className="h-5 w-5" />,
  eval_pipeline: <FlaskConical className="h-5 w-5" />,
  ci_check: <GitPullRequest className="h-5 w-5" />,
  multi_model_compare: <Scale className="h-5 w-5" />,
  agent_job: <Bot className="h-5 w-5" />,
};

// Status icon mapping
const statusIconMap: Record<AutomationJobStatus, React.ReactNode> = {
  pending: <Clock className="h-5 w-5" />,
  queued: <Clock className="h-5 w-5" />,
  running: <Loader2 className="h-5 w-5 animate-spin" />,
  completed: <CheckCircle className="h-5 w-5" />,
  failed: <XCircle className="h-5 w-5" />,
  cancelled: <XCircle className="h-5 w-5" />,
  timeout: <AlertCircle className="h-5 w-5" />,
};

// Status color mapping
const statusColorMap: Record<AutomationJobStatus, string> = {
  pending: 'text-gray-500',
  queued: 'text-blue-500',
  running: 'text-yellow-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  cancelled: 'text-gray-400',
  timeout: 'text-orange-500',
};

// Result Step Component
function ResultStep({ result, index }: { result: AutomationJobResult; index: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopyOutput = async () => {
    if (result.outputData) {
      await navigator.clipboard.writeText(JSON.stringify(result.outputData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const stepStatusIcon: Record<string, React.ReactNode> = {
    pending: <Clock className="h-4 w-4 text-gray-400" />,
    running: <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />,
    success: <CheckCircle className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
  };

  return (
    <AccordionItem value={`step-${index}`}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3 text-left">
          {stepStatusIcon[result.status]}
          <div>
            <span className="font-medium">
              Step {result.stepIndex + 1}: {result.stepName || `Step ${result.stepIndex + 1}`}
            </span>
            {result.score !== null && (
              <Badge variant="outline" className="ml-2">
                Score: {result.score}
              </Badge>
            )}
          </div>
          {result.executionTimeMs && (
            <span className="text-sm text-muted-foreground ml-auto mr-4">
              {(result.executionTimeMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2">
          {result.errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{result.errorMessage}</AlertDescription>
            </Alert>
          )}

          {result.outputData && (
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Output</span>
                <Button variant="ghost" size="sm" onClick={handleCopyOutput}>
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm">
                {JSON.stringify(result.outputData, null, 2)}
              </pre>
            </div>
          )}

          {result.evidence && (
            <div>
              <span className="text-sm font-medium">Evidence</span>
              <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm mt-2">
                {JSON.stringify(result.evidence, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const { data: job, isLoading: loadingJob, error: jobError } = useAutomationJob(jobId);
  const { data: resultsData, isLoading: loadingResults } = useAutomationJobResults(jobId);

  const cancelMutation = useCancelAutomationJob();
  const retryMutation = useRetryAutomationJob();

  const canCancel = job && ['pending', 'queued'].includes(job.status);
  const canRetry = job && ['failed', 'timeout'].includes(job.status);

  const handleCancel = async () => {
    if (confirm('Are you sure you want to cancel this job? Your credits will be refunded.')) {
      try {
        await cancelMutation.mutateAsync(jobId);
      } catch (error) {
        console.error('Failed to cancel job:', error);
      }
    }
  };

  const handleRetry = async () => {
    if (confirm('Retry this job? Credits will be deducted again.')) {
      try {
        await retryMutation.mutateAsync(jobId);
      } catch (error) {
        console.error('Failed to retry job:', error);
      }
    }
  };

  if (jobError) {
    return (
      <MainLayout>
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load job details. The job may not exist or you don't have access.
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => router.push('/automation')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Automation
        </Button>

        {/* Loading State */}
        {loadingJob && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
        )}

        {/* Job Details */}
        {job && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {jobTypeIconMap[job.jobType]}
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{job.name}</h1>
                  <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                    <span>{jobTypeLabels[job.jobType]}</span>
                    <span>-</span>
                    <span>{tierLabels[job.tier]}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canCancel && (
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={cancelMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                )}
                {canRetry && (
                  <Button
                    variant="outline"
                    onClick={handleRetry}
                    disabled={retryMutation.isPending}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                )}
              </div>
            </div>

            {/* Status Card */}
            <Card>
              <CardContent className="p-6">
                <div className="grid gap-6 md:grid-cols-4">
                  {/* Status */}
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <div className={`flex items-center gap-2 font-medium ${statusColorMap[job.status]}`}>
                      {statusIconMap[job.status]}
                      {statusLabels[job.status]}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Progress</span>
                    <div className="space-y-2">
                      <Progress value={job.progress} className="h-2" />
                      <span className="text-sm font-medium">{job.progress}%</span>
                    </div>
                  </div>

                  {/* Credits */}
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Credits Cost</span>
                    <div className="flex items-center gap-1 font-medium">
                      <Coins className="h-4 w-4 text-primary" />
                      {formatCreditsRequired(job.creditsCost)}
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Duration</span>
                    <div className="font-medium">
                      {job.executionTimeMs
                        ? `${(job.executionTimeMs / 1000).toFixed(2)}s`
                        : job.startedAt
                        ? 'Running...'
                        : '-'}
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="mt-6 pt-6 border-t grid gap-4 md:grid-cols-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <div>{new Date(job.createdAt).toLocaleString()}</div>
                  </div>
                  {job.queuedAt && (
                    <div>
                      <span className="text-muted-foreground">Queued</span>
                      <div>{new Date(job.queuedAt).toLocaleString()}</div>
                    </div>
                  )}
                  {job.startedAt && (
                    <div>
                      <span className="text-muted-foreground">Started</span>
                      <div>{new Date(job.startedAt).toLocaleString()}</div>
                    </div>
                  )}
                  {job.completedAt && (
                    <div>
                      <span className="text-muted-foreground">Completed</span>
                      <div>{new Date(job.completedAt).toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Error Message */}
            {job.errorMessage && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Job Failed</AlertTitle>
                <AlertDescription>{job.errorMessage}</AlertDescription>
              </Alert>
            )}

            {/* Output Summary */}
            {job.outputSummary && (
              <Card>
                <CardHeader>
                  <CardTitle>Output Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{job.outputSummary}</p>
                </CardContent>
              </Card>
            )}

            {/* Job Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>The input configuration for this job</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm">
                  {JSON.stringify(job.inputConfig, null, 2)}
                </pre>
              </CardContent>
            </Card>

            {/* Results */}
            <Card>
              <CardHeader>
                <CardTitle>Results</CardTitle>
                <CardDescription>
                  {loadingResults
                    ? 'Loading results...'
                    : resultsData?.results?.length
                    ? `${resultsData.results.length} step(s)`
                    : 'No results yet'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingResults && (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                )}

                {!loadingResults && resultsData?.results && resultsData.results.length > 0 && (
                  <Accordion type="multiple" className="w-full">
                    {resultsData.results.map((result, index) => (
                      <ResultStep key={result.id} result={result} index={index} />
                    ))}
                  </Accordion>
                )}

                {!loadingResults && (!resultsData?.results || resultsData.results.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    {['pending', 'queued'].includes(job.status)
                      ? 'Results will appear here once the job starts processing.'
                      : 'No results available for this job.'}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Description */}
            {job.description && (
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{job.description}</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
