"use client";

import {
  buildProductWhatsAppMessage,
  buildWhatsAppUrl,
  resolveShopeeUrl,
} from "@/lib/config";
import { ShopeeIcon, WhatsAppIcon } from "@/components/icons";

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
        Sold out
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
        ? "px-3 py-2.5 text-xs"
        : "px-4 py-3 text-sm";

  const wrap =
    layout === "row"
      ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
      : "flex flex-col gap-2.5";

  return (
    <div className={`${wrap} ${className}`}>
      <a
        href={shopeeHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`btn-shopee ${pad}`}
      >
        <ShopeeIcon />
        Buy on Shopee
      </a>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`btn-whatsapp ${pad}`}
      >
        <WhatsAppIcon />
        Chat on WhatsApp
      </a>
    </div>
  );
}
