/**
 * Resend client for Instamenu transactional emails.
 *
 * Import this ONLY in server-side code (API routes, Route Handlers, Server
 * Actions). Never expose the API key to the browser.
 *
 * Usage:
 *   import { resend, FROM_ADDRESS } from '@/lib/resend'
 *
 *   await resend.emails.send({
 *     from: FROM_ADDRESS,
 *     to: customer.email,
 *     subject: 'Your Instamenu order is confirmed',
 *     html: '<p>Order #1234 is confirmed.</p>',
 *   })
 */

import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  throw new Error('Missing env: RESEND_API_KEY')
}

/** Singleton Resend client. */
export const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Default "from" address used for all outbound emails.
 * Override per-send if different sender identity is needed (e.g. restaurant alias).
 */
export const FROM_ADDRESS = 'Instamenu <orders@instamenu.app>'

/**
 * Reply-to address for customer replies (routes to support inbox).
 */
export const REPLY_TO_ADDRESS = 'support@instamenu.app'

// ─── Email sending helpers ────────────────────────────────────────────────────

export interface OrderConfirmationParams {
  to: string
  customerName: string
  orderId: string
  restaurantName: string
  items: Array<{ name: string; quantity: number; price: number }>
  subtotal: number
  customerFee: number
  loyaltyAmount: number
  total: number
}

/**
 * Send an order confirmation email to the customer.
 * Returns the Resend message ID on success.
 */
export async function sendOrderConfirmation(
  params: OrderConfirmationParams,
): Promise<string> {
  const {
    to,
    customerName,
    orderId,
    restaurantName,
    items,
    subtotal,
    customerFee,
    loyaltyAmount,
    total,
  } = params

  const itemRows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:4px 8px">${item.name}</td>
          <td style="padding:4px 8px;text-align:center">${item.quantity}</td>
          <td style="padding:4px 8px;text-align:right">$${(item.price * item.quantity).toFixed(2)}</td>
        </tr>`,
    )
    .join('')

  const loyaltyRow =
    loyaltyAmount > 0
      ? `<tr>
           <td colspan="2" style="padding:4px 8px">Loyalty credit</td>
           <td style="padding:4px 8px;text-align:right;color:#16a34a">−$${loyaltyAmount.toFixed(2)}</td>
         </tr>`
      : ''

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family:system-ui,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="font-size:24px;margin-bottom:4px">Order confirmed</h1>
        <p style="color:#555;margin-top:0">Hi ${customerName}, your order from <strong>${restaurantName}</strong> has been received.</p>

        <p style="font-size:13px;color:#888">Order ID: ${orderId}</p>

        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead>
            <tr style="border-bottom:1px solid #e5e7eb">
              <th style="padding:4px 8px;text-align:left">Item</th>
              <th style="padding:4px 8px;text-align:center">Qty</th>
              <th style="padding:4px 8px;text-align:right">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
          <tfoot>
            <tr style="border-top:1px solid #e5e7eb">
              <td colspan="2" style="padding:4px 8px">Subtotal</td>
              <td style="padding:4px 8px;text-align:right">$${subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:4px 8px">Service fee</td>
              <td style="padding:4px 8px;text-align:right">$${customerFee.toFixed(2)}</td>
            </tr>
            ${loyaltyRow}
            <tr style="font-weight:600;border-top:2px solid #111">
              <td colspan="2" style="padding:8px 8px">Total charged</td>
              <td style="padding:8px 8px;text-align:right">$${total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <p style="margin-top:24px;font-size:13px;color:#555">
          You'll receive another email when your order is ready.<br>
          Questions? Reply to this email or contact us at support@instamenu.app.
        </p>
      </body>
    </html>
  `

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    replyTo: REPLY_TO_ADDRESS,
    to,
    subject: `Your order from ${restaurantName} is confirmed`,
    html,
  })

  if (error || !data?.id) {
    throw new Error(`Resend error: ${error?.message ?? 'Unknown error'}`)
  }

  return data.id
}
