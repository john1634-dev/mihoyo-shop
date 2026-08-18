export const SITE_NAME = "Baitu Games";
export const SITE_TAGLINE = "Premium Game Accounts";
export const SITE_DESCRIPTION =
  "Browse premium game accounts and game top up for Genshin Impact, Honkai: Star Rail, Zenless Zone Zero and Wuthering Waves. Pay securely by card through Stripe, or purchase via Shopee or WhatsApp.";

/** Canonical production origin — used when env is missing or invalid in production builds. */
export const PRODUCTION_SITE_URL = "https://www.baitugames.com";

const LOCAL_DEV_SITE_URL = "http://localhost:3000";

function isNonProductionHost(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("vercel.app")
  );
}

/**
 * Resolves the public site origin for sitemap, canonical URLs, metadataBase, and OG.
 * Production never falls back to localhost when NEXT_PUBLIC_SITE_URL is unset or invalid.
 */
export function resolveSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");

  if (fromEnv) {
    if (process.env.NODE_ENV === "production" && isNonProductionHost(fromEnv)) {
      return PRODUCTION_SITE_URL;
    }
    return fromEnv;
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_SITE_URL;
  }

  return LOCAL_DEV_SITE_URL;
}

export const SITE_URL = resolveSiteUrl();

export const WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "60102431634"
).replace(/\D/g, "");

export const WHATSAPP_DISPLAY = "+60 10-243 1634";

export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

export const SHOPEE_STORE_URL = (
  process.env.NEXT_PUBLIC_SHOPEE_URL || "https://shopee.com.my/gameslot"
).trim();

function resolveCurrencyCode(currency?: string | null): string {
  const code = currency?.trim().toUpperCase();
  return code || "MYR";
}

/** Display listing price in its own currency — no FX conversion. */
export function formatPrice(amount: number, currency = "MYR"): string {
  const code = resolveCurrencyCode(currency);
  const value = Number(amount);

  if (code === "MYR") {
    return `RM ${new Intl.NumberFormat("en-MY", {
      maximumFractionDigits: 0,
    }).format(value)}`;
  }

  if (code === "USD") {
    return `$${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}`;
  }

  return `${code} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

export function formatPriceDetailed(amount: number, currency = "MYR"): string {
  const code = resolveCurrencyCode(currency);
  const value = Number(amount);

  if (code === "MYR") {
    return `RM ${new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}`;
  }

  if (code === "USD") {
    return `$${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}`;
  }

  return `${code} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
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
  const productUrl =
    product.slug && product.slug.trim()
      ? `${SITE_URL.replace(/\/$/, "")}/product/${product.slug.trim()}`
      : null;

  const lines = [
    "Hi, I'm interested in this account:",
    "",
    product.title.trim(),
    "",
    `Game: ${product.gameName?.trim() || "N/A"}`,
    `Price: ${priceLabel}`,
  ];

  if (productUrl) {
    lines.push("", productUrl);
  }

  lines.push("", "Can you confirm availability?");
  return lines.join("\n");
}

/** Prefill for Top Up WhatsApp enquiry — no order/DB write. */
export function buildTopUpWhatsAppMessage(product: WhatsAppProductInfo): string {
  const priceLabel = formatPriceDetailed(product.price, product.currency || "MYR");
  const productUrl =
    product.slug && product.slug.trim()
      ? `${SITE_URL.replace(/\/$/, "")}/product/${product.slug.trim()}`
      : null;

  const lines = [
    "Hi BaituGames, I want to top up:",
    "",
    `Product: ${product.title.trim()}`,
    `Game: ${product.gameName?.trim() || "N/A"}`,
    `Price: ${priceLabel}`,
  ];

  if (productUrl) {
    lines.push("", productUrl);
  }

  lines.push(
    "",
    "UID:",
    "Server:",
    "",
    "Please confirm the package and payment."
  );
  return lines.join("\n");
}

export type FindAccountRequest = {
  game?: string;
  budget?: string;
  characterRequirement?: string;
  message?: string;
};

/** Prefill for "Find Me an Account" WhatsApp enquiry — no order/DB write. */
export function buildFindAccountWhatsAppMessage(
  request: FindAccountRequest
): string {
  const game = request.game?.trim() || "Not specified";
  const budget = request.budget?.trim() || "Not specified";
  const character =
    request.characterRequirement?.trim() || "Not specified";
  const additional = request.message?.trim();

  const lines = [
    "Hi BaituGames, I'm looking for:",
    `Game: ${game}`,
    `Budget: ${budget}`,
    `Character/Requirement: ${character}`,
  ];

  if (additional) {
    lines.push(`Additional requirements: ${additional}`);
  }

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
      // fall through
    }
  }
  return SHOPEE_STORE_URL;
}
