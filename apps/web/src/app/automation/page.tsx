'use client';

import { useState } from 'react';
import {
  Bot,
  Layers,
  FlaskConical,
  GitPullRequest,
  Scale,
  Coins,
  Play,
  History,
  Zap,
  ArrowRight,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
// Note: Zap is kept for potential future use in the hero section

import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  useAutomationPricing,
  useAutomationJobs,
  useCancelAutomationJob,
  useRetryAutomationJob,
  useCreditBalance,
} from '@/hooks';
import { JobCreationWizard } from '@/components/automation/job-creation-wizard';
import {
  AutomationJobType,
  AutomationTier,
  AutomationJobStatus,
  AutomationJobSummary,
  jobTypeLabels,
  jobTypeDescriptions,
  tierLabels,
  statusLabels,
  statusColors,
  formatCreditsRequired,
} from '@/types/automation';
import { formatCredits } from '@/types/wallet';

// Icon mapping for job types
const jobTypeIconMap: Record<AutomationJobType, React.ReactNode> = {
  batch_run: <Layers className="h-5 w-5" />,
  eval_pipeline: <FlaskConical className="h-5 w-5" />,
  ci_check: <GitPullRequest className="h-5 w-5" />,
  multi_model_compare: <Scale className="h-5 w-5" />,
  agent_job: <Bot className="h-5 w-5" />,
};

