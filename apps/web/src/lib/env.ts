/**
 * Environment configuration for the web app
 * Uses Next.js public env vars (NEXT_PUBLIC_*)
 */

// API configuration
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// App configuration
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Feature flags
export const ENABLE_DEVTOOLS =
  process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === 'true' ||
  process.env.NODE_ENV === 'development';

// Stripe
export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

// Environment helpers
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';

// Consolidated env object for convenience
export const env = {
  NEXT_PUBLIC_API_URL: API_URL,
  NEXT_PUBLIC_APP_URL: APP_URL,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_ENABLE_DEVTOOLS: ENABLE_DEVTOOLS,
};
