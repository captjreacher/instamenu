"use client";

import { useState, useMemo, useCallback } from "react";
import type { MenuItem, CartItem } from "@/types";
import { calculateCustomerFee } from "@/types";
import CartDrawer from "@/components/CartDrawer";
import FeeBreakdown from "@/components/FeeBreakdown";

// ─── Props ────────────────────────────────────────────────────────────────────

interface OrderingClientProps {
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  items: MenuItem[];
  categories: string[];
}

// ─── Checkout form ────────────────────────────────────────────────────────────

interface CheckoutForm {
  name: string;
  email: string;
  phone: string;
}

const EMPTY_FORM: CheckoutForm = { name: "", email: "", phone: "" };

type CheckoutStep = "idle" | "form" | "placing" | "success" | "error";

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrderingClient({
  restaurantId,
  items,
  categories,
}: OrderingClientProps) {
  // ── Cart state ─────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] ?? "");

  // ── Checkout state ─────────────────────────────────────────────────────────
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("idle");
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<CheckoutForm>>({});
  const [orderId, setOrderId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // ── Derived values ─────────────────────────────────────────────────────────
  const totalItems = useMemo(
    () => cartItems.reduce((sum, i) => sum + i.quantity, 0),
    [cartItems]
  );
  const subtotal = useMemo(
    () => cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [cartItems]
  );
  const serviceFee = calculateCustomerFee(subtotal);
  const total = subtotal + serviceFee;

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const cat of categories) map.set(cat, []);
    for (const item of items) {
      const cat = item.category ?? "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [items, categories]);

  // ── Cart operations ────────────────────────────────────────────────────────
  const addToCart = useCallback((item: MenuItem) => {
    setCartItems((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((menuItemId: string, delta: number) => {
    setCartItems((prev) => {
      const item = prev.find((c) => c.menu_item_id === menuItemId);
      if (!item) return prev;
      const next = item.quantity + delta;
      if (next <= 0) return prev.filter((c) => c.menu_item_id !== menuItemId);
      return prev.map((c) =>
        c.menu_item_id === menuItemId ? { ...c, quantity: next } : c
      );
    });
  }, []);

  const removeFromCart = useCallback((menuItemId: string) => {
    setCartItems((prev) => prev.filter((c) => c.menu_item_id !== menuItemId));
  }, []);

  function cartQty(itemId: string): number {
    return cartItems.find((c) => c.menu_item_id === itemId)?.quantity ?? 0;
  }

  // ── Checkout flow ──────────────────────────────────────────────────────────
  function validateForm(): boolean {
    const errors: Partial<CheckoutForm> = {};
    if (!form.name.trim()) errors.name = "Name is required.";
    if (!form.email.trim()) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = "Please enter a valid email.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handlePlaceOrder() {
    if (!validateForm()) return;

    setCheckoutStep("placing");
    setCheckoutError(null);

    try {
      // 1. Create order + Stripe PaymentIntent
      const createRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          customer_name: form.name.trim(),
          customer_email: form.email.trim(),
          customer_phone: form.phone.trim() || null,
          items: cartItems,
        }),
      });

      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Order creation failed (${createRes.status})`);
      }

      const { orderId: newOrderId } = await createRes.json();
      setOrderId(newOrderId);

      // 2. Confirm the order (MVP: skip Stripe Elements, confirm via API)
      const confirmRes = await fetch(`/api/orders/${newOrderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerEmail: form.email.trim() }),
      });

      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Payment confirmation failed (${confirmRes.status})`);
      }

      // 3. Success
      setCartItems([]);
      setForm(EMPTY_FORM);
      setCheckoutStep("success");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setCheckoutError(message);
      setCheckoutStep("error");
    }
  }

  // ── Formatter ──────────────────────────────────────────────────────────────
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(n);

  // ──────────────────────────────────────────────────────────────────────────
  // SUCCESS SCREEN
  // ──────────────────────────────────────────────────────────────────────────
  if (checkoutStep === "success") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-16">
        <div className="w-20 h-20 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center mb-6">
          <CheckCircleIcon className="w-10 h-10 text-brand-400" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-100 mb-3">
          Order placed!
        </h2>
        <p className="text-lg text-gray-400 max-w-sm leading-relaxed">
          The restaurant has been notified. You&apos;ll receive a confirmation
          at{" "}
          <span className="text-brand-400">{form.email || "your email"}</span>.
        </p>
        {orderId && (
          <p className="text-sm text-gray-600 mt-4">
            Order #{orderId.slice(-8).toUpperCase()}
          </p>
        )}
        <button
          onClick={() => {
            setCheckoutStep("idle");
            setIsCartOpen(false);
          }}
          className="mt-10 bg-gray-800 hover:bg-gray-700 text-gray-100 font-semibold px-6 py-3 rounded-lg transition"
        >
          Back to menu
        </button>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MAIN ORDERING LAYOUT
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Sticky category nav */}
      <div className="sticky top-[57px] z-30 bg-gray-950/90 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto py-3 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                document
                  .getElementById(`category-${slugifyCat(cat)}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={[
                "shrink-0 text-sm font-medium px-4 py-1.5 rounded-full transition-colors whitespace-nowrap",
                activeCategory === cat
                  ? "bg-brand-500 text-gray-950"
                  : "text-gray-400 hover:text-gray-100 hover:bg-gray-800",
              ].join(" ")}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main grid: menu left, order summary right on desktop */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-28 lg:pb-8">
        <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:items-start">

          {/* ── Left: Menu items ── */}
          <div className="space-y-12">
            {categories.map((cat) => {
              const catItems = itemsByCategory.get(cat) ?? [];
              if (catItems.length === 0) return null;

              return (
                <section
                  key={cat}
                  id={`category-${slugifyCat(cat)}`}
                  className="scroll-mt-28"
                >
                  <h3 className="text-xl font-bold text-gray-100 mb-4 pb-3 border-b border-gray-800">
                    {cat}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {catItems.map((item) => (
                      <MenuCard
                        key={item.id}
                        item={item}
                        qty={cartQty(item.id)}
                        onAdd={() => addToCart(item)}
                        onIncrease={() => updateQuantity(item.id, 1)}
                        onDecrease={() => updateQuantity(item.id, -1)}
                        fmt={fmt}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Edge case: no items */}
            {items.length === 0 && (
              <div className="text-center py-20 text-gray-500">
                <p className="text-lg font-medium">No menu items yet.</p>
                <p className="text-sm mt-1">Check back soon!</p>
              </div>
            )}
          </div>

          {/* ── Right: Desktop order summary (sticky) ── */}
          <div className="hidden lg:block sticky top-28 space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-gray-100 mb-4">
                Your order
              </h3>

              {cartItems.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  No items yet — add something from the menu!
                </p>
              ) : (
                <>
                  <ul className="space-y-3 mb-4">
                    {cartItems.map((ci) => (
                      <li key={ci.menu_item_id} className="flex items-center gap-3">
                        {/* Qty stepper */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => updateQuantity(ci.menu_item_id, -1)}
                            className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm flex items-center justify-center transition"
                            aria-label="Decrease"
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-sm text-gray-100">
                            {ci.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(ci.menu_item_id, 1)}
                            className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm flex items-center justify-center transition"
                            aria-label="Increase"
                          >
                            +
                          </button>
                        </div>
                        <span className="flex-1 text-sm text-gray-200 truncate">
                          {ci.name}
                        </span>
                        <span className="text-sm text-gray-400 shrink-0">
                          {fmt(ci.price * ci.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <FeeBreakdown subtotal={subtotal} compact />

                  <button
                    onClick={() => setCheckoutStep("form")}
                    className="mt-4 w-full bg-brand-500 hover:bg-brand-600 text-gray-950 font-bold py-3 rounded-lg transition-colors"
                  >
                    Checkout · {fmt(total)}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile: floating cart button ── */}
      {totalItems > 0 && (
        <div className="lg:hidden fixed bottom-6 left-0 right-0 z-40 flex justify-center px-4">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full max-w-sm bg-brand-500 hover:bg-brand-600 text-gray-950 font-bold py-4 rounded-xl shadow-lg shadow-brand-900/30 transition-colors flex items-center justify-between px-5"
          >
            <span className="bg-gray-950/20 rounded-lg w-7 h-7 flex items-center justify-center text-sm font-bold">
              {totalItems}
            </span>
            <span>View cart</span>
            <span>{fmt(total)}</span>
          </button>
        </div>
      )}

      {/* ── Cart drawer (mobile) ── */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={updateQuantity}
        onRemove={removeFromCart}
        onCheckout={() => {
          setIsCartOpen(false);
          setCheckoutStep("form");
        }}
      />

      {/* ── Checkout modal ── */}
      {(checkoutStep === "form" ||
        checkoutStep === "placing" ||
        checkoutStep === "error") && (
        <CheckoutModal
          step={checkoutStep}
          form={form}
          formErrors={formErrors}
          error={checkoutError}
          cartItems={cartItems}
          subtotal={subtotal}
          serviceFee={serviceFee}
          total={total}
          fmt={fmt}
          onChange={(field, value) => {
            setForm((prev) => ({ ...prev, [field]: value }));
            if (formErrors[field]) {
              setFormErrors((prev) => ({ ...prev, [field]: undefined }));
            }
          }}
          onSubmit={handlePlaceOrder}
          onClose={() => {
            setCheckoutStep("idle");
            setCheckoutError(null);
          }}
        />
      )}
    </>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function slugifyCat(cat: string): string {
  return cat.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ─── MenuCard ─────────────────────────────────────────────────────────────────

interface MenuCardProps {
  item: MenuItem;
  qty: number;
  onAdd: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
  fmt: (n: number) => string;
}

function MenuCard({ item, qty, onAdd, onIncrease, onDecrease, fmt }: MenuCardProps) {
  const unavailable = item.available === false;

  return (
    <div
      className={[
        "bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 transition-all duration-200",
        unavailable
          ? "border-gray-800 opacity-50"
          : "border-gray-800 hover:border-gray-700",
      ].join(" ")}
    >
      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-100 leading-snug">
            {item.name}
          </h4>
          <span className="text-sm font-bold text-brand-400 shrink-0 mt-0.5">
            {fmt(item.price)}
          </span>
        </div>
        {item.description && (
          <p className="text-xs text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}
        {unavailable && (
          <span className="mt-2 inline-block text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">
            Currently unavailable
          </span>
        )}
      </div>

      {/* Add / quantity controls */}
      {!unavailable && (
        <div className="flex justify-end">
          {qty === 0 ? (
            <button
              onClick={onAdd}
              className="text-sm bg-brand-500 hover:bg-brand-600 text-gray-950 font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              + Add
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onDecrease}
                className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 font-bold flex items-center justify-center transition"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="w-5 text-center text-sm font-semibold text-gray-100">
                {qty}
              </span>
              <button
                onClick={onIncrease}
                className="w-7 h-7 rounded-lg bg-brand-500 hover:bg-brand-600 text-gray-950 font-bold flex items-center justify-center transition"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CheckoutModal ────────────────────────────────────────────────────────────

interface CheckoutModalProps {
  step: "form" | "placing" | "error";
  form: CheckoutForm;
  formErrors: Partial<CheckoutForm>;
  error: string | null;
  cartItems: CartItem[];
  subtotal: number;
  serviceFee: number;
  total: number;
  fmt: (n: number) => string;
  onChange: (field: keyof CheckoutForm, value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function CheckoutModal({
  step,
  form,
  formErrors,
  error,
  cartItems,
  subtotal,
  total,
  fmt,
  onChange,
  onSubmit,
  onClose,
}: CheckoutModalProps) {
  const isLoading = step === "placing";

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => !isLoading && onClose()}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      >
        <div className="w-full sm:max-w-md bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800 shrink-0">
            <h2
              id="checkout-title"
              className="text-lg font-semibold text-gray-100"
            >
              Complete your order
            </h2>
            {!isLoading && (
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition"
                aria-label="Close checkout"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

            {/* Order summary */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Order summary
              </h3>
              <ul className="space-y-2 mb-4">
                {cartItems.map((ci) => (
                  <li
                    key={ci.menu_item_id}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-gray-400">
                      {ci.quantity}× {ci.name}
                    </span>
                    <span className="text-gray-200">
                      {fmt(ci.price * ci.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <FeeBreakdown subtotal={subtotal} compact />
            </div>

            <div className="border-t border-gray-800" />

            {/* Customer details */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Your details
              </h3>
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label
                    htmlFor="checkout-name"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    Full name <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="checkout-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => onChange("name", e.target.value)}
                    placeholder="Jane Smith"
                    disabled={isLoading}
                    autoComplete="name"
                    className={[
                      "w-full bg-gray-800 border rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500",
                      "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      formErrors.name ? "border-red-500" : "border-gray-700",
                    ].join(" ")}
                  />
                  {formErrors.name && (
                    <p className="mt-1 text-xs text-red-400">{formErrors.name}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="checkout-email"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => onChange("email", e.target.value)}
                    placeholder="jane@example.com"
                    disabled={isLoading}
                    autoComplete="email"
                    className={[
                      "w-full bg-gray-800 border rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500",
                      "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      formErrors.email ? "border-red-500" : "border-gray-700",
                    ].join(" ")}
                  />
                  {formErrors.email && (
                    <p className="mt-1 text-xs text-red-400">{formErrors.email}</p>
                  )}
                </div>

                {/* Phone (optional) */}
                <div>
                  <label
                    htmlFor="checkout-phone"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    Phone{" "}
                    <span className="text-gray-500 font-normal">(optional)</span>
                  </label>
                  <input
                    id="checkout-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => onChange("phone", e.target.value)}
                    placeholder="+1 555 000 0000"
                    disabled={isLoading}
                    autoComplete="tel"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Error */}
            {step === "error" && error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Footer / CTA */}
          <div className="px-6 py-5 border-t border-gray-800 shrink-0">
            <button
              onClick={onSubmit}
              disabled={isLoading}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-gray-950 font-bold py-3.5 rounded-lg text-base transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <SpinnerIcon className="w-5 h-5 animate-spin" />
                  Placing your order...
                </>
              ) : (
                `Place order · ${fmt(total)}`
              )}
            </button>
            <p className="text-center text-xs text-gray-500 mt-3">
              Payment is processed securely. No surprises.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
