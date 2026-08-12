"use client";

import {
  buildProductWhatsAppMessage,
  buildWhatsAppUrl,
  resolveShopeeUrl,
} from "@/lib/config";

type PurchaseButtonsProps = {
  product: {
    id: string;
    title: string;
    price: number;
    currency?: string;
    server?: string | null;
    ar_level?: number | null;
    slug?: string | null;
    shopee_url?: string | null;
  };
  gameName?: string | null;
  available: boolean;
  layout?: "stack" | "row";
  size?: "sm" | "md" | "lg";
};

export default function PurchaseButtons({
  product,
  gameName,
  available,
  layout = "stack",
  size = "md",
}: PurchaseButtonsProps) {
  if (!available) {
    return (
      <div
        className={
          size === "lg"
            ? "rounded-xl border border-slate-700 bg-slate-900 px-6 py-4 text-center text-sm font-semibold uppercase tracking-wide text-slate-400"
            : "rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-slate-400"
        }
      >
        Sold Out
      </div>
    );
  }

  const whatsappHref = buildWhatsAppUrl(
    buildProductWhatsAppMessage({
      id: product.id,
      title: product.title,
      price: Number(product.price),
      currency: product.currency || "MYR",
      gameName,
      server: product.server,
      arLevel: product.ar_level,
      slug: product.slug,
    })
  );

  const shopeeHref = resolveShopeeUrl(product.shopee_url);

  const pad =
    size === "lg"
      ? "px-6 py-4 text-base"
      : size === "sm"
        ? "px-3 py-2.5 text-xs"
        : "px-4 py-3 text-sm";

  const wrap =
    layout === "row"
      ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
      : "flex flex-col gap-2";

  return (
    <div className={wrap}>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center justify-center rounded-xl bg-emerald-600 font-semibold text-white transition hover:bg-emerald-500 ${pad}`}
      >
        Buy via WhatsApp
      </a>
      <a
        href={shopeeHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center justify-center rounded-xl border border-orange-500/60 bg-orange-500/10 font-semibold text-orange-300 transition hover:border-orange-400 hover:bg-orange-500/20 ${pad}`}
      >
        Buy via Shopee
      </a>
    </div>
  );
}
