"use client";

import PurchaseButtons from "@/components/PurchaseButtons";
import { formatPrice } from "@/lib/config";
import type { Product } from "@/lib/types";

type ProductPurchaseBarProps = {
  product: Product;
  gameName?: string | null;
  available: boolean;
};

export default function ProductPurchaseBar({
  product,
  gameName,
  available,
}: ProductPurchaseBarProps) {
  if (!available) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-slate-950/95 backdrop-blur-xl lg:hidden">
      <div className="mx-auto max-w-lg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Price
          </p>
          <p className="text-xl font-bold leading-none text-white">
            {formatPrice(Number(product.price), product.currency)}
          </p>
        </div>
        <PurchaseButtons
          product={product}
          gameName={gameName}
          available
          layout="stack"
          size="sm"
        />
      </div>
    </div>
  );
}
