"use client";

import { useEffect, useRef } from "react";
import type { CartItem } from "@/types";
import { calculateCustomerFee } from "@/types";
import FeeBreakdown from "./FeeBreakdown";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (menuItemId: string, delta: number) => void;
  onRemove: (menuItemId: string) => void;
  onCheckout: () => void;
}

export default function CartDrawer({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemove,
  onCheckout,
}: CartDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Trap focus & handle Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    // Lock body scroll
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const subtotal = items.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );
  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(n);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className={[
          "fixed top-0 right-0 h-full w-full max-w-md bg-gray-900 border-l border-gray-800 z-50",
          "flex flex-col shadow-2xl",
          "transform transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <CartIcon className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-semibold text-gray-100">Your Cart</h2>
            {totalItems > 0 && (
              <span className="bg-brand-500 text-gray-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition"
            aria-label="Close cart"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {items.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
              <CartIcon className="w-8 h-8 text-gray-600" />
            </div>
            <div>
              <p className="text-gray-300 font-medium">Your cart is empty</p>
              <p className="text-gray-500 text-sm mt-1">
                Add items from the menu to get started.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Items list */}
            <ul className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {items.map((item) => (
                <li
                  key={item.menu_item_id}
                  className="flex items-start gap-4 bg-gray-800/50 rounded-xl p-3"
                >
                  {/* Item info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-100 truncate">
                      {item.name}
                    </p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {fmt(item.price)} each
                    </p>
                    <p className="text-sm font-semibold text-brand-400 mt-1">
                      {fmt(item.price * item.quantity)}
                    </p>
                  </div>

                  {/* Qty controls */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onUpdateQuantity(item.menu_item_id, -1)}
                        className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center text-base font-bold transition"
                        aria-label={`Decrease quantity of ${item.name}`}
                      >
                        −
                      </button>
                      <span className="w-7 text-center text-sm font-semibold text-gray-100">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(item.menu_item_id, 1)}
                        className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center text-base font-bold transition"
                        aria-label={`Increase quantity of ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => onRemove(item.menu_item_id)}
                      className="text-xs text-gray-500 hover:text-red-400 transition flex items-center gap-1"
                      aria-label={`Remove ${item.name} from cart`}
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Fee breakdown + checkout */}
            <div className="px-6 pb-6 pt-4 border-t border-gray-800 shrink-0 space-y-4">
              <FeeBreakdown subtotal={subtotal} compact />

              <button
                onClick={onCheckout}
                className="w-full bg-brand-500 hover:bg-brand-600 text-gray-950 font-bold py-3.5 rounded-lg text-base transition-colors duration-200 flex items-center justify-center gap-2"
              >
                Checkout · {fmt(subtotal + calculateCustomerFee(subtotal))}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.836l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}
