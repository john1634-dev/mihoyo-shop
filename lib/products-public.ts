import type { Product } from "@/lib/types";

/** Fields safe for public product queries — never include cost, supplier, or sync fields. */
export const PUBLIC_PRODUCT_SELECT =
  "id,title,slug,description,price,currency,status,server,region_code,ar_level,cover_image_url,game_id,created_at";

/** Fallback select when `region_code` column is not yet migrated. */
export const PUBLIC_PRODUCT_SELECT_LEGACY =
  "id,title,slug,description,price,currency,status,server,ar_level,cover_image_url,game_id,created_at";

/**
 * Storefront-safe product_images columns only.
 * Excludes image_source, processing_*, original/processed URLs, processing_error.
 */
export const PUBLIC_PRODUCT_IMAGE_SELECT =
  "id,product_id,image_url,image_path,sort_order";

/** Internal supplier/sync columns — must never appear in PUBLIC_* selects. */
export const SUPPLIER_INTERNAL_PRODUCT_FIELDS = [
  "source",
  "source_product_id",
  "source_product_url",
  "source_status",
  "source_price",
  "source_currency",
  "last_synced_at",
  "last_source_check_at",
  "sync_error",
] as const;

const NEW_PRODUCT_DAYS = 7;
const RECOMMENDED_LIMIT = 8;
const JUST_ADDED_LIMIT = 8;

export type ProductBadge = "NEW" | "SOLD_OUT";

/** Higher score = more complete listing (not popularity or price). */
function productListingScore(product: Product): number {
  let score = 0;
  if (product.cover_image_url?.trim()) score += 2;
  if (product.description?.trim()) score += 1;
  if (product.server?.trim()) score += 0.5;
  if (product.ar_level != null) score += 0.5;
  return score;
}

function sortAvailableByRecommended(products: Product[]): Product[] {
  return getAvailableProducts(products).sort((a, b) => {
    const scoreDiff = productListingScore(b) - productListingScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return (
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime()
    );
  });
}

export function isNewProduct(product: Product, now = Date.now()): boolean {
  if (!product.created_at) return false;
  const created = new Date(product.created_at).getTime();
  if (Number.isNaN(created)) return false;
  return now - created <= NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
}

export function getAvailableProducts(products: Product[]): Product[] {
  return products.filter((product) => product.status === "available");
}

/**
 * Recommended listings: available products with the most complete data,
 * then newest first. Not curated/editorial — based on listing completeness only.
 */
export function getRecommendedProducts(products: Product[]): Product[] {
  return sortAvailableByRecommended(products).slice(0, RECOMMENDED_LIMIT);
}

export function getRecommendedProductIds(products: Product[]): Set<string> {
  return new Set(getRecommendedProducts(products).map((product) => product.id));
}

/** Newest available listings, excluding those already shown as recommended. */
export function getJustAddedProducts(
  products: Product[],
  excludeIds: Set<string> = new Set()
): Product[] {
  return getAvailableProducts(products)
    .filter((product) => !excludeIds.has(product.id))
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    )
    .slice(0, JUST_ADDED_LIMIT);
}

export function getProductBadges(
  product: Product,
  availableStock?: number,
  inventoryManaged = false
): ProductBadge[] {
  const badges: ProductBadge[] = [];

  const outOfStock =
    product.status !== "available" ||
    (inventoryManaged && (availableStock ?? 0) <= 0);

  if (outOfStock) {
    badges.push("SOLD_OUT");
    return badges;
  }

  if (isNewProduct(product)) {
    badges.push("NEW");
  }

  return badges;
}
