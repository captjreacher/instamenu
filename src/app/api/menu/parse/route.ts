/**
 * POST /api/menu/parse
 *
 * Accepts multipart/form-data:
 *   image              File     (required) — the menu photo
 *   restaurant_name    string   (optional, defaults to "Unnamed Restaurant")
 *   restaurant_phone   string   (optional)
 *   restaurant_email   string   (optional)
 *
 * Flow:
 *  1. Validate & read the uploaded image
 *  2. Upload to Supabase Storage bucket "menu-photos"
 *  3. Send image (base64) to Claude Vision for structured parsing
 *  4. Insert restaurant (status: 'pending') → menu → menu_items
 *  5. Return { slug, restaurantId } per ParseMenuResponse contract
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { generateSlug } from '@/lib/slug'
import type { ParsedMenuItem } from './types'

// ── Lazy-init clients (avoid module-level throws during edge cold starts) ─────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Missing env: ANTHROPIC_API_KEY')
  return new Anthropic({ apiKey })
}

// ── Vision prompt ─────────────────────────────────────────────────────────────

const PARSE_PROMPT = `Parse this restaurant menu photo carefully.
Extract every visible menu item and return a JSON object with this exact shape:

{
  "items": [
    {
      "name": "Item name",
      "description": "Short description if visible, otherwise null",
      "price": 12.99,
      "category": "Section name exactly as printed (e.g. Starters, Mains, Sides, Drinks, Desserts)"
    }
  ]
}

Rules:
- price must be a number with no currency symbols (e.g. 12.99 not "$12.99")
- If a price is not clearly visible for an item, skip that item entirely
- description should be null if not shown on the menu
- category should mirror the section headers printed in the menu
- Return ONLY the raw JSON — no markdown fences, no explanatory text`

// ── Allowed image MIME types accepted by Claude Vision ────────────────────────
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'])

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Parse multipart form ───────────────────────────────────────────────
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
    }

    const imageFile = form.get('image') as File | null
    if (!imageFile || typeof imageFile === 'string') {
      return NextResponse.json({ error: 'Missing required field: image (must be a file)' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.has(imageFile.type)) {
      return NextResponse.json(
        { error: `Unsupported image type "${imageFile.type}". Accepted: JPEG, PNG, WebP, GIF.` },
        { status: 415 },
      )
    }

    const restaurantName = ((form.get('restaurant_name') as string | null) ?? '').trim() || 'Unnamed Restaurant'
    const restaurantPhone = ((form.get('restaurant_phone') as string | null) ?? '').trim() || null
    const restaurantEmail = ((form.get('restaurant_email') as string | null) ?? '').trim() || null

    // ── 2. Upload image to Supabase Storage ───────────────────────────────────
    const supabase = getSupabase()
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer())

    const ext = imageFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const storagePath = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('menu-photos')
      .upload(storagePath, imageBuffer, { contentType: imageFile.type, upsert: false })

    if (uploadError) {
      console.error('[menu/parse] Storage upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload image to storage', detail: uploadError.message },
        { status: 502 },
      )
    }

    const { data: publicUrlData } = supabase.storage
      .from('menu-photos')
      .getPublicUrl(storagePath)

    const photoUrl = publicUrlData.publicUrl

    // ── 3. Call Claude Vision ─────────────────────────────────────────────────
    const anthropic = getAnthropic()
    const base64Image = imageBuffer.toString('base64')
    const mediaType = imageFile.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    let rawClaudeText: string
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64Image },
              },
              { type: 'text', text: PARSE_PROMPT },
            ],
          },
        ],
      })

      const block = message.content[0]
      if (block.type !== 'text') throw new Error('Unexpected Claude response content type')
      rawClaudeText = block.text
    } catch (err) {
      console.error('[menu/parse] Claude API error:', err)
      return NextResponse.json(
        { error: 'AI vision request failed', detail: String(err) },
        { status: 502 },
      )
    }

    // ── 4. Parse Claude's JSON ────────────────────────────────────────────────
    let parsedItems: ParsedMenuItem[] = []
    try {
      // Strip accidental markdown code fences
      const cleaned = rawClaudeText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim()
      const body = JSON.parse(cleaned)
      if (!Array.isArray(body?.items)) throw new Error('Response missing top-level "items" array')
      parsedItems = (body.items as ParsedMenuItem[]).filter(
        (item) => typeof item.name === 'string' && item.name && typeof item.price === 'number',
      )
    } catch (err) {
      console.error('[menu/parse] Failed to parse Claude JSON. Raw response:\n', rawClaudeText)
      return NextResponse.json(
        { error: 'AI returned unparseable menu data', detail: String(err) },
        { status: 422 },
      )
    }

    if (parsedItems.length === 0) {
      return NextResponse.json(
        { error: 'No priced menu items could be extracted from the image.' },
        { status: 422 },
      )
    }

    // ── 5. Insert restaurant ──────────────────────────────────────────────────
    const slug = generateSlug(restaurantName)

    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .insert({
        name: restaurantName,
        slug,
        phone: restaurantPhone,
        email: restaurantEmail,
        status: 'pending',
      })
      .select('id, slug')
      .single()

    if (restaurantError || !restaurant) {
      console.error('[menu/parse] Restaurant insert error:', restaurantError)
      return NextResponse.json(
        { error: 'Failed to create restaurant record', detail: restaurantError?.message },
        { status: 502 },
      )
    }

    // After error + null guards, Supabase's GenericStringError union is excluded
    const safeRestaurant = restaurant as unknown as { id: string; slug: string }

    // ── 6. Insert menu ────────────────────────────────────────────────────────
    const { data: menu, error: menuError } = await supabase
      .from('menus')
      .insert({
        restaurant_id: safeRestaurant.id,
        photo_url: photoUrl,
        parsed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (menuError || !menu) {
      console.error('[menu/parse] Menu insert error:', menuError)
      return NextResponse.json(
        { error: 'Failed to create menu record', detail: menuError?.message },
        { status: 502 },
      )
    }

    // After error + null guards, Supabase's GenericStringError union is excluded
    const safeMenu = menu as unknown as { id: string }

    // ── 7. Insert menu items ──────────────────────────────────────────────────
    const itemRows = parsedItems.map((item) => ({
      menu_id: safeMenu.id,
      name: item.name,
      description: item.description ?? null,
      price: item.price,
      category: item.category ?? 'Other',
      available: true,
    }))

    const { data: savedItems, error: itemsError } = await supabase
      .from('menu_items')
      .insert(itemRows)
      .select('id, name, description, price, category, available')

    if (itemsError || !savedItems) {
      console.error('[menu/parse] Menu items insert error:', itemsError)
      return NextResponse.json(
        { error: 'Failed to save menu items', detail: itemsError?.message },
        { status: 502 },
      )
    }

    // ── 8. Return ParseMenuResponse ───────────────────────────────────────────
    return NextResponse.json(
      { slug: safeRestaurant.slug, restaurantId: safeRestaurant.id },
      { status: 201 },
    )
  } catch (err) {
    console.error('[menu/parse] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error', detail: String(err) }, { status: 500 })
  }
}
