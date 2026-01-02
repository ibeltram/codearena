'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  AdminPartnerReward,
  useBulkUploadCodes,
} from '@/hooks/use-admin-rewards';
import { RewardTier } from '@/types/rewards';

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerId: string | null;
  partners: AdminPartnerReward[];
}

interface ParsedCode {
  tierSlug: string;
  code: string;
  codeType: 'single_use' | 'multi_use' | 'api_generated';
  expiresAt?: string;
}

interface ParseError {
  line: number;
  message: string;
}

export function BulkUploadDialog({
  open,
  onOpenChange,
  partnerId,
  partners,
}: BulkUploadDialogProps) {
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(partnerId || '');
  const [csvContent, setCsvContent] = useState('');
  const [parsedCodes, setParsedCodes] = useState<ParsedCode[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);

  const bulkUpload = useBulkUploadCodes();

  // Get selected partner and its tiers
  const selectedPartner = partners.find((p) => p.id === selectedPartnerId);
  const availableTiers = (selectedPartner?.tiers as RewardTier[]) || [];

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedPartnerId(partnerId || '');
      setCsvContent('');
      setParsedCodes([]);
      setParseErrors([]);
      setUploadSuccess(false);
      setUploadedCount(0);
    }
  }, [open, partnerId]);

  // Parse CSV content
  const parseCSV = (content: string): { codes: ParsedCode[]; errors: ParseError[] } => {
    const codes: ParsedCode[] = [];
    const errors: ParseError[] = [];
    const lines = content.trim().split('\n');
    const validTierSlugs = new Set(availableTiers.map((t) => t.slug));

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      // Skip empty lines and header
      if (!trimmed || trimmed.toLowerCase().startsWith('tier') || trimmed.toLowerCase().startsWith('code')) {
        return;
      }

      // Parse CSV columns: tier_slug,code,expires_at(optional)
      const parts = trimmed.split(',').map((p) => p.trim());

      if (parts.length < 2) {
        errors.push({ line: lineNum, message: 'Expected at least tier_slug,code' });
        return;
      }

      const [tierSlug, code, expiresAt] = parts;

      if (!tierSlug) {
        errors.push({ line: lineNum, message: 'Missing tier_slug' });
        return;
      }

      if (!validTierSlugs.has(tierSlug)) {
        errors.push({ line: lineNum, message: `Invalid tier_slug: ${tierSlug}` });
        return;
      }

      if (!code) {
        errors.push({ line: lineNum, message: 'Missing code' });
        return;
      }

      // Validate expires_at if provided
      if (expiresAt) {
        const date = new Date(expiresAt);
        if (isNaN(date.getTime())) {
          errors.push({ line: lineNum, message: `Invalid date: ${expiresAt}` });
          return;
        }
      }

      codes.push({
        tierSlug,
        code,
        codeType: 'single_use',
        expiresAt: expiresAt || undefined,
      });
    });

    return { codes, errors };
  };

  // Handle CSV content change
  const handleContentChange = (content: string) => {
    setCsvContent(content);

    if (content.trim() && selectedPartnerId) {
      const { codes, errors } = parseCSV(content);
      setParsedCodes(codes);
      setParseErrors(errors);
    } else {
      setParsedCodes([]);
      setParseErrors([]);
    }
  };

  // Handle partner change
  const handlePartnerChange = (newPartnerId: string) => {
    setSelectedPartnerId(newPartnerId);
    setParsedCodes([]);
    setParseErrors([]);
    if (csvContent.trim()) {
      handleContentChange(csvContent);
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleContentChange(content);
    };
    reader.readAsText(file);
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!selectedPartnerId || parsedCodes.length === 0) return;

    try {
      const result = await bulkUpload.mutateAsync({
        partnerId: selectedPartnerId,
        codes: parsedCodes,
      });

      setUploadSuccess(true);
      setUploadedCount(result.uploaded);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Reward Codes</DialogTitle>
          <DialogDescription>
            Bulk upload reward codes from a CSV file or paste directly.
          </DialogDescription>
        </DialogHeader>

        {uploadSuccess ? (
          // Success state
          <div className="py-8 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h3 className="mt-4 text-lg font-medium">Upload Successful</h3>
            <p className="mt-2 text-muted-foreground">
              {uploadedCount} code{uploadedCount !== 1 ? 's' : ''} uploaded successfully.
            </p>
            <Button className="mt-6" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          // Upload form
          <div className="space-y-6">
            {/* Partner selector */}
            <div className="space-y-2">
              <Label>Partner *</Label>
              <Select value={selectedPartnerId} onValueChange={handlePartnerChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a partner" />
                </SelectTrigger>
                <SelectContent>
                  {partners
                    .filter((p) => p.isActive)
                    .map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Available tiers */}
            {selectedPartner && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm text-muted-foreground mb-2">Available tiers:</p>
                <div className="flex flex-wrap gap-2">
                  {availableTiers.map((tier) => (
                    <code
                      key={tier.slug}
                      className="rounded bg-muted px-2 py-1 text-xs font-mono"
                    >
                      {tier.slug}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* File upload */}
            <div className="space-y-2">
              <Label>Upload CSV File</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  disabled={!selectedPartnerId}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                CSV format: tier_slug,code,expires_at (optional)
              </p>
            </div>

            {/* Or paste */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or paste directly</span>
              </div>
            </div>

            {/* Text area */}
            <div className="space-y-2">
              <Label>CSV Content</Label>
              <Textarea
                value={csvContent}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder={`tier_slug,code,expires_at\nstarter,ABC123,2025-12-31\npro,XYZ789`}
                rows={8}
                className="font-mono text-sm"
                disabled={!selectedPartnerId}
              />
            </div>

            {/* Parse results */}
            {(parsedCodes.length > 0 || parseErrors.length > 0) && (
              <div className="space-y-3">
                {parsedCodes.length > 0 && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">
                      {parsedCodes.length} valid code{parsedCodes.length !== 1 ? 's' : ''} ready to upload
                    </span>
                  </div>
                )}

                {parseErrors.length > 0 && (
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
                    <div className="flex items-center gap-2 text-destructive mb-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {parseErrors.length} error{parseErrors.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <ul className="text-xs text-destructive space-y-1">
                      {parseErrors.slice(0, 5).map((error, i) => (
                        <li key={i}>
                          Line {error.line}: {error.message}
                        </li>
                      ))}
                      {parseErrors.length > 5 && (
                        <li>...and {parseErrors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={bulkUpload.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!selectedPartnerId || parsedCodes.length === 0 || bulkUpload.isPending}
              >
                {bulkUpload.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload {parsedCodes.length > 0 ? `${parsedCodes.length} Codes` : 'Codes'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
