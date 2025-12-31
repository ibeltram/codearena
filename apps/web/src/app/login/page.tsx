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

  function handleGoogleLogin() {
    setIsLoading(true);
    setError(null);

    // Build redirect URL with current redirect param
    const redirect = searchParams.get('redirect') || '/';
    const loginRedirect = encodeURIComponent(`${window.location.origin}/login?redirect=${encodeURIComponent(redirect)}`);

    // Redirect to Google OAuth endpoint
    window.location.href = `${API_URL}/api/auth/google?redirect=${loginRedirect}`;
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

          <Button
            variant="outline"
            className="w-full h-12 text-base"
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            Continue with Google
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
