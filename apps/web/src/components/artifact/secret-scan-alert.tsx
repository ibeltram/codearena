/**
 * Secret Scan Alert Component
 *
 * Displays warnings about detected secrets in artifacts and provides
 * an acknowledgment flow for artifact owners.
 */

'use client';

import { useState } from 'react';
import { AlertTriangle, Shield, ShieldCheck, ShieldAlert, Eye, EyeOff, FileWarning } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export interface SecretFinding {
  id: string;
  filePath: string;
  lineNumber: number | null;
  secretType: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  evidence: string | null;
}

interface SecretScanAlertProps {
  artifactId: string;
  status: 'pending' | 'clean' | 'flagged' | 'acknowledged';
  findings: SecretFinding[];
  isOwner: boolean;
  scannedAt: string | null;
  acknowledgedAt: string | null;
  onAcknowledge?: (note: string) => Promise<void>;
}

const severityColors = {
  high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

const secretTypeLabels: Record<string, string> = {
  env_file: 'Environment File',
  api_key: 'API Key',
  private_key: 'Private Key',
  credential_file: 'Credential File',
  aws_credentials: 'AWS Credentials',
  database_url: 'Database URL',
  jwt_secret: 'JWT Secret',
  oauth_token: 'OAuth Token',
  github_token: 'GitHub Token',
  stripe_key: 'Stripe Key',
  password_in_code: 'Hardcoded Password',
};

export function SecretScanAlert({
  artifactId,
  status,
  findings,
  isOwner,
  scannedAt,
  acknowledgedAt,
  onAcknowledge,
}: SecretScanAlertProps) {
  const [showFindings, setShowFindings] = useState(false);
  const [acknowledgeDialogOpen, setAcknowledgeDialogOpen] = useState(false);
  const [acknowledgmentNote, setAcknowledgmentNote] = useState('');
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  const handleAcknowledge = async () => {
    if (!onAcknowledge) return;

    setIsAcknowledging(true);
    try {
      await onAcknowledge(acknowledgmentNote);
      setAcknowledgeDialogOpen(false);
    } catch (error) {
      console.error('Failed to acknowledge secrets:', error);
    } finally {
      setIsAcknowledging(false);
    }
  };

  // Pending scan status
  if (status === 'pending') {
    return (
      <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
        <Shield className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-800 dark:text-yellow-200">
          Security Scan Pending
        </AlertTitle>
        <AlertDescription className="text-yellow-700 dark:text-yellow-300">
          This artifact is being scanned for potential secrets. Please wait...
        </AlertDescription>
      </Alert>
    );
  }

  // Clean status
  if (status === 'clean') {
    return (
      <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
        <ShieldCheck className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-800 dark:text-green-200">
          Security Scan Passed
        </AlertTitle>
        <AlertDescription className="text-green-700 dark:text-green-300">
          No secrets were detected in this artifact.
          {scannedAt && (
            <span className="ml-2 text-sm opacity-75">
              Scanned {new Date(scannedAt).toLocaleString()}
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // Acknowledged status
  if (status === 'acknowledged') {
    return (
      <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950">
        <ShieldAlert className="h-4 w-4 text-orange-600" />
        <AlertTitle className="text-orange-800 dark:text-orange-200">
          Secrets Acknowledged
        </AlertTitle>
        <AlertDescription className="text-orange-700 dark:text-orange-300">
          <p>
            This artifact contains secrets that have been acknowledged by the owner.
            It remains private and is not publicly viewable.
          </p>
          {acknowledgedAt && (
            <p className="mt-1 text-sm opacity-75">
              Acknowledged {new Date(acknowledgedAt).toLocaleString()}
            </p>
          )}
          {findings.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setShowFindings(!showFindings)}
            >
              {showFindings ? (
                <>
                  <EyeOff className="mr-1 h-3 w-3" /> Hide Findings
                </>
              ) : (
                <>
                  <Eye className="mr-1 h-3 w-3" /> Show {findings.length} Finding{findings.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          )}
        </AlertDescription>
        {showFindings && <SecretFindingsList findings={findings} />}
      </Alert>
    );
  }

  // Flagged status
  const highSeverityCount = findings.filter(f => f.severity === 'high').length;
  const mediumSeverityCount = findings.filter(f => f.severity === 'medium').length;
  const lowSeverityCount = findings.filter(f => f.severity === 'low').length;

  return (
    <Alert variant="destructive" className="border-red-500">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <span>Potential Secrets Detected</span>
        <div className="flex gap-1">
          {highSeverityCount > 0 && (
            <Badge className={severityColors.high}>{highSeverityCount} High</Badge>
          )}
          {mediumSeverityCount > 0 && (
            <Badge className={severityColors.medium}>{mediumSeverityCount} Medium</Badge>
          )}
          {lowSeverityCount > 0 && (
            <Badge className={severityColors.low}>{lowSeverityCount} Low</Badge>
          )}
        </div>
      </AlertTitle>
      <AlertDescription>
        <p className="mb-2">
          This artifact contains {findings.length} potential secret{findings.length !== 1 ? 's' : ''} that could expose sensitive information.
          {!isOwner && ' Public viewing is blocked.'}
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFindings(!showFindings)}
          >
            {showFindings ? (
              <>
                <EyeOff className="mr-1 h-3 w-3" /> Hide Findings
              </>
            ) : (
              <>
                <Eye className="mr-1 h-3 w-3" /> View Findings
              </>
            )}
          </Button>

          {isOwner && onAcknowledge && (
            <Dialog open={acknowledgeDialogOpen} onOpenChange={setAcknowledgeDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <ShieldCheck className="mr-1 h-3 w-3" /> Acknowledge & Keep Private
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Acknowledge Detected Secrets</DialogTitle>
                  <DialogDescription>
                    By acknowledging these findings, you confirm that you understand this artifact
                    contains sensitive information. The artifact will remain private and will not
                    be publicly viewable.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="rounded-md border p-3 bg-yellow-50 dark:bg-yellow-950">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      <AlertTriangle className="inline mr-1 h-4 w-4" />
                      {findings.length} secret{findings.length !== 1 ? 's' : ''} detected
                    </p>
                    <ul className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                      {findings.slice(0, 3).map((f, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <FileWarning className="h-3 w-3" />
                          {f.filePath} - {secretTypeLabels[f.secretType] || f.secretType}
                        </li>
                      ))}
                      {findings.length > 3 && (
                        <li className="text-sm opacity-75">
                          ...and {findings.length - 3} more
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="acknowledgment-note">
                      Note (optional)
                    </Label>
                    <Textarea
                      id="acknowledgment-note"
                      placeholder="Explain why these secrets are acceptable (e.g., test credentials, example values)..."
                      value={acknowledgmentNote}
                      onChange={(e) => setAcknowledgmentNote(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAcknowledgeDialogOpen(false)}
                    disabled={isAcknowledging}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAcknowledge}
                    disabled={isAcknowledging}
                    className="bg-yellow-600 hover:bg-yellow-700"
                  >
                    {isAcknowledging ? 'Acknowledging...' : 'Acknowledge Secrets'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </AlertDescription>

      {showFindings && <SecretFindingsList findings={findings} />}
    </Alert>
  );
}

function SecretFindingsList({ findings }: { findings: SecretFinding[] }) {
  return (
    <div className="mt-4 space-y-2">
      <h4 className="text-sm font-medium">Detected Secrets:</h4>
      <div className="space-y-2">
        {findings.map((finding) => (
          <div
            key={finding.id}
            className="rounded-md border bg-background p-3 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs">{finding.filePath}</span>
              <Badge className={severityColors[finding.severity]}>
                {finding.severity}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="outline">
                {secretTypeLabels[finding.secretType] || finding.secretType}
              </Badge>
              {finding.lineNumber && (
                <span className="text-muted-foreground">Line {finding.lineNumber}</span>
              )}
            </div>
            <p className="mt-1 text-muted-foreground">{finding.description}</p>
            {finding.evidence && (
              <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs font-mono">
                {finding.evidence}
              </code>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SecretScanAlert;
