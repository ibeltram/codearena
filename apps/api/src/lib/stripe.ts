/**
 * Stripe Payment Service
 *
 * Handles credit purchases through Stripe:
 * - Checkout session creation
 * - Webhook processing
 * - Refund handling
 * - Idempotent credit issuance
 *
 * Credit Packages:
 * - 100 credits: $4.99
 * - 500 credits: $19.99 (save 20%)
 * - 1000 credits: $34.99 (save 30%)
 * - 5000 credits: $149.99 (save 40%)
 */

import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import {
  creditAccounts,
  creditLedgerEntries,
  purchases,
} from '../db/schema/credits';
import { users } from '../db/schema/users';
import { env } from './env';

// Credit package definitions
export const CREDIT_PACKAGES = {
  credits_100: {
    id: 'credits_100',
    credits: 100,
    priceInCents: 499, // $4.99
    name: '100 Credits',
    description: 'Get started with 100 credits',
  },
  credits_500: {
    id: 'credits_500',
    credits: 500,
    priceInCents: 1999, // $19.99
    name: '500 Credits',
    description: 'Save 20% - 500 credits package',
  },
  credits_1000: {
    id: 'credits_1000',
    credits: 1000,
    priceInCents: 3499, // $34.99
    name: '1000 Credits',
    description: 'Save 30% - 1000 credits package',
  },
  credits_5000: {
    id: 'credits_5000',
    credits: 5000,
    priceInCents: 14999, // $149.99
    name: '5000 Credits',
    description: 'Best value - Save 40%',
  },
} as const;

export type PackageId = keyof typeof CREDIT_PACKAGES;

// Stripe API base URL
const STRIPE_API_URL = 'https://api.stripe.com/v1';

// Types for Stripe API responses
interface StripeCheckoutSession {
  id: string;
  object: 'checkout.session';
  url: string;
  payment_intent?: string;
  payment_status: string;
  status: string;
  customer_email?: string;
  metadata: Record<string, string>;
}

interface StripePaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number;
  currency: string;
  status: string;
  metadata: Record<string, string>;
}

interface StripeCharge {
  id: string;
  object: 'charge';
  amount: number;
  amount_refunded: number;
  payment_intent?: string;
  refunded: boolean;
  metadata: Record<string, string>;
}

interface StripeEvent {
  id: string;
  object: 'event';
  type: string;
  data: {
    object: StripeCheckoutSession | StripePaymentIntent | StripeCharge;
  };
  created: number;
}

// Error types
export class StripeNotConfiguredError extends Error {
  constructor() {
    super('Stripe is not configured');
    this.name = 'StripeNotConfiguredError';
  }
}

export class StripeWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeWebhookError';
  }
}

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentError';
  }
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Make a request to the Stripe API
 */
