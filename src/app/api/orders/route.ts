/**
 * POST /api/orders
 *
 * Creates a new order with a Stripe PaymentIntent.
 *
 * Request body (JSON):
 *   {
 *     restaurant_id:   string
 *     customer_name:   string
 *     customer_email:  string
 *     customer_phone?: string
 *     items:           CartItem[]   // { menu_item_id, name, price, quantity }
 *   }
 *
 * Fee engine (v6):
 *   Customer fee : 5% when subtotal < $50 | flat $5 when subtotal >= $50
 *   Merchant fee : member → 5% capped $5 | oneoff/pending → 10% capped $5
 *   Loyalty pool : member + subtotal > $50 → 5% capped $5 | otherwise 2.5% capped $5
 *   total        : subtotal + customer_fee − loyalty_amount  (what Stripe charges)
 *
 * Returns: { orderId: string, clientSecret: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, toCents } from '@/lib/stripe'
import { calculateFees, effectiveMerchantType } from '@/lib/fees'
import type { CartItem } from '@/types'

// ── Supabase admin client ─────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── Request body type + validation ───────────────────────────────────────────

interface OrderRequestBody {
  restaurant_id: string
  customer_name: string
  customer_email: string
  customer_phone?: string | null
  items: CartItem[]
}

function validateBody(body: unknown): body is OrderRequestBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  if (typeof b.restaurant_id !== 'string' || !b.restaurant_id) return false
  if (typeof b.customer_name !== 'string' || !b.customer_name.trim()) return false
  if (typeof b.customer_email !== 'string' || !b.customer_email.trim()) return false
  if (!Array.isArray(b.items) || b.items.length === 0) return false
  for (const item of b.items as CartItem[]) {
    if (typeof item.menu_item_id !== 'string' || !item.menu_item_id) return false
    if (typeof item.name !== 'string') return false
    if (typeof item.price !== 'number' || item.price < 0) return false
    if (typeof item.quantity !== 'number' || item.quantity < 1) return false
  }
  return true
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Parse & validate request body ─────────────────────────────────────
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!validateBody(body)) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          detail:
            'Required: restaurant_id (string), customer_name (string), ' +
            'customer_email (string), items (non-empty CartItem array)',
        },
        { status: 400 },
      )
    }

    const { restaurant_id, customer_name, customer_email, customer_phone, items } = body

    // ── 2. Fetch restaurant ───────────────────────────────────────────────────
    const supabase = getSupabase()

    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id, name, email, status')
      .eq('id', restaurant_id)
      .single()

    if (restaurantError?.code === 'PGRST116' || !restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }
    if (restaurantError) {
      console.error('[orders] Restaurant fetch error:', restaurantError)
      return NextResponse.json(
        { error: 'Failed to fetch restaurant', detail: restaurantError.message },
        { status: 502 },
      )
    }

    // ── 3. Calculate fees ─────────────────────────────────────────────────────
    // Sum price × quantity for all items (prices are dollar floats)
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

    // Treat 'pending' restaurants as 'oneoff' for fee purposes
    const merchantType = effectiveMerchantType(restaurant.status)
    const fees = calculateFees(subtotal, merchantType)

    // ── 4. Create Stripe PaymentIntent ────────────────────────────────────────
    // amount = subtotal + customer_fee − loyalty_amount (customer's total)
    let paymentIntent
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: toCents(fees.total),
        currency: 'usd',
        receipt_email: customer_email,
        metadata: {
          restaurant_id,
          restaurant_name: restaurant.name,
          customer_name,
          customer_email,
          merchant_type: merchantType,
        },
        automatic_payment_methods: { enabled: true },
      })
    } catch (err) {
      console.error('[orders] Stripe PaymentIntent creation error:', err)
      return NextResponse.json(
        { error: 'Failed to create payment intent', detail: String(err) },
        { status: 502 },
      )
    }

    // ── 5. Save order to Supabase ─────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        restaurant_id,
        customer_name,
        customer_email,
        customer_phone: customer_phone ?? null,
        items,                          // stored as JSONB
        subtotal: fees.subtotal,
        customer_fee: fees.customer_fee,
        merchant_fee: fees.merchant_fee,
        loyalty_amount: fees.loyalty_amount,
        total: fees.total,
        status: 'pending',
        stripe_payment_intent_id: paymentIntent.id,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('[orders] Order insert error:', orderError)
      // Best-effort cleanup: cancel the orphaned PaymentIntent
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id)
      } catch (cancelErr) {
        console.error('[orders] Failed to cancel orphaned PaymentIntent:', cancelErr)
      }
      return NextResponse.json(
        { error: 'Failed to save order', detail: orderError?.message },
        { status: 502 },
      )
    }

    // ── 6. Return CreateOrderResponse ─────────────────────────────────────────
    return NextResponse.json(
      {
        orderId: order.id,
        clientSecret: paymentIntent.client_secret,
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('[orders] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error', detail: String(err) }, { status: 500 })
  }
}
