/**
 * POST /api/orders/[id]/confirm
 *
 * Called by the client after Stripe payment succeeds (stripe.confirmPayment
 * resolves successfully on the frontend). This route:
 *   1. Fetches the order
 *   2. Updates its status to 'confirmed'
 *   3. Sends a notification email to the restaurant via Resend
 *
 * Idempotent: calling it on an already-confirmed order returns success.
 *
 * Returns: { success: true, order: Order }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resend, FROM_ADDRESS } from '@/lib/resend'
import type { Order, CartItem } from '@/types'

// ── Supabase admin client ─────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── Email template helpers ────────────────────────────────────────────────────

function fmt(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function buildEmailHtml(order: Order, restaurantName: string): string {
  const itemRows = (order.items as CartItem[])
    .map(
      (item) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${item.name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${item.quantity}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right">${fmt(item.price * item.quantity)}</td>
        </tr>`,
    )
    .join('\n')

  const loyaltyRow =
    order.loyalty_amount > 0
      ? `<tr>
           <td colspan="2" style="padding:4px 12px;color:#555">Loyalty credit</td>
           <td style="padding:4px 12px;text-align:right;color:#16a34a">−${fmt(order.loyalty_amount)}</td>
         </tr>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Instamenu Order</title></head>
<body style="font-family:system-ui,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <h1 style="font-size:22px;margin-bottom:4px">New order on Instamenu!</h1>
  <p style="color:#555;margin-top:0">Order <strong>#${order.id.slice(0, 8).toUpperCase()}</strong> received for <strong>${restaurantName}</strong></p>

  <hr style="border:none;border-top:1px solid #eee;margin:20px 0">

  <h2 style="font-size:15px;margin-bottom:8px">Customer details</h2>
  <p style="margin:3px 0"><strong>Name:</strong> ${order.customer_name}</p>
  ${order.customer_email ? `<p style="margin:3px 0"><strong>Email:</strong> ${order.customer_email}</p>` : ''}
  ${order.customer_phone ? `<p style="margin:3px 0"><strong>Phone:</strong> ${order.customer_phone}</p>` : ''}

  <h2 style="font-size:15px;margin-top:20px;margin-bottom:8px">Order items</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#f7f7f7">
        <th style="padding:8px 12px;text-align:left;font-weight:600">Item</th>
        <th style="padding:8px 12px;text-align:center;font-weight:600">Qty</th>
        <th style="padding:8px 12px;text-align:right;font-weight:600">Price</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <table style="width:100%;font-size:14px;margin-top:8px">
    <tr>
      <td colspan="2" style="padding:4px 12px;color:#555">Subtotal</td>
      <td style="padding:4px 12px;text-align:right">${fmt(order.subtotal)}</td>
    </tr>
    <tr>
      <td colspan="2" style="padding:4px 12px;color:#555">Customer service fee</td>
      <td style="padding:4px 12px;text-align:right">${fmt(order.customer_fee)}</td>
    </tr>
    ${loyaltyRow}
    <tr style="font-weight:700;font-size:15px">
      <td colspan="2" style="padding:8px 12px;border-top:2px solid #ddd">Total charged</td>
      <td style="padding:8px 12px;border-top:2px solid #ddd;text-align:right">${fmt(order.total)}</td>
    </tr>
  </table>

  <p style="font-size:12px;color:#aaa;margin-top:32px">
    Sent by <a href="https://instamenu.app" style="color:#aaa">Instamenu</a> · Order placed ${new Date(order.created_at).toLocaleString()}
  </p>
</body>
</html>`
}

function buildEmailText(order: Order, restaurantName: string): string {
  const lines = [
    `New Instamenu Order — #${order.id.slice(0, 8).toUpperCase()}`,
    `Restaurant: ${restaurantName}`,
    '',
    'Customer:',
    `  Name:  ${order.customer_name}`,
  ]
  if (order.customer_email) lines.push(`  Email: ${order.customer_email}`)
  if (order.customer_phone) lines.push(`  Phone: ${order.customer_phone}`)

  lines.push('', 'Items:')
  for (const item of order.items as CartItem[]) {
    lines.push(`  ${item.name} x${item.quantity}  ${fmt(item.price * item.quantity)}`)
  }

  lines.push(
    '',
    `Subtotal:               ${fmt(order.subtotal)}`,
    `Customer service fee:   ${fmt(order.customer_fee)}`,
  )
  if (order.loyalty_amount > 0) {
    lines.push(`Loyalty credit:        −${fmt(order.loyalty_amount)}`)
  }
  lines.push(`Total charged:          ${fmt(order.total)}`)

  return lines.join('\n')
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { id } = params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing order id parameter' }, { status: 400 })
  }

  try {
    const supabase = getSupabase()

    // ── 1. Fetch the order ──────────────────────────────────────────────────
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select(
        'id, restaurant_id, customer_name, customer_email, customer_phone, ' +
        'items, subtotal, customer_fee, merchant_fee, loyalty_amount, total, ' +
        'status, stripe_payment_intent_id, created_at',
      )
      .eq('id', id)
      .single()

    if (fetchError?.code === 'PGRST116' || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (fetchError) {
      console.error('[orders/confirm] Fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch order', detail: String(fetchError) },
        { status: 502 },
      )
    }

    // Idempotent: already confirmed → return success without re-sending email
    if (order.status === 'confirmed') {
      return NextResponse.json({ success: true, order: order as Order })
    }

    // Guard: cannot confirm a cancelled order
    if (order.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Cannot confirm a cancelled order' },
        { status: 409 },
      )
    }

    // ── 2. Update order status → 'confirmed' ────────────────────────────────
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({ status: 'confirmed' })
      .eq('id', id)
      .select(
        'id, restaurant_id, customer_name, customer_email, customer_phone, ' +
        'items, subtotal, customer_fee, merchant_fee, loyalty_amount, total, ' +
        'status, stripe_payment_intent_id, created_at',
      )
      .single()

    if (updateError || !updatedOrder) {
      console.error('[orders/confirm] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to confirm order', detail: updateError?.message },
        { status: 502 },
      )
    }

    // ── 3. Fetch restaurant name + email for notification ───────────────────
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('name, email')
      .eq('id', order.restaurant_id)
      .single()

    if (restaurantError || !restaurant) {
      // Non-fatal — order is confirmed; just skip the email
      console.warn('[orders/confirm] Could not fetch restaurant for notification:', restaurantError?.message)
      return NextResponse.json({ success: true, order: updatedOrder as Order })
    }

    // ── 4. Send restaurant notification email ───────────────────────────────
    if (restaurant.email) {
      try {
        const { error: emailError } = await resend.emails.send({
          from: FROM_ADDRESS,
          to: restaurant.email,
          subject: 'New order on Instamenu!',
          html: buildEmailHtml(updatedOrder as Order, restaurant.name),
          text: buildEmailText(updatedOrder as Order, restaurant.name),
        })

        if (emailError) {
          // Non-fatal: log but do not fail the response
          console.error('[orders/confirm] Resend email error:', emailError)
        }
      } catch (emailErr) {
        console.error('[orders/confirm] Resend threw unexpectedly:', emailErr)
      }
    } else {
      console.info(
        `[orders/confirm] Restaurant "${restaurant.name}" has no email address — skipping notification`,
      )
    }

    // ── 5. Return ───────────────────────────────────────────────────────────
    return NextResponse.json({ success: true, order: updatedOrder as Order })
  } catch (err) {
    console.error('[orders/confirm] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error', detail: String(err) }, { status: 500 })
  }
}
