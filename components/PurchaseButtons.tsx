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
  className?: string;
};

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
      <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.82c0 1.96.52 3.87 1.52 5.56L2 22l4.79-1.56a10.1 10.1 0 0 0 5.25 1.42h.01c5.46 0 9.89-4.4 9.89-9.82C21.94 6.4 17.5 2 12.04 2zm5.76 14.03c-.24.67-1.4 1.23-1.93 1.31-.5.08-1.12.11-1.81-.11-.42-.14-.95-.31-1.64-.61-2.88-1.25-4.76-4.15-4.9-4.34-.14-.19-1.17-1.56-1.17-2.98 0-1.42.74-2.12 1.01-2.41.26-.29.58-.36.77-.36h.55c.18 0 .42-.07.65.5.24.58.81 2 .88 2.14.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.31.38-.44.51-.14.14-.29.29-.12.56.17.28.74 1.22 1.59 1.98 1.1.97 2.02 1.27 2.3 1.41.29.14.48.21.55.33.07.12.07.7-.17 1.37z" />
    </svg>
  );
}

export default function PurchaseButtons({
  product,
  gameName,
  available,
  layout = "stack",
  size = "md",
  className = "",
}: PurchaseButtonsProps) {
  if (!available) {
    return (
      <div
        className={`rounded-xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-center text-sm font-semibold uppercase tracking-wider text-slate-500 ${className}`}
      >
        Sold
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
      ? "px-5 py-3.5 text-sm"
      : size === "sm"
        ? "px-3 py-2 text-xs"
        : "px-4 py-3 text-sm";

  const wrap =
    layout === "row"
      ? "grid grid-cols-2 gap-2"
      : "flex flex-col gap-2";

  return (
    <div className={`${wrap} ${className}`}>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 font-semibold text-white shadow-sm shadow-emerald-950/30 transition hover:bg-emerald-500 ${pad}`}
      >
        <WhatsAppIcon />
        Buy via WhatsApp
      </a>
      <a
        href={shopeeHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center justify-center rounded-xl border border-orange-500/50 bg-orange-500/10 font-semibold text-orange-200 transition hover:border-orange-400 hover:bg-orange-500/15 ${pad}`}
      >
        Buy via Shopee
      </a>
    </div>
  );
}
