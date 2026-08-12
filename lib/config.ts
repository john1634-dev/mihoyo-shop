export const SITE_NAME = "Gameslot";
export const SITE_TAGLINE = "Premium Game Account Marketplace";
export const SITE_DESCRIPTION =
  "Premium game accounts for Genshin Impact, Honkai: Star Rail, Zenless Zone Zero and more. Browse curated listings and purchase via WhatsApp or Shopee.";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "60102431634"
).replace(/\D/g, "");

export const WHATSAPP_DISPLAY = "+60 10-243 1634";

export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

export const SHOPEE_STORE_URL = (
  process.env.NEXT_PUBLIC_SHOPEE_URL || "https://shopee.com.my/gameslot"
).trim();

export function formatPrice(amount: number, currency = "MYR"): string {
  const prefix = currency === "MYR" ? "RM" : currency;
  return `${prefix} ${Number(amount).toFixed(0)}`;
}

export function formatPriceDetailed(amount: number, currency = "MYR"): string {
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

export function buildProductWhatsAppMessage(product: WhatsAppProductInfo): string {
  const priceLabel = formatPriceDetailed(product.price, product.currency || "MYR");

  return [
    "Hi, I'm interested in this account:",
    "",
    product.title.trim(),
    "",
    `Game: ${product.gameName?.trim() || "N/A"}`,
    `Price: ${priceLabel}`,
    "",
    "Is this account still available?",
  ].join("\n");
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
      // fall through
    }
  }
  return SHOPEE_STORE_URL;
}
