export const SITE_NAME = "Mihoyo Shop";
export const SITE_TAGLINE = "Premium Game Account Store";
export const SITE_DESCRIPTION =
  "Buy verified Genshin Impact, Honkai: Star Rail, Zenless Zone Zero and Wuthering Waves accounts in Malaysia.";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/** Store WhatsApp number digits, e.g. 60123456789 — set in env, never hardcode real numbers in commits. */
export const WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || ""
).replace(/\D/g, "");

export const SHOPEE_URL = (process.env.NEXT_PUBLIC_SHOPEE_URL || "").trim();

export function isWhatsAppConfigured(): boolean {
  return WHATSAPP_NUMBER.length >= 8;
}

export function isShopeeConfigured(): boolean {
  try {
    if (!SHOPEE_URL) return false;
    const url = new URL(SHOPEE_URL);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function formatPrice(amount: number, currency = "MYR"): string {
  const prefix = currency === "MYR" ? "RM" : currency;
  return `${prefix} ${Number(amount).toFixed(2)}`;
}

export function buildWhatsAppUrl(message: string): string | null {
  if (!isWhatsAppConfigured()) {
    return null;
  }

  const encoded = encodeURIComponent(message);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
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
