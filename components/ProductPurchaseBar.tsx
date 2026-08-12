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
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800/90 bg-slate-950/95 p-3 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div className="min-w-0 shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            Price
          </p>
          <p className="text-lg font-bold leading-none">
            {formatPrice(Number(product.price), product.currency)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <PurchaseButtons
            product={product}
            gameName={gameName}
            available
            layout="row"
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}
