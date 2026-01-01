'use client';

import { useState } from 'react';
import { Flag, Loader2, Send, AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useReportUser } from '@/hooks/use-report-user';

// Report reason options
const REPORT_REASONS = [
  { value: 'cheating', label: 'Cheating/Unfair Play', description: 'Match manipulation, exploits, or unfair advantages' },
  { value: 'harassment', label: 'Harassment', description: 'Abusive behavior, threats, or targeted harassment' },
  { value: 'inappropriate_content', label: 'Inappropriate Content', description: 'Offensive profile content or submissions' },
  { value: 'spam', label: 'Spam/Bot Activity', description: 'Suspicious automated behavior or promotional spam' },
  { value: 'other', label: 'Other', description: 'Other violations not covered above' },
] as const;

type ReportReason = typeof REPORT_REASONS[number]['value'];

interface ReportUserDialogProps {
  userId: string;
  userName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ReportUserDialog({
  userId,
  userName,
  isOpen,
  onOpenChange,
  onSuccess,
}: ReportUserDialogProps) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reportUser = useReportUser();

  const resetForm = () => {
    setReason('');
    setDescription('');
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason) {
      setError('Please select a reason for this report.');
      return;
    }

    if (description.trim().length < 10) {
      setError('Please provide a description with at least 10 characters.');
      return;
    }

    try {
      await reportUser.mutateAsync({
        userId,
        data: {
          reason,
          description: description.trim(),
          evidence: {},
        },
      });

      setSuccess(true);

      // Auto-close after a delay
      setTimeout(() => {
        resetForm();
        onOpenChange(false);
        onSuccess?.();
      }, 2500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit report';
      setError(errorMessage);
    }
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const selectedReason = REPORT_REASONS.find((r) => r.value === reason);

  // Show success state
  if (success) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <DialogTitle className="text-xl mb-2">Report Submitted</DialogTitle>
            <DialogDescription>
              Thank you for helping keep our community safe.
              Our moderation team will review your report within 48 hours.
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-red-500" />
              Report User
            </DialogTitle>
            <DialogDescription>
              Report <span className="font-semibold">{userName}</span> for a
              violation of our community guidelines. All reports are anonymous.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>Reports are confidential.</strong> The reported user will
                not know who filed the report. Please only submit reports for
                genuine violations.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="reason" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Reason for Report *
              </Label>
              <Select value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
                <SelectTrigger id="reason">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedReason && (
                <p className="text-xs text-muted-foreground">
                  {selectedReason.description}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Please describe the issue in detail. Include specific examples, dates, or context that would help our moderation team investigate..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[120px]"
                required
                minLength={10}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {description.length}/2000 characters (min 10)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={reportUser.isPending || !reason || description.trim().length < 10}
              className="gap-2"
            >
              {reportUser.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Report
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