// Service Card Component
function ServiceCard({
  jobType,
  pricing,
  userBalance,
  onSelect,
}: {
  jobType: AutomationJobType;
  pricing: { small: number; medium: number; large: number };
  userBalance: number;
  onSelect: (jobType: AutomationJobType) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const minCost = pricing.small;
  const canAfford = userBalance >= minCost;

  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {jobTypeIconMap[jobType]}
            </div>
            <div>
              <CardTitle className="text-lg">{jobTypeLabels[jobType]}</CardTitle>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">From</div>
            <div className="flex items-center gap-1 font-semibold">
              <Coins className="h-4 w-4 text-primary" />
              {formatCreditsRequired(minCost)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{jobTypeDescriptions[jobType]}</p>

        {/* Tier Pricing */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground"
        >
          <span>View pricing tiers</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {expanded && (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {(['small', 'medium', 'large'] as AutomationTier[]).map((tier) => (
              <div
                key={tier}
                className="rounded-lg border p-2 text-center"
              >
                <div className="text-xs font-medium text-muted-foreground">
                  {tierLabels[tier]}
                </div>
                <div className="flex items-center justify-center gap-1 font-semibold">
                  <Coins className="h-3 w-3 text-primary" />
                  {formatCreditsRequired(pricing[tier])}
                </div>
              </div>
            ))}
          </div>
        )}

        <Button
          onClick={() => onSelect(jobType)}
          variant={canAfford ? 'default' : 'outline'}
          className="w-full"
        >
          {canAfford ? (
            <>
              Create Job <ArrowRight className="ml-2 h-4 w-4" />
            </>
          ) : (
            <>
              View Details <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// Job Status Badge
function JobStatusBadge({ status }: { status: AutomationJobStatus }) {
  const iconMap: Record<AutomationJobStatus, React.ReactNode> = {
    pending: <Clock className="h-3 w-3" />,
    queued: <Clock className="h-3 w-3" />,
    running: <Loader2 className="h-3 w-3 animate-spin" />,
    completed: <CheckCircle className="h-3 w-3" />,
    failed: <XCircle className="h-3 w-3" />,
    cancelled: <XCircle className="h-3 w-3" />,
    timeout: <AlertCircle className="h-3 w-3" />,
  };

  const colorMap: Record<AutomationJobStatus, string> = {
    pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    queued: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    running: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    timeout: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  };

  return (
    <Badge variant="secondary" className={`gap-1 ${colorMap[status]}`}>
      {iconMap[status]}
      {statusLabels[status]}
    </Badge>
  );
}

// Job Card Component
function JobCard({
  job,
  onCancel,
  onRetry,
  onView,
}: {
  job: AutomationJobSummary;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onView: (id: string) => void;
}) {
  const canCancel = ['pending', 'queued'].includes(job.status);
  const canRetry = ['failed', 'timeout'].includes(job.status);

  return (
    <Card className="transition-all hover:shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              {jobTypeIconMap[job.jobType]}
            </div>
            <div className="space-y-1">
              <div className="font-medium">{job.name}</div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{jobTypeLabels[job.jobType]}</span>
                <span>-</span>
                <span>{tierLabels[job.tier]}</span>
              </div>
              {job.status === 'running' && job.progress > 0 && (
                <div className="mt-2 w-48">
                  <Progress value={job.progress} className="h-1.5" />
                  <span className="text-xs text-muted-foreground">{job.progress}% complete</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <JobStatusBadge status={job.status} />
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Coins className="h-3 w-3" />
              {formatCreditsRequired(job.creditsCost)}
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(job.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t pt-3">
          {job.outputSummary && (
            <p className="text-sm text-muted-foreground line-clamp-1 flex-1 mr-4">
              {job.outputSummary}
            </p>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {canCancel && (
              <Button variant="outline" size="sm" onClick={() => onCancel(job.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            {canRetry && (
              <Button variant="outline" size="sm" onClick={() => onRetry(job.id)}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onView(job.id)}>
              View Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Loading skeleton
function ServiceCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="text-right">
            <Skeleton className="h-4 w-12 mb-1" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-12 w-full mb-4" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

function JobCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AutomationPage() {
  const [activeTab, setActiveTab] = useState<'services' | 'jobs'>('services');
  const [statusFilter, setStatusFilter] = useState<AutomationJobStatus | 'all'>('all');
  const [jobTypeFilter, setJobTypeFilter] = useState<AutomationJobType | 'all'>('all');
  const [selectedJobType, setSelectedJobType] = useState<AutomationJobType | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Data fetching
  const { data: pricingData, isLoading: loadingPricing, error: pricingError } = useAutomationPricing();
  const { data: balanceResponse } = useCreditBalance();
  const {
    data: jobsResponse,
    isLoading: loadingJobs,
    error: jobsError,
  } = useAutomationJobs({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    jobType: jobTypeFilter !== 'all' ? jobTypeFilter : undefined,
    limit: 20,
  });

  const cancelMutation = useCancelAutomationJob();
  const retryMutation = useRetryAutomationJob();

  const userBalance = balanceResponse?.data?.available || 0;
  const pricing = pricingData?.creditCosts;
  const jobs = jobsResponse?.jobs || [];

  const handleSelectService = (jobType: AutomationJobType) => {
    setSelectedJobType(jobType);
    setShowCreateDialog(true);
  };

  const handleCancelJob = async (id: string) => {
    if (confirm('Are you sure you want to cancel this job? Your credits will be refunded.')) {
      try {
        await cancelMutation.mutateAsync(id);
      } catch (error) {
        console.error('Failed to cancel job:', error);
      }
    }
  };

  const handleRetryJob = async (id: string) => {
    if (confirm('Retry this job? Credits will be deducted again.')) {
      try {
        await retryMutation.mutateAsync(id);
      } catch (error) {
        console.error('Failed to retry job:', error);
      }
    }
  };

  const handleViewJob = (id: string) => {
    // Navigate to job detail page
    window.location.href = `/automation/jobs/${id}`;
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border p-8">
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,rgba(255,255,255,0.5))]" />
          <div className="relative space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Automation Services</h1>
                <p className="text-muted-foreground">
                  Redeem credits for powerful AI-powered development tasks
                </p>
              </div>
            </div>

            <p className="max-w-2xl text-muted-foreground">
              Run batch prompts, evaluation pipelines, CI checks, multi-model comparisons,
              and agent jobs. Services that go beyond what subscription chat products offer.
            </p>

            {/* User Balance Display */}
            <div className="flex items-center gap-4 mt-4">
              <Card className="bg-card/50 backdrop-blur">
                <CardContent className="flex items-center gap-3 p-4">
                  <Coins className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm text-muted-foreground">Your Balance</div>
                    <div className="text-2xl font-bold">{formatCredits(userBalance)}</div>
                  </div>
                </CardContent>
              </Card>

              <Button variant="outline" asChild>
                <a href="/wallet">Add Credits</a>
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'services' | 'jobs')}>
          <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid">
            <TabsTrigger value="services" className="gap-2">
              <Play className="h-4 w-4" />
              Services
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-2">
              <History className="h-4 w-4" />
              My Jobs
              {jobs.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {jobsResponse?.total || jobs.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Services Tab */}
          <TabsContent value="services" className="mt-6">
            {pricingError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Failed to load pricing information. Please try again later.
                </AlertDescription>
              </Alert>
            )}

            {loadingPricing && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <ServiceCardSkeleton key={i} />
                ))}
              </div>
            )}

            {!loadingPricing && pricing && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {(Object.keys(pricing) as AutomationJobType[]).map((jobType) => (
                  <ServiceCard
                    key={jobType}
                    jobType={jobType}
                    pricing={pricing[jobType]}
                    userBalance={userBalance}
                    onSelect={handleSelectService}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Jobs Tab */}
          <TabsContent value="jobs" className="mt-6 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4">
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as AutomationJobStatus | 'all')}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="timeout">Timeout</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={jobTypeFilter}
                onValueChange={(v) => setJobTypeFilter(v as AutomationJobType | 'all')}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="batch_run">Batch Runs</SelectItem>
                  <SelectItem value="eval_pipeline">Evaluation Pipelines</SelectItem>
                  <SelectItem value="ci_check">CI Checks</SelectItem>
                  <SelectItem value="multi_model_compare">Multi-Model Comparison</SelectItem>
                  <SelectItem value="agent_job">Agent Jobs</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Error State */}
            {jobsError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Failed to load your jobs. Please try again later.
                </AlertDescription>
              </Alert>
            )}

            {/* Loading State */}
            {loadingJobs && (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <JobCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loadingJobs && jobs.length === 0 && (
              <Card className="text-center py-12">
                <CardContent>
                  <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No Jobs Yet</h3>
                  <p className="text-muted-foreground mt-2">
                    Create your first automation job to get started.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => setActiveTab('services')}
                  >
                    Browse Services
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Jobs List */}
            {!loadingJobs && jobs.length > 0 && (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onCancel={handleCancelJob}
                    onRetry={handleRetryJob}
                    onView={handleViewJob}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Job Creation Wizard */}
        <JobCreationWizard
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          selectedJobType={selectedJobType}
          pricing={pricing}
          userBalance={userBalance}
        />
      </div>
    </MainLayout>
  );
}
