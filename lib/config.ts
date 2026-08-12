export const SITE_NAME = "Gameslot";
export const SITE_TAGLINE = "Game Account Catalogue";
export const SITE_DESCRIPTION =
  "Browse available Genshin Impact, Honkai: Star Rail, Zenless Zone Zero and Wuthering Waves accounts. Contact us on WhatsApp or shop via Shopee.";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/** Digits only. Public business contact — safe for NEXT_PUBLIC_*. */
export const WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "60102431634"
).replace(/\D/g, "");

export const WHATSAPP_DISPLAY = "+60 10-243 1634";

export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

export const SHOPEE_STORE_URL = (
  process.env.NEXT_PUBLIC_SHOPEE_URL || "https://shopee.com.my/gameslot"
).trim();

/** @deprecated Use SHOPEE_STORE_URL */
export const SHOPEE_URL = SHOPEE_STORE_URL;

export function isWhatsAppConfigured(): boolean {
  return WHATSAPP_NUMBER.length >= 8;
}

export function isShopeeConfigured(): boolean {
  try {
    if (!SHOPEE_STORE_URL) return false;
    const url = new URL(SHOPEE_STORE_URL);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function formatPrice(amount: number, currency = "MYR"): string {
  const prefix = currency === "MYR" ? "RM" : currency;
  return `${prefix} ${Number(amount).toFixed(2)}`;
}

export function buildWhatsAppUrl(message?: string): string {
  if (!message || !message.trim()) {
    return WHATSAPP_URL;
  }
  return `${WHATSAPP_URL}?text=${encodeURIComponent(message.trim())}`;
}

export type WhatsAppProductInfo = {
  id: string;
  title: string;
  price: number;
  currency?: string;
  gameName?: string | null;
  server?: string | null;
  arLevel?: number | null;
  slug?: string | null;
};

/** Public product enquiry — never include credentials or private notes. */
export function buildProductWhatsAppMessage(product: WhatsAppProductInfo): string {
  const priceLabel = formatPrice(product.price, product.currency || "MYR");
  const lines = [
    "Hi, I'm interested in this account:",
    "",
    `Game: ${product.gameName?.trim() || "N/A"}`,
    `Account: ${product.title.trim()}`,
    `Price: ${priceLabel}`,
    `Product ID: ${product.id}`,
  ];

  if (product.server?.trim()) {
    lines.push(`Server: ${product.server.trim()}`);
  }
  if (product.arLevel != null && Number.isFinite(product.arLevel)) {
    lines.push(`AR / Level: ${product.arLevel}`);
  }

  lines.push("", "Is this account still available?");
  return lines.join("\n");
}

export function resolveShopeeUrl(productShopeeUrl?: string | null): string {
  const specific = (productShopeeUrl || "").trim();
  if (specific) {
    try {
      const url = new URL(specific);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return specific;
      }
    } catch {
      // fall through to store URL
    }
  }
  return SHOPEE_STORE_URL;
}

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "processing",
  "completed",
  "cancelled",
] as const;

export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
