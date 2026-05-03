/**
 * Generate a URL-safe slug from a restaurant name, appending a short random
 * suffix to avoid collisions without an extra DB round-trip.
 */
export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // strip non-alphanumeric (keep spaces/hyphens)
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .slice(0, 48);                   // cap length

  const suffix = Math.random().toString(36).slice(2, 7); // 5-char random
  return `${base}-${suffix}`;
}
