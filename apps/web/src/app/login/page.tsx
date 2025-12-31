'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Github, Swords, AlertCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setAccessToken, isAuthenticated } = useAuthStore();

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Handle OAuth callback tokens
  useEffect(() => {
    const authSuccess = searchParams.get('auth');
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const errorParam = searchParams.get('error');
    const errorDesc = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDesc || errorParam);
      return;
    }

    if (authSuccess === 'success' && accessToken) {
      // Store tokens
      setAccessToken(accessToken);

      // Store refresh token separately (could use httpOnly cookie in production)
      if (refreshToken) {
        localStorage.setItem('reporivals-refresh-token', refreshToken);
      }

      // Fetch user info
      fetchUserInfo(accessToken);
    }
  }, [searchParams, setAccessToken]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const redirect = searchParams.get('redirect') || '/';
      router.push(redirect);
    }
  }, [isAuthenticated, router, searchParams]);

  async function fetchUserInfo(accessToken: string) {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const user = await response.json();
        setUser({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: 'user',
        });

        // Redirect after successful login
        const redirect = searchParams.get('redirect') || '/';
        router.push(redirect);
      } else {
        setError('Failed to fetch user info');
      }
    } catch (err) {
      setError('Failed to connect to server');
    }
  }

  function handleGitHubLogin() {
    setIsLoading(true);
    setError(null);

    // Build redirect URL with current redirect param
    const redirect = searchParams.get('redirect') || '/';
    const loginRedirect = encodeURIComponent(`${window.location.origin}/login?redirect=${encodeURIComponent(redirect)}`);

    // Redirect to GitHub OAuth endpoint
    window.location.href = `${API_URL}/api/auth/github?redirect=${loginRedirect}`;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Swords className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Welcome to RepoRivals</CardTitle>
          <CardDescription>
            Sign in to compete, earn rewards, and climb the leaderboard
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            variant="outline"
            className="w-full h-12 text-base"
            onClick={handleGitHubLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Github className="mr-2 h-5 w-5" />
            )}
            Continue with GitHub
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or
              </span>
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>Using VS Code?</p>
            <p className="mt-1">
              Use the{' '}
              <Link href="/device" className="text-primary hover:underline">
                device code flow
              </Link>{' '}
              from the extension
            </p>
          </div>

          <Separator />

          <div className="text-center text-xs text-muted-foreground">
            By signing in, you agree to our{' '}
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
