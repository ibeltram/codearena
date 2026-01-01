'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Send, FileText, Link as LinkIcon, Info, CheckCircle2, XCircle } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useCreateDispute } from '@/hooks';

interface DisputeDialogProps {
  matchId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DisputeDialog({ matchId, isOpen, onOpenChange, onSuccess }: DisputeDialogProps) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [links, setLinks] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createDispute = useCreateDispute();

  const resetForm = () => {
    setReason('');
    setDescription('');
    setLinks('');
    setAdditionalContext('');
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (reason.trim().length < 10) {
      setError('Please provide a reason with at least 10 characters.');
      return;
    }

    try {
      const linksArray = links
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.startsWith('http'));

      await createDispute.mutateAsync({
        matchId,
        data: {
          reason: reason.trim(),
          evidence: {
            description: description.trim() || undefined,
            links: linksArray.length > 0 ? linksArray : undefined,
            additionalContext: additionalContext.trim() || undefined,
          },
        },
      });

      setSuccess(true);

      // Auto-close after a delay
      setTimeout(() => {
        resetForm();
        onOpenChange(false);
        onSuccess?.();
      }, 2000);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create dispute';
      setError(errorMessage);
    }
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  // Show success state
  if (success) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <DialogTitle className="text-xl mb-2">Dispute Filed Successfully</DialogTitle>
            <DialogDescription>
              Our team will review your dispute within 48 hours.
              You will be notified of the outcome.
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Open Dispute
            </DialogTitle>
            <DialogDescription>
              File a dispute if you believe the match results are incorrect or unfair.
              Our moderation team will review your case within 48 hours.
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
              <AlertDescription>
                Disputes should only be filed for legitimate issues such as:
                <ul className="list-disc ml-4 mt-1 text-sm">
                  <li>Judging errors or incorrect scoring</li>
                  <li>Technical issues during the match</li>
                  <li>Opponent misconduct or cheating</li>
                  <li>System malfunctions affecting results</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="reason" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Reason for Dispute *
              </Label>
              <Textarea
                id="reason"
                placeholder="Explain why you are disputing this match result. Be specific about what you believe was incorrect..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[100px]"
                required
                minLength={10}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {reason.length}/2000 characters (min 10)
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <p className="text-sm font-medium">Supporting Evidence (Optional)</p>

              <div className="space-y-2">
                <Label htmlFor="description">Evidence Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe any evidence you have to support your dispute..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="links" className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Supporting Links
                </Label>
                <Textarea
                  id="links"
                  placeholder="Paste URLs to screenshots, recordings, or other evidence (one per line)..."
                  value={links}
                  onChange={(e) => setLinks(e.target.value)}
                  className="min-h-[60px]"
                />
                <p className="text-xs text-muted-foreground">
                  Enter one URL per line (must start with http:// or https://)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="additionalContext">Additional Context</Label>
                <Input
                  id="additionalContext"
                  placeholder="Any other relevant information..."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createDispute.isPending || reason.trim().length < 10}
              className="gap-2"
            >
              {createDispute.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Dispute
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
