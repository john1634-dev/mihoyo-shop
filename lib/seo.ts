import { SITE_NAME, SITE_URL, formatPrice } from "@/lib/config";
import { getRegionLabel } from "@/lib/catalog-meta";

export const OG_IMAGE_PATH = "/opengraph-image";

export function absoluteUrl(path: string): string {
  const base = SITE_URL.replace(/\/$/, "");
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export type ProductSeoFields = {
  title: string;
  gameName?: string | null;
  server?: string | null;
  regionCode?: string | null;
  price?: number | null;
  currency?: string | null;
  description?: string | null;
};

/** Absolute document title for PDP / OG / Twitter. */
export function buildProductPageTitle(fields: ProductSeoFields): string {
  const parts: string[] = [];
  const title = fields.title?.trim() || "Game Account";
  parts.push(title);

  const game = fields.gameName?.trim();
  if (game) {
    parts.push(`${game} Account`);
  }

  const server = fields.server?.trim();
  if (server) {
    parts.push(`${server} Server`);
  } else {
    const regionLabel = getRegionLabel(fields.regionCode);
    if (regionLabel) {
      parts.push(`${regionLabel} Region`);
    }
  }

  parts.push(SITE_NAME);
  return parts.join(" | ");
}

/** Concise meta description — does not invent server/region. */
export function buildProductMetaDescription(fields: ProductSeoFields): string {
  const title = fields.title?.trim() || "this account";
  const game = fields.gameName?.trim();
  const server = fields.server?.trim();
  const regionLabel = getRegionLabel(fields.regionCode);
  const currency = fields.currency?.trim() || "MYR";
  const price =
    fields.price != null && Number.isFinite(Number(fields.price))
      ? formatPrice(Number(fields.price), currency)
      : null;

  const segments: string[] = [];

  if (game) {
    segments.push(`Buy ${title} — ${game} account at ${SITE_NAME}.`);
  } else {
    segments.push(`Buy ${title} at ${SITE_NAME}.`);
  }

  if (server) {
    segments.push(`Server: ${server}.`);
  }
  if (regionLabel) {
    segments.push(`Region: ${regionLabel}.`);
  }
  if (price) {
    segments.push(`Price ${price}.`);
  }

  segments.push(
    "Pay securely by card through Stripe, or purchase via Shopee or WhatsApp."
  );

  const built = segments.join(" ").replace(/\s+/g, " ").trim();
  if (built.length <= 160) return built;

  const listing = fields.description?.trim();
  if (listing) {
    return listing.length > 160 ? `${listing.slice(0, 157)}...` : listing;
  }

  return `${built.slice(0, 157)}...`;
}

export type BreadcrumbItem = {
  name: string;
  path: string;
};

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export type ProductJsonLdInput = {
  name: string;
  description: string;
  image?: string | null;
  url: string;
  price: number;
  currency?: string;
  available: boolean;
};

export function buildProductJsonLd(product: ProductJsonLdInput) {
  const price = Number(product.price);
  const safePrice = Number.isFinite(price) ? price : 0;
  const images = product.image?.trim()
    ? [product.image.trim()]
    : [absoluteUrl(OG_IMAGE_PATH)];

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: images,
    url: product.url,
    offers: {
      "@type": "Offer",
      price: safePrice,
      priceCurrency: (product.currency || "MYR").trim().toUpperCase() || "MYR",
      availability: product.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: product.url,
    },
  };
}

/** True when /products has any non-default filter/search/sort query. */
export function productsHasActiveFilters(params: {
  game?: string;
  q?: string;
  sort?: string;
  status?: string;
  region?: string;
  currency?: string;
  server?: string;
}): boolean {
  if (params.game?.trim()) return true;
  if (params.q?.trim()) return true;
  if (params.region?.trim()) return true;
  if (params.currency?.trim()) return true;
  if (params.server?.trim()) return true;
  const sort = params.sort?.trim();
  if (sort && sort !== "newest" && sort !== "featured" && sort !== "default") {
    return true;
  }
  const status = params.status?.trim();
  if (status && status !== "available") return true;
  return false;
}
