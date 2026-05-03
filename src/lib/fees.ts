/**
 * Instamenu v6 Fee Engine (server-side)
 *
 * Customer fee  : 5% of subtotal when subtotal < $50 | flat $5.00 when subtotal >= $50
 * Merchant fee  : member  → 5% of subtotal, capped $5
 *                 oneoff  → 10% of subtotal, capped $5
 * Loyalty amount: oneoff or member + subtotal <= $50 → 2.5%, capped $5
 *                 member + subtotal > $50            → 5.0%, capped $5
 *
 * Order total paid by customer: subtotal + customer_fee − loyalty_amount
 *
 * "pending" restaurants are treated as oneoff for all fee purposes.
 */

import type { FeeCalculation, MerchantType } from '@/types'

const CAP = 5.0

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctCapped(amount: number, rate: number, cap = CAP): number {
  return round2(Math.min(amount * rate, cap))
}

/**
 * Resolve effective merchant type — pending → oneoff for fee calculation.
 */
export function effectiveMerchantType(status: string): MerchantType {
  return status === 'member' ? 'member' : 'oneoff'
}

export function calculateFees(subtotal: number, merchantType: MerchantType): FeeCalculation {
  const isMember = merchantType === 'member'

  // ── Customer fee ──────────────────────────────────────────────────────────
  const customer_fee: number = subtotal < 50
    ? pctCapped(subtotal, 0.05)
    : 5.00

  // ── Merchant fee ─────────────────────────────────────────────────────────
  const merchantRate = isMember ? 0.05 : 0.10
  const merchant_fee = pctCapped(subtotal, merchantRate)

  // ── Loyalty amount ────────────────────────────────────────────────────────
  const loyaltyRate = isMember && subtotal > 50 ? 0.05 : 0.025
  const loyalty_amount = pctCapped(subtotal, loyaltyRate)

  // ── Customer total ────────────────────────────────────────────────────────
  const total = round2(subtotal + customer_fee - loyalty_amount)

  return {
    subtotal: round2(subtotal),
    customer_fee,
    merchant_fee,
    loyalty_amount,
    total,
    merchant_type: merchantType,
  }
}
