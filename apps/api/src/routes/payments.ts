/**
 * Payment Routes
 *
 * Handles credit purchases through Stripe:
 * - POST /api/payments/stripe/checkout - Create checkout session
 * - POST /api/payments/stripe/webhook - Handle Stripe webhooks
 * - GET /api/payments/packages - List available credit packages
 * - GET /api/payments/history - Get user's purchase history
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyAccessToken } from '../lib/session';
import {
  CREDIT_PACKAGES,
  PackageId,
  createCheckoutSession,
  parseWebhookEvent,
  processWebhookEvent,
  getUserPurchases,
  isStripeConfigured,
  StripeNotConfiguredError,
  StripeWebhookError,
  PaymentError,
} from '../lib/stripe';
import { ValidationError, ForbiddenError } from '../lib/errors';

// Helper to get user ID from request
function getUserId(request: FastifyRequest): string {
  const user = (request as FastifyRequest & { user?: { sub: string } }).user;
  if (!user?.sub) {
    throw new ForbiddenError('Authentication required');
  }
  return user.sub;
}

// Request schemas
const checkoutRequestSchema = z.object({
  packageId: z.enum(['credits_100', 'credits_500', 'credits_1000', 'credits_5000']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function paymentRoutes(app: FastifyInstance) {
  /**
   * GET /api/payments/packages
   * List available credit packages
   */
  app.get('/api/payments/packages', async (request: FastifyRequest, reply: FastifyReply) => {
    const packages = Object.values(CREDIT_PACKAGES).map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      credits: pkg.credits,
      priceInCents: pkg.priceInCents,
      priceFormatted: `$${(pkg.priceInCents / 100).toFixed(2)}`,
      pricePerCredit: pkg.priceInCents / pkg.credits / 100,
    }));

    // Sort by credits ascending
    packages.sort((a, b) => a.credits - b.credits);

    return reply.status(200).send({
      data: packages,
      stripeConfigured: isStripeConfigured(),
    });
  });

  /**
   * POST /api/payments/stripe/checkout
   * Create a Stripe checkout session for credit purchase
   */
  app.post('/api/payments/stripe/checkout', async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify authentication
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const accessToken = authHeader.slice(7);
    const payload = await verifyAccessToken(app, accessToken);
    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    // Check if Stripe is configured
    if (!isStripeConfigured()) {
      return reply.status(503).send({
        error: 'stripe_not_configured',
        errorDescription: 'Stripe is not configured on this server',
      });
    }

    // Parse and validate request
    const parseResult = checkoutRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'validation_error',
        errorDescription: 'Invalid request body',
        issues: parseResult.error.issues,
      });
    }

    const { packageId, successUrl, cancelUrl } = parseResult.data;

    try {
      const { sessionId, url } = await createCheckoutSession(
        payload.sub,
        packageId as PackageId,
        { successUrl, cancelUrl }
      );

      return reply.status(200).send({
        data: {
          sessionId,
          url,
        },
      });
    } catch (error) {
      if (error instanceof PaymentError) {
        return reply.status(400).send({
          error: 'payment_error',
          errorDescription: error.message,
        });
      }
      throw error;
    }
  });

  /**
   * POST /api/payments/stripe/webhook
   * Handle Stripe webhook events
   *
   * Note: This endpoint needs raw body access for signature verification
   */
  app.post(
    '/api/payments/stripe/webhook',
    {
      config: {
        rawBody: true,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Check if Stripe is configured
      if (!isStripeConfigured()) {
        return reply.status(503).send({
          error: 'stripe_not_configured',
          errorDescription: 'Stripe is not configured on this server',
        });
      }

      // Get the raw body and signature
      const signature = request.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        return reply.status(400).send({
          error: 'missing_signature',
          errorDescription: 'Missing Stripe signature header',
        });
      }

      // Get raw body - Fastify may provide it as request.rawBody or request.body
      let rawBody: string;
      if (typeof request.body === 'string') {
        rawBody = request.body;
      } else if ((request as FastifyRequest & { rawBody?: string }).rawBody) {
        rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody!;
      } else {
        rawBody = JSON.stringify(request.body);
      }

      try {
        // Parse and verify the webhook
        const event = parseWebhookEvent(rawBody, signature);

        // Process the event
        await processWebhookEvent(event);

        // Always return 200 to acknowledge receipt
        return reply.status(200).send({ received: true });
      } catch (error) {
        if (error instanceof StripeWebhookError) {
          console.error('Webhook error:', error.message);
          return reply.status(400).send({
            error: 'webhook_error',
            errorDescription: error.message,
          });
        }

        if (error instanceof PaymentError) {
          console.error('Payment processing error:', error.message);
          // Still return 200 to prevent retries for processing errors
          return reply.status(200).send({
            received: true,
            warning: error.message,
          });
        }

        throw error;
      }
    }
  );

  /**
   * GET /api/payments/history
   * Get user's purchase history
   */
  app.get('/api/payments/history', async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify authentication
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'unauthorized',
        errorDescription: 'Access token required',
      });
    }

    const accessToken = authHeader.slice(7);
    const payload = await verifyAccessToken(app, accessToken);
    if (!payload) {
      return reply.status(401).send({
        error: 'invalid_token',
        errorDescription: 'Invalid or expired access token',
      });
    }

    // Parse query parameters
    const parseResult = historyQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'validation_error',
        errorDescription: 'Invalid query parameters',
        issues: parseResult.error.issues,
      });
    }

    const { limit, offset } = parseResult.data;

    try {
      const { purchases, total } = await getUserPurchases(payload.sub, { limit, offset });

      return reply.status(200).send({
        data: purchases.map((purchase) => ({
          id: purchase.id,
          amountFiat: purchase.amountFiat,
          amountFormatted: `$${(purchase.amountFiat / 100).toFixed(2)}`,
          currency: purchase.currency,
          creditsIssued: purchase.creditsIssued,
          status: purchase.status,
          createdAt: purchase.createdAt,
        })),
        pagination: {
          limit,
          offset,
          total,
        },
      });
    } catch (error) {
      if (error instanceof PaymentError) {
        return reply.status(400).send({
          error: 'payment_error',
          errorDescription: error.message,
        });
      }
      throw error;
    }
  });

  /**
   * GET /api/payments/stripe/status
   * Check Stripe configuration status
   */
  app.get('/api/payments/stripe/status', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      configured: isStripeConfigured(),
      testMode: env.NODE_ENV !== 'production',
    });
  });
}

// Import env for status check
import { env } from '../lib/env';