async function stripeRequest<T>(
  endpoint: string,
  options: {
    method: 'GET' | 'POST' | 'DELETE';
    body?: Record<string, unknown>;
  } = { method: 'GET' }
): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new StripeNotConfiguredError();
  }

  const url = `${STRIPE_API_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const fetchOptions: RequestInit = {
    method: options.method,
    headers,
  };

  if (options.body && options.method === 'POST') {
    // Convert object to URL-encoded form data
    fetchOptions.body = encodeFormData(options.body);
  }

  const response = await fetch(url, fetchOptions);
  const data = await response.json() as T & { error?: { message: string } };

  if (!response.ok) {
    throw new PaymentError(data.error?.message || `Stripe API error: ${response.status}`);
  }

  return data;
}

/**
 * Encode object as URL form data (Stripe API format)
 */
function encodeFormData(obj: Record<string, unknown>, prefix = ''): string {
  const pairs: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      pairs.push(encodeFormData(value as Record<string, unknown>, fullKey));
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object') {
          pairs.push(encodeFormData(item as Record<string, unknown>, `${fullKey}[${index}]`));
        } else {
          pairs.push(`${encodeURIComponent(`${fullKey}[${index}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      pairs.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
    }
  }

  return pairs.filter(Boolean).join('&');
}

/**
 * Create a Stripe Checkout Session for credit purchase
 */
export async function createCheckoutSession(
  userId: string,
  packageId: PackageId,
  options: {
    successUrl?: string;
    cancelUrl?: string;
  } = {}
): Promise<{ sessionId: string; url: string }> {
  const pkg = CREDIT_PACKAGES[packageId];
  if (!pkg) {
    throw new PaymentError(`Invalid package: ${packageId}`);
  }

  // Get user email
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new PaymentError('User not found');
  }

  const successUrl = options.successUrl || `${env.WEB_URL}/wallet?purchase=success`;
  const cancelUrl = options.cancelUrl || `${env.WEB_URL}/wallet?purchase=cancelled`;

  const session = await stripeRequest<StripeCheckoutSession>('/checkout/sessions', {
    method: 'POST',
    body: {
      mode: 'payment',
      customer_email: user.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: pkg.priceInCents,
            product_data: {
              name: pkg.name,
              description: pkg.description,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        packageId,
        credits: pkg.credits,
      },
      payment_intent_data: {
        metadata: {
          userId,
          packageId,
          credits: pkg.credits,
        },
      },
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new StripeNotConfiguredError();
  }

  try {
    const parts = signature.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='));
    const signaturePart = parts.find((p) => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return false;
    }

    const timestamp = timestampPart.slice(2);
    const receivedSig = signaturePart.slice(3);

    // Check timestamp is within tolerance (5 minutes)
    const timestampSeconds = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 300; // 5 minutes

    if (Math.abs(now - timestampSeconds) > tolerance) {
      console.warn('Webhook signature timestamp outside tolerance');
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSig = crypto
      .createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
      .update(signedPayload)
      .digest('hex');

    // Compare signatures using timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(receivedSig),
      Buffer.from(expectedSig)
    );
  } catch (error) {
    console.error('Webhook signature verification error:', error);
    return false;
  }
}

/**
 * Parse and validate webhook event
 */
export function parseWebhookEvent(
  payload: string,
  signature: string
): StripeEvent {
  if (!verifyWebhookSignature(payload, signature)) {
    throw new StripeWebhookError('Invalid webhook signature');
  }

  try {
    return JSON.parse(payload) as StripeEvent;
  } catch {
    throw new StripeWebhookError('Invalid webhook payload');
  }
}

/**
 * Generate idempotency key for credit issuance
 */
function generateCreditIdempotencyKey(paymentIntentId: string): string {
  return crypto
    .createHash('sha256')
    .update(`purchase:${paymentIntentId}`)
    .digest('hex')
    .slice(0, 64);
}

/**
 * Issue credits for a successful payment
 * Idempotent - safe to call multiple times for same payment
 */
export async function issueCreditsForPayment(
  paymentIntentId: string,
  metadata: { userId: string; packageId: string; credits: string | number }
): Promise<{ success: boolean; alreadyProcessed: boolean }> {
  const userId = metadata.userId;
  const credits = typeof metadata.credits === 'string'
    ? parseInt(metadata.credits, 10)
    : metadata.credits;
  const packageId = metadata.packageId;
  const pkg = CREDIT_PACKAGES[packageId as PackageId];

  if (!userId || !credits || !pkg) {
    throw new PaymentError('Invalid payment metadata');
  }

  const idempotencyKey = generateCreditIdempotencyKey(paymentIntentId);

  return await db.transaction(async (tx) => {
    // Check if already processed (idempotency)
    const [existingEntry] = await tx
      .select()
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existingEntry) {
      console.log(`Payment ${paymentIntentId} already processed`);
      return { success: true, alreadyProcessed: true };
    }

    // Check for existing purchase record
    const [existingPurchase] = await tx
      .select()
      .from(purchases)
      .where(eq(purchases.stripePaymentIntentId, paymentIntentId))
      .limit(1);

    if (existingPurchase && existingPurchase.status === 'succeeded') {
      console.log(`Purchase ${paymentIntentId} already succeeded`);
      return { success: true, alreadyProcessed: true };
    }

    // Get or create credit account
    let [account] = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId))
      .limit(1);

    if (!account) {
      [account] = await tx
        .insert(creditAccounts)
        .values({ userId })
        .returning();
    }

    // Update or create purchase record
    if (existingPurchase) {
      await tx
        .update(purchases)
        .set({
          status: 'succeeded',
          updatedAt: new Date(),
        })
        .where(eq(purchases.id, existingPurchase.id));
    } else {
      await tx.insert(purchases).values({
        userId,
        stripePaymentIntentId: paymentIntentId,
        amountFiat: pkg.priceInCents,
        currency: 'usd',
        creditsIssued: credits,
        status: 'succeeded',
      });
    }

    // Create ledger entry
    await tx.insert(creditLedgerEntries).values({
      idempotencyKey,
      accountId: account.id,
      type: 'purchase',
      amount: credits,
      metadataJson: {
        paymentIntentId,
        packageId,
        amountFiat: pkg.priceInCents,
        currency: 'usd',
      },
    });

    // Update account balance
    await tx
      .update(creditAccounts)
      .set({
        balanceAvailable: account.balanceAvailable + credits,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, account.id));

    console.log(`Issued ${credits} credits to user ${userId} for payment ${paymentIntentId}`);

    return { success: true, alreadyProcessed: false };
  });
}

/**
 * Generate idempotency key for refund
 */
function generateRefundIdempotencyKey(paymentIntentId: string, refundAmount: number): string {
  return crypto
    .createHash('sha256')
    .update(`refund:${paymentIntentId}:${refundAmount}`)
    .digest('hex')
    .slice(0, 64);
}

/**
 * Handle refund - deduct credits from user account
 * Idempotent - safe to call multiple times for same refund
 */
export async function handleRefund(
  paymentIntentId: string,
  refundAmount: number
): Promise<{ success: boolean; alreadyProcessed: boolean; creditsDeducted: number }> {
  // Find the purchase
  const [purchase] = await db
    .select()
    .from(purchases)
    .where(eq(purchases.stripePaymentIntentId, paymentIntentId))
    .limit(1);

  if (!purchase) {
    throw new PaymentError(`Purchase not found for payment intent: ${paymentIntentId}`);
  }

  // Calculate credits to deduct based on refund amount ratio
  const refundRatio = refundAmount / purchase.amountFiat;
  const creditsToDeduct = Math.ceil(purchase.creditsIssued * refundRatio);

  const idempotencyKey = generateRefundIdempotencyKey(paymentIntentId, refundAmount);

  return await db.transaction(async (tx) => {
    // Check if already processed
    const [existingEntry] = await tx
      .select()
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existingEntry) {
      console.log(`Refund for ${paymentIntentId} already processed`);
      return { success: true, alreadyProcessed: true, creditsDeducted: 0 };
    }

    // Get credit account
    const [account] = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, purchase.userId))
      .limit(1);

    if (!account) {
      throw new PaymentError('Credit account not found for refund');
    }

    // Determine how many credits can actually be deducted
    const actualDeduction = Math.min(creditsToDeduct, account.balanceAvailable);

    // Update purchase status
    const isFullRefund = refundAmount >= purchase.amountFiat;
    await tx
      .update(purchases)
      .set({
        status: isFullRefund ? 'refunded' : 'succeeded', // Keep succeeded for partial refund
        updatedAt: new Date(),
      })
      .where(eq(purchases.id, purchase.id));

    // Create refund ledger entry
    await tx.insert(creditLedgerEntries).values({
      idempotencyKey,
      accountId: account.id,
      type: 'refund',
      amount: -actualDeduction,
      metadataJson: {
        paymentIntentId,
        refundAmount,
        originalCredits: purchase.creditsIssued,
        creditsDeducted: actualDeduction,
      },
    });

    // Update account balance
    await tx
      .update(creditAccounts)
      .set({
        balanceAvailable: account.balanceAvailable - actualDeduction,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, account.id));

    console.log(`Refund processed: deducted ${actualDeduction} credits for payment ${paymentIntentId}`);

    return { success: true, alreadyProcessed: false, creditsDeducted: actualDeduction };
  });
}

/**
 * Get user's purchase history
 */
export async function getUserPurchases(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{
  purchases: Array<{
    id: string;
    stripePaymentIntentId: string;
    amountFiat: number;
    currency: string;
    creditsIssued: number;
    status: string;
    createdAt: Date;
  }>;
  total: number;
}> {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  const userPurchases = await db
    .select()
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .orderBy(purchases.createdAt)
    .limit(limit)
    .offset(offset);

  // Get total count
  const [{ count }] = await db
    .select({ count: purchases.id })
    .from(purchases)
    .where(eq(purchases.userId, userId));

  return {
    purchases: userPurchases,
    total: userPurchases.length, // Simplified - would need proper count query
  };
}

/**
 * Handle checkout session completed
 */
export async function handleCheckoutSessionCompleted(
  session: StripeCheckoutSession
): Promise<void> {
  // If payment_intent is available, credits will be issued in payment_intent.succeeded
  // This event is mainly for tracking
  console.log(`Checkout session completed: ${session.id}`);

  if (session.payment_status === 'paid' && session.payment_intent && session.metadata.userId) {
    // In case payment_intent.succeeded doesn't fire, issue credits here
    await issueCreditsForPayment(session.payment_intent, {
      userId: session.metadata.userId,
      packageId: session.metadata.packageId,
      credits: session.metadata.credits,
    });
  }
}

/**
 * Handle payment intent succeeded
 */
export async function handlePaymentIntentSucceeded(
  paymentIntent: StripePaymentIntent
): Promise<void> {
  console.log(`Payment intent succeeded: ${paymentIntent.id}`);

  if (paymentIntent.metadata.userId) {
    await issueCreditsForPayment(paymentIntent.id, {
      userId: paymentIntent.metadata.userId,
      packageId: paymentIntent.metadata.packageId,
      credits: paymentIntent.metadata.credits,
    });
  }
}

/**
 * Handle charge refunded
 */
export async function handleChargeRefunded(charge: StripeCharge): Promise<void> {
  console.log(`Charge refunded: ${charge.id}`);

  if (charge.payment_intent && charge.amount_refunded > 0) {
    await handleRefund(charge.payment_intent, charge.amount_refunded);
  }
}

/**
 * Process webhook event
 */
export async function processWebhookEvent(event: StripeEvent): Promise<void> {
  console.log(`Processing Stripe webhook: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event.data.object as StripeCheckoutSession);
      break;

    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object as StripePaymentIntent);
      break;

    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as StripeCharge);
      break;

    default:
      console.log(`Unhandled webhook event type: ${event.type}`);
  }
}
