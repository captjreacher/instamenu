// ─── Restaurant ──────────────────────────────────────────────────────────────

export type RestaurantStatus = 'pending' | 'member' | 'oneoff'

export interface Restaurant {
  id: string
  name: string
  /** URL-safe unique identifier used in public routes, e.g. /menu/my-restaurant */
  slug: string
  phone: string | null
  email: string | null
  address: string | null
  status: RestaurantStatus
  created_at: string
}

// ─── Menu ────────────────────────────────────────────────────────────────────

export interface Menu {
  id: string
  restaurant_id: string
  /** Public URL of the uploaded menu photo (Supabase Storage or external CDN) */
  photo_url: string
  /** ISO timestamp of when Claude Vision finished parsing the menu */
  parsed_at: string | null
}

// ─── Menu Item ───────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string
  menu_id: string
  name: string
  description: string | null
  /** Price in dollars (decimal), e.g. 12.99 */
  price: number
  category: string | null
  available: boolean
}

// ─── Cart ────────────────────────────────────────────────────────────────────

export interface CartItem {
  menu_item_id: string
  name: string
  /** Price at time of adding to cart (snapshot) */
  price: number
  quantity: number
}

// ─── Order ───────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled'

export interface Order {
  id: string
  restaurant_id: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  /** Ordered items snapshot stored as JSONB in Postgres */
  items: CartItem[]
  /** Sum of (item.price × item.quantity) for all items */
  subtotal: number
  /** Fee charged to the customer on top of subtotal */
  customer_fee: number
  /** Fee deducted from the merchant's payout */
  merchant_fee: number
  /** Loyalty credit to apply on this order (reduces customer_fee) */
  loyalty_amount: number
  /** subtotal + customer_fee − loyalty_amount */
  total: number
  status: OrderStatus
  stripe_payment_intent_id: string | null
  created_at: string
}

// ─── Fee Calculation ─────────────────────────────────────────────────────────

export type MerchantType = 'member' | 'oneoff'

export interface FeeCalculation {
  subtotal: number
  customer_fee: number
  merchant_fee: number
  loyalty_amount: number
  /** Amount the customer actually pays: subtotal + customer_fee − loyalty_amount */
  total: number
  merchant_type: MerchantType
}

// ─── API Response Shapes ─────────────────────────────────────────────────────

/** Returned by GET /api/restaurant/[slug] */
export interface RestaurantPageData {
  restaurant: Restaurant
  menu: Menu | null
  items: MenuItem[]
}

/** Returned by POST /api/menu/parse */
export interface ParseMenuResponse {
  slug: string
  restaurantId: string
}

/** Returned by POST /api/orders */
export interface CreateOrderResponse {
  orderId: string
  clientSecret: string
}

// ─── Client-side fee helper ───────────────────────────────────────────────────

/**
 * v6 step function (customer-facing fee):
 *   subtotal < $50  → 5% of subtotal (rounded to nearest cent)
 *   subtotal >= $50 → flat $5.00
 */
export function calculateCustomerFee(subtotal: number): number {
  if (subtotal < 50) {
    return Math.round(subtotal * 0.05 * 100) / 100
  }
  return 5
}
