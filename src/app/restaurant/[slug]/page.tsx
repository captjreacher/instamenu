import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { RestaurantPageData } from "@/types";
import OrderingClient from "./OrderingClient";

interface PageProps {
  params: { slug: string };
}

async function getRestaurantData(slug: string): Promise<RestaurantPageData | null> {
  try {
    // Build absolute URL for server-side fetch in Next.js App Router
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const res = await fetch(`${baseUrl}/api/restaurant/${slug}`, {
      next: { revalidate: 60 }, // ISR: revalidate every 60 s
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch restaurant: ${res.status}`);

    return res.json() as Promise<RestaurantPageData>;
  } catch (err) {
    console.error("getRestaurantData error:", err);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await getRestaurantData(params.slug);
  if (!data) return { title: "Restaurant not found | Instamenu" };

  return {
    title: `${data.restaurant.name} | Instamenu`,
    description: `Order online from ${data.restaurant.name} — powered by Instamenu.`,
    openGraph: {
      title: data.restaurant.name,
      description: `Order online from ${data.restaurant.name}.`,
    },
  };
}

/** Derive an ordered, de-duplicated list of categories from menu items. */
function deriveCategories(items: RestaurantPageData["items"]): string[] {
  const seen = new Set<string>();
  const cats: string[] = [];
  for (const item of items) {
    const cat = item.category ?? "Other";
    if (!seen.has(cat)) {
      seen.add(cat);
      cats.push(cat);
    }
  }
  return cats;
}

export default async function RestaurantPage({ params }: PageProps) {
  const data = await getRestaurantData(params.slug);

  if (!data) notFound();

  const { restaurant, items } = data;
  const categories = deriveCategories(items);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* ── Top nav ── */}
      <nav className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a
            href="/"
            className="text-sm font-semibold tracking-tight text-gray-100 hover:text-brand-400 transition-colors"
          >
            Insta<span className="text-brand-400">menu</span>
          </a>
          <span className="text-xs text-gray-500 hidden sm:block">
            Powered by Instamenu · No commission ordering
          </span>
        </div>
      </nav>

      {/* ── Restaurant hero ── */}
      <header className="border-b border-gray-800 bg-gray-900/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Initials avatar */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
              <span className="text-2xl sm:text-3xl font-extrabold text-brand-400">
                {restaurant.name.charAt(0).toUpperCase()}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-100 tracking-tight">
                {restaurant.name}
              </h1>

              <div className="flex flex-wrap gap-3 mt-2">
                {/* Open badge */}
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                  Open now
                </span>

                {/* Item / category count */}
                <span className="text-xs text-gray-500">
                  {items.length} item{items.length !== 1 ? "s" : ""} across{" "}
                  {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
                </span>

                {/* Phone */}
                {restaurant.phone && (
                  <a
                    href={`tel:${restaurant.phone}`}
                    className="text-xs text-gray-400 hover:text-brand-400 transition-colors"
                  >
                    {restaurant.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Ordering client (interactive) ── */}
      <OrderingClient
        restaurantId={restaurant.id}
        restaurantSlug={restaurant.slug}
        restaurantName={restaurant.name}
        items={items}
        categories={categories}
      />

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800 mt-24 px-4 sm:px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
          <span>
            Ordering powered by{" "}
            <a href="/" className="text-gray-500 hover:text-brand-400 transition-colors">
              Instamenu
            </a>
          </span>
          <span>No per-order commissions · Direct to restaurant</span>
        </div>
      </footer>
    </div>
  );
}
