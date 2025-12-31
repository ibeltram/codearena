'use client';

import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Terminal,
  Package,
  Hammer,
  TestTube,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { JudgementRunInfo } from '@/hooks/use-match';

// Types for parsed log entries
interface LogEntry {
  type: 'info' | 'error' | 'warn' | 'success';
  message: string;
  timestamp?: string;
}

interface ParsedLogs {
  install: LogEntry[];
  build: LogEntry[];
  test: LogEntry[];
  lint: LogEntry[];
  all: LogEntry[];
}

// Parse log content into categorized entries
function parseLogs(content: string): ParsedLogs {
  const lines = content.split('\n');
  const result: ParsedLogs = {
    install: [],
    build: [],
    test: [],
    lint: [],
    all: [],
  };

  let currentSection: keyof Omit<ParsedLogs, 'all'> = 'build';

  for (const line of lines) {
    if (!line.trim()) continue;

    // Detect section changes
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('running install') || lowerLine.includes('npm install') || lowerLine.includes('yarn install')) {
      currentSection = 'install';
    } else if (lowerLine.includes('running build') || lowerLine.includes('npm run build')) {
      currentSection = 'build';
    } else if (lowerLine.includes('running test') || lowerLine.includes('npm test') || lowerLine.includes('jest') || lowerLine.includes('vitest')) {
      currentSection = 'test';
    } else if (lowerLine.includes('running lint') || lowerLine.includes('eslint') || lowerLine.includes('prettier')) {
      currentSection = 'lint';
    }

    // Determine log type
    let type: LogEntry['type'] = 'info';
    if (line.includes('[ERROR]') || line.includes('error:') || line.includes('Error:') || line.includes('FAIL')) {
      type = 'error';
    } else if (line.includes('[WARN]') || line.includes('warning:') || line.includes('Warning:')) {
      type = 'warn';
    } else if (line.includes('[SUCCESS]') || line.includes('PASS') || line.includes('successfully') || line.includes('completed')) {
      type = 'success';
    }

    const entry: LogEntry = { type, message: line };
    result[currentSection].push(entry);
    result.all.push(entry);
  }

  return result;
}

// Single log line component with syntax highlighting
function LogLine({ entry, lineNumber }: { entry: LogEntry; lineNumber: number }) {
  return (
    <div
      className={cn(
        'flex font-mono text-xs leading-5 hover:bg-muted/30 transition-colors',
        entry.type === 'error' && 'bg-red-500/10 hover:bg-red-500/20',
        entry.type === 'warn' && 'bg-yellow-500/10 hover:bg-yellow-500/20',
        entry.type === 'success' && 'bg-green-500/10 hover:bg-green-500/20'
      )}
    >
      {/* Line number */}
      <span className="w-12 flex-shrink-0 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-muted">
        {lineNumber}
      </span>

      {/* Icon indicator */}
      <span className="w-6 flex-shrink-0 flex items-center justify-center">
        {entry.type === 'error' && <XCircle className="h-3 w-3 text-red-500" />}
        {entry.type === 'warn' && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
        {entry.type === 'success' && <CheckCircle className="h-3 w-3 text-green-500" />}
      </span>

      {/* Log content with syntax highlighting */}
      <span
        className={cn(
          'flex-1 px-2 py-0.5 whitespace-pre-wrap break-all',
          entry.type === 'error' && 'text-red-400',
          entry.type === 'warn' && 'text-yellow-400',
          entry.type === 'success' && 'text-green-400'
        )}
      >
        {highlightSyntax(entry.message)}
      </span>
    </div>
  );
}

// Basic syntax highlighting for common patterns
function highlightSyntax(text: string): React.ReactNode {
  // Highlight timestamps
  const timestampRegex = /\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*\]/g;
  // Highlight file paths
  const pathRegex = /(?:\/[\w.-]+)+(?:\.[a-z]+)?(?::\d+(?::\d+)?)?/g;
  // Highlight numbers
  const numberRegex = /\b\d+(?:\.\d+)?(?:ms|s|%|MB|KB|GB)?\b/g;
  // Highlight quoted strings
  const stringRegex = /"[^"]*"|'[^']*'/g;

  let result = text;

  // Replace patterns with styled spans (simple approach)
  // In a production app, you'd use a proper tokenizer
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // Find all matches and their positions
  const matches: { start: number; end: number; text: string; type: string }[] = [];

  // Collect timestamp matches
  let match;
  while ((match = timestampRegex.exec(text)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], type: 'timestamp' });
  }

  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);

  // Build the result with highlighted parts
  for (const m of matches) {
    if (m.start > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, m.start)}</span>);
    }
    parts.push(
      <span key={key++} className="text-blue-400">
        {m.text}
      </span>
    );
    lastIndex = m.end;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : text;
}

