/**
 * Stripe server-side client for Instamenu.
 *
 * Import this ONLY in server-side code (API routes, Route Handlers, Server
 * Actions). Never import it in Client Components — use the publishable key
 * via @stripe/stripe-js on the browser instead.
 */

import Stripe from 'stripe'

const stripeKey = process.env.STRIPE_SECRET_KEY
if (!stripeKey) {
  throw new Error('Missing env: STRIPE_SECRET_KEY')
}

/**
 * Singleton Stripe client configured with:
 *  - API version pinned for stability
 *  - TypeScript strict mode types
 *  - App info header for Stripe dashboard attribution
 */
export const stripe = new Stripe(stripeKey, {
  apiVersion: '2024-06-20',
  typescript: true,
  appInfo: {
    name: 'Instamenu',
    version: '0.1.0',
  },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a dollar amount (e.g. 12.99) to Stripe's integer cent format (1299).
 * Stripe always expects amounts in the smallest currency unit.
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/**
 * Convert Stripe cents back to a dollar float (1299 → 12.99).
 */
export function fromCents(cents: number): number {
  return cents / 100
}

/**
 * Construct and verify a Stripe webhook event from a raw request body and
 * the Stripe-Signature header.
 *
 * @throws StripeSignatureVerificationError if the signature is invalid.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('Missing env: STRIPE_WEBHOOK_SECRET')
  return stripe.webhooks.constructEvent(payload, signature, secret)
}
