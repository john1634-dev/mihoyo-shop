import { SITE_NAME, SITE_URL } from "@/lib/config";

export const OG_IMAGE_PATH = "/opengraph-image";

export function absoluteUrl(path: string): string {
  const base = SITE_URL.replace(/\/$/, "");
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildProductPageTitle(
  productTitle: string,
  gameName?: string | null
): string {
  const parts = [productTitle.trim()];
  if (gameName?.trim()) {
    parts.push(gameName.trim());
  }
  parts.push(SITE_NAME);
  return parts.join(" | ");
}

export function buildProductMetaDescription(
  productTitle: string,
  gameName?: string | null,
  description?: string | null
): string {
  const trimmed = description?.trim();
  if (trimmed) {
    return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
  }

  const game = gameName?.trim() || "your favourite game";
  return `Buy ${productTitle.trim()} for ${game} at ${SITE_NAME}. View account details, images, price and availability.`;
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
      priceCurrency: product.currency || "MYR",
      availability: product.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: product.url,
    },
  };
}