// Log section component
function LogSection({
  title,
  icon,
  entries,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  entries: LogEntry[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const errorCount = entries.filter((e) => e.type === 'error').length;
  const warnCount = entries.filter((e) => e.type === 'warn').length;

  const handleCopy = async () => {
    const text = entries.map((e) => e.message).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (entries.length === 0) {
    return (
      <div className="border rounded-lg p-4 bg-muted/20">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="font-medium">{title}</span>
          <Badge variant="outline" className="ml-auto">
            No logs
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left">
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            {icon}
            <span className="font-medium">{title}</span>

            {/* Status badges */}
            <div className="ml-auto flex items-center gap-2">
              {errorCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {errorCount} error{errorCount > 1 ? 's' : ''}
                </Badge>
              )}
              {warnCount > 0 && (
                <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-400">
                  {warnCount} warning{warnCount > 1 ? 's' : ''}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {entries.length} line{entries.length > 1 ? 's' : ''}
              </Badge>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* Copy button */}
          <div className="flex justify-end p-2 border-b bg-muted/10">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 text-xs gap-1"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </Button>
          </div>

          {/* Log content */}
          <ScrollArea className="h-[300px]">
            <div className="bg-zinc-950 text-zinc-100">
              {entries.map((entry, index) => (
                <LogLine key={index} entry={entry} lineNumber={index + 1} />
              ))}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// Props for JudgingLogs component
interface JudgingLogsProps {
  judgementRun: JudgementRunInfo | null;
  logsContent?: string;
  isLoading?: boolean;
  onDownload?: () => void;
}

// Loading skeleton
function JudgingLogsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}

// Main JudgingLogs component
export function JudgingLogs({
  judgementRun,
  logsContent,
  isLoading,
  onDownload,
}: JudgingLogsProps) {
  const [activeTab, setActiveTab] = useState('all');

  // Parse logs when content is available
  const parsedLogs = useMemo(() => {
    if (!logsContent) return null;
    return parseLogs(logsContent);
  }, [logsContent]);

  if (isLoading) {
    return <JudgingLogsSkeleton />;
  }

  if (!judgementRun) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Judging Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            No judging logs available yet
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show loading state if run is still in progress
  if (judgementRun.status === 'running' || judgementRun.status === 'queued') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Judging Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Judging in progress... Logs will appear when complete.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No logs content available
  if (!logsContent || !parsedLogs) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Judging Logs
            </CardTitle>
            <Badge variant={judgementRun.status === 'success' ? 'default' : 'destructive'}>
              {judgementRun.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Logs not available for download
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Judging Logs
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={judgementRun.status === 'success' ? 'default' : 'destructive'}>
              {judgementRun.status}
            </Badge>
            {onDownload && (
              <Button variant="outline" size="sm" onClick={onDownload} className="gap-2">
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="all" className="gap-1">
              <Terminal className="h-3 w-3" />
              All
              <Badge variant="secondary" className="ml-1 h-5 px-1">
                {parsedLogs.all.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="install" className="gap-1">
              <Package className="h-3 w-3" />
              Install
              {parsedLogs.install.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1">
                  {parsedLogs.install.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="build" className="gap-1">
              <Hammer className="h-3 w-3" />
              Build
              {parsedLogs.build.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1">
                  {parsedLogs.build.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="test" className="gap-1">
              <TestTube className="h-3 w-3" />
              Test
              {parsedLogs.test.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1">
                  {parsedLogs.test.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="lint" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Lint
              {parsedLogs.lint.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1">
                  {parsedLogs.lint.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-0">
            <LogSection
              title="All Logs"
              icon={<Terminal className="h-4 w-4 text-muted-foreground" />}
              entries={parsedLogs.all}
              defaultOpen={true}
            />
          </TabsContent>

          <TabsContent value="install" className="mt-0">
            <LogSection
              title="Install Output"
              icon={<Package className="h-4 w-4 text-blue-400" />}
              entries={parsedLogs.install}
              defaultOpen={true}
            />
          </TabsContent>

          <TabsContent value="build" className="mt-0">
            <LogSection
              title="Build Output"
              icon={<Hammer className="h-4 w-4 text-orange-400" />}
              entries={parsedLogs.build}
              defaultOpen={true}
            />
          </TabsContent>

          <TabsContent value="test" className="mt-0">
            <LogSection
              title="Test Output"
              icon={<TestTube className="h-4 w-4 text-green-400" />}
              entries={parsedLogs.test}
              defaultOpen={true}
            />
          </TabsContent>

          <TabsContent value="lint" className="mt-0">
            <LogSection
              title="Lint Output"
              icon={<AlertTriangle className="h-4 w-4 text-yellow-400" />}
              entries={parsedLogs.lint}
              defaultOpen={true}
            />
          </TabsContent>
        </Tabs>

        {/* Metadata footer */}
        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground flex flex-wrap gap-4">
          {judgementRun.startedAt && (
            <span>Started: {new Date(judgementRun.startedAt).toLocaleString()}</span>
          )}
          {judgementRun.completedAt && (
            <span>Completed: {new Date(judgementRun.completedAt).toLocaleString()}</span>
          )}
          {judgementRun.startedAt && judgementRun.completedAt && (
            <span>
              Duration:{' '}
              {Math.round(
                (new Date(judgementRun.completedAt).getTime() -
                  new Date(judgementRun.startedAt).getTime()) /
                  1000
              )}
              s
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
