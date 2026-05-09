/**
 * Supabase client helpers for Instamenu.
 *
 * Three export modes:
 *   createBrowserClient()  – singleton for Client Components (uses anon key)
 *   createServerClient()   – per-request client for Server Components / Route Handlers
 *                            (reads/writes cookies via next/headers)
 *   supabaseAdmin          – service-role client for trusted server-side operations
 *                            (bypasses RLS — never expose to the browser)
 */

import { createClient } from '@supabase/supabase-js'
import { createBrowserClient as _createBrowserClient } from '@supabase/ssr'

// ─── Environment validation ───────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL')
if (!SUPABASE_ANON_KEY) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY')

// ─── Browser client (Client Components) ──────────────────────────────────────
// Call once and cache the result — @supabase/ssr creates a singleton internally.

export function createBrowserClient() {
  return _createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
}

// ─── Server client (Server Components / Route Handlers / Middleware) ──────────
// Must be called inside a Next.js server context where cookies() is available.

export async function createServerClient() {
  // Dynamic import so this module can still be imported in browser bundles
  // without pulling in next/headers (which is server-only).
  const { createServerClient: _createServerClient } = await import('@supabase/ssr')
  const { cookies } = await import('next/headers')

  const cookieStore = cookies()

  return _createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // setAll can throw in Server Components (read-only context).
          // Safe to ignore — session refresh is best-effort here.
        }
      },
    },
  })
}

// ─── Admin / service-role client (server-side only) ──────────────────────────

if (typeof window !== 'undefined') {
  throw new Error(
    'supabaseAdmin must not be imported in browser bundles. ' +
    'Use createBrowserClient() for client-side Supabase access.',
  )
}

if (!SERVICE_ROLE_KEY) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')

export const supabaseAdmin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
