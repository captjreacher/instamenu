"use client";

import { calculateCustomerFee } from "@/types";

interface FeeBreakdownProps {
  subtotal: number;
  /** Optional: override loyalty credit display */
  loyaltyAmount?: number;
  className?: string;
  compact?: boolean;
}

export default function FeeBreakdown({
  subtotal,
  loyaltyAmount = 0,
  className = "",
  compact = false,
}: FeeBreakdownProps) {
  const serviceFee = calculateCustomerFee(subtotal);
  const total = subtotal + serviceFee - loyaltyAmount;

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(n);

  const feeDescription =
    subtotal < 50
      ? `5% of subtotal`
      : `Flat rate (order ≥ $50)`;

  if (compact) {
    return (
      <div className={`space-y-1 text-sm ${className}`}>
        <div className="flex justify-between text-gray-400">
          <span>Subtotal</span>
          <span>{fmtCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Service fee</span>
          <span>{fmtCurrency(serviceFee)}</span>
        </div>
        {loyaltyAmount > 0 && (
          <div className="flex justify-between text-brand-400">
            <span>Loyalty credit</span>
            <span>-{fmtCurrency(loyaltyAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-100 font-semibold border-t border-gray-800 pt-1 mt-1">
          <span>Total</span>
          <span>{fmtCurrency(total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 ${className}`}>
      {/* Subtotal */}
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Subtotal</span>
        <span className="text-gray-100 text-sm font-medium">{fmtCurrency(subtotal)}</span>
      </div>

      {/* Service fee */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-gray-400 text-sm">Service fee</span>
          <p className="text-xs text-gray-600 mt-0.5">{feeDescription}</p>
        </div>
        <span className="text-gray-100 text-sm font-medium shrink-0">{fmtCurrency(serviceFee)}</span>
      </div>

      {/* Loyalty credit (if any) */}
      {loyaltyAmount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-brand-400 text-sm">Loyalty credit</span>
          <span className="text-brand-400 text-sm font-medium">-{fmtCurrency(loyaltyAmount)}</span>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-800" />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="text-gray-100 font-semibold">Total</span>
        <span className="text-gray-100 font-bold text-lg">{fmtCurrency(total)}</span>
      </div>

      {/* Note */}
      <p className="text-xs text-gray-600 leading-relaxed">
        Service fee helps keep restaurant commissions low so more money goes to
        the kitchen.
      </p>
    </div>
  );
}
