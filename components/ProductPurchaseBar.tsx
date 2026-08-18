"use client";

import PurchaseButtons from "@/components/PurchaseButtons";
import { formatPrice } from "@/lib/config";
import type { Product } from "@/lib/types";

type ProductPurchaseBarProps = {
  product: Product;
  gameName?: string | null;
  available: boolean;
};

/**
 * Mobile-only sticky purchase bar (PDP).
 * Account listings: Shopee + WhatsApp. Top Up: WhatsApp only.
 * Card checkout stays in the desktop panel for account products.
 */
export default function ProductPurchaseBar({
  product,
  gameName,
  available,
}: ProductPurchaseBarProps) {
  if (!available) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white/95 shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto max-w-lg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mb-2 flex min-w-0 items-baseline justify-between gap-3">
          <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Price
          </p>
          <p className="min-w-0 truncate text-xl font-bold leading-none text-[var(--accent-strong)]">
            {formatPrice(Number(product.price), product.currency)}
          </p>
        </div>
        <PurchaseButtons
          product={product}
          gameName={gameName}
          available
          mode="marketplace"
          layout="row"
          size="sm"
          className="w-full min-w-0"
        />
      </div>
    </div>
  );
}
