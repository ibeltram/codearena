'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Code2, CheckCircle2, XCircle, Loader2, MonitorSmartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { env } from '@/lib/env';

interface DeviceStatus {
  valid: boolean;
  authorized: boolean;
  expiresIn: number;
}

interface AuthorizeResponse {
  success: boolean;
  message: string;
}

export default function DevicePage() {
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get('code') || '';

  const [userCode, setUserCode] = useState(codeFromUrl);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format code as XXXX-XXXX
  const formatCode = (value: string) => {
    // Remove any non-alphanumeric characters
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Insert hyphen after 4 characters
    if (clean.length > 4) {
      return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
    }
    return clean;
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCode(e.target.value);
    setUserCode(formatted);
    setError(null);
  };

  // Check device code status
  const { data: status, isLoading: isChecking } = useQuery<DeviceStatus>({
    queryKey: ['device-status', userCode],
    queryFn: async () => {
      if (userCode.length !== 9) return null;
      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/auth/device/status?userCode=${encodeURIComponent(userCode)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.errorDescription || 'Invalid code');
      }
      return res.json();
    },
    enabled: userCode.length === 9,
    refetchInterval: false,
    retry: false,
  });

  // Authorize mutation
  const authorizeMutation = useMutation<AuthorizeResponse, Error, string>({
    mutationFn: async (code: string) => {
      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/auth/device/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCode: code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.errorDescription || 'Authorization failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setIsAuthorized(true);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleAuthorize = () => {
    if (userCode.length !== 9) {
      setError('Please enter a valid 8-character code');
      return;
    }
    authorizeMutation.mutate(userCode);
  };

  // If code was provided in URL and is valid, show confirmation
  const codeIsValid = status?.valid && !status?.authorized;
  const codeAlreadyUsed = status?.authorized;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <MonitorSmartphone className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Sign in to CodeArena</CardTitle>
          <CardDescription>
            Enter the code displayed in your VS Code extension to authorize this device.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isAuthorized ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-green-600 mb-2">Device Authorized!</h3>
              <p className="text-muted-foreground">
                You can now close this page and return to VS Code.
                <br />
                Your extension should be signed in momentarily.
              </p>
            </div>
          ) : codeAlreadyUsed ? (
            <div className="text-center py-8">
              <XCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-yellow-600 mb-2">Code Already Used</h3>
              <p className="text-muted-foreground">
                This code has already been authorized.
                <br />
                Please generate a new code from VS Code if needed.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="user-code">
                  Device Code
                </label>
                <div className="relative">
                  <Code2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="user-code"
                    value={userCode}
                    onChange={handleCodeChange}
                    placeholder="XXXX-XXXX"
                    className="pl-10 text-center text-2xl tracking-widest font-mono uppercase"
                    maxLength={9}
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <XCircle className="h-4 w-4" />
                    {error}
                  </p>
                )}
                {isChecking && userCode.length === 9 && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking code...
                  </p>
                )}
                {codeIsValid && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Valid code - expires in {Math.floor((status?.expiresIn || 0) / 60)} minutes
                  </p>
                )}
              </div>

              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <h4 className="font-medium mb-2">How to get your code:</h4>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Open VS Code</li>
                  <li>Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)</li>
                  <li>Run &quot;CodeArena: Sign In&quot;</li>
                  <li>Copy the 8-character code shown</li>
                </ol>
              </div>
            </div>
          )}
        </CardContent>

        {!isAuthorized && !codeAlreadyUsed && (
          <CardFooter>
            <Button
              onClick={handleAuthorize}
              disabled={userCode.length !== 9 || authorizeMutation.isPending || !codeIsValid}
              className="w-full"
              size="lg"
            >
              {authorizeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authorizing...
                </>
              ) : (
                'Authorize Device'
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
