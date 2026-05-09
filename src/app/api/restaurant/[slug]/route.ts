/**
 * GET /api/restaurant/[slug]
 *
 * Fetches a restaurant by its URL slug, together with its latest menu and
 * all available menu items.
 *
 * Returns:
 *   { restaurant: Restaurant, menu: Menu, items: MenuItem[] }
 *
 * Corresponds to the RestaurantPageData contract in src/types/index.ts,
 * with the addition of the raw menu record.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Restaurant, Menu, MenuItem } from '@/types'

// ── Supabase admin client ─────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } },
): Promise<NextResponse> {
  const { slug } = params

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'Missing slug parameter' }, { status: 400 })
  }

  try {
    const supabase = getSupabase()

    // ── 1. Fetch restaurant by slug ─────────────────────────────────────────
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id, name, slug, phone, email, address, status, created_at')
      .eq('slug', slug)
      .single()

    if (restaurantError) {
      // PostgREST returns PGRST116 when no rows match
      if (restaurantError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
      }
      console.error('[restaurant/slug] Fetch error:', restaurantError)
      return NextResponse.json(
        { error: 'Failed to fetch restaurant', detail: restaurantError.message },
        { status: 502 },
      )
    }

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    // After error + null guards, Supabase's GenericStringError union is excluded
    const safeRestaurant = restaurant as unknown as Restaurant

    // ── 2. Fetch latest menu for this restaurant ────────────────────────────
    const { data: menu, error: menuError } = await supabase
      .from('menus')
      .select('id, restaurant_id, photo_url, parsed_at')
      .eq('restaurant_id', safeRestaurant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (menuError) {
      if (menuError.code === 'PGRST116') {
        // Restaurant exists but has no menu yet
        return NextResponse.json(
          {
            restaurant: safeRestaurant,
            menu: null,
            items: [] as MenuItem[],
          },
          { status: 200 },
        )
      }
      console.error('[restaurant/slug] Menu fetch error:', menuError)
      return NextResponse.json(
        { error: 'Failed to fetch menu', detail: menuError.message },
        { status: 502 },
      )
    }

    // After error guards, Supabase's GenericStringError union is excluded
    const safeMenu = menu as unknown as Menu

    // ── 3. Fetch all menu items for this menu ───────────────────────────────
    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select('id, menu_id, name, description, price, category, available')
      .eq('menu_id', safeMenu.id)
      .eq('available', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (itemsError) {
      console.error('[restaurant/slug] Items fetch error:', itemsError)
      return NextResponse.json(
        { error: 'Failed to fetch menu items', detail: itemsError.message },
        { status: 502 },
      )
    }

    // ── 4. Return response ──────────────────────────────────────────────────
    return NextResponse.json({
      restaurant: safeRestaurant,
      menu: safeMenu,
      items: (items ?? []) as MenuItem[],
    })
  } catch (err) {
    console.error('[restaurant/slug] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error', detail: String(err) }, { status: 500 })
  }
}
