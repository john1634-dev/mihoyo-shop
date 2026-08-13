/**
 * Supplier-side listing status — distinct from storefront `products.status`.
 * Storefront: available | sold | hidden
 * Supplier:   active | sold | delisted | unavailable | error | unknown
 */

export const SUPPLIER_SOURCE_STATUSES = [
  "active",
  "sold",
  "delisted",
  "unavailable",
  "error",
  "unknown",
] as const;

export type SupplierSourceStatus = (typeof SUPPLIER_SOURCE_STATUSES)[number];

const STATUS_SET = new Set<string>(SUPPLIER_SOURCE_STATUSES);

export function isSupplierSourceStatus(
  value: string | null | undefined
): value is SupplierSourceStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

export function normalizeSupplierSourceStatus(
  value: string | null | undefined
): SupplierSourceStatus | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  return isSupplierSourceStatus(normalized) ? normalized : "unknown";
}

/** Supplier listing is considered purchasable/importable from catalog perspective. */
export function isSupplierCatalogActive(
  sourceStatus: string | null | undefined
): boolean {
  return normalizeSupplierSourceStatus(sourceStatus) === "active";
}

/** Supplier indicates the listing should not be offered anymore. */
export function isSupplierDelisted(
  sourceStatus: string | null | undefined
): boolean {
  const status = normalizeSupplierSourceStatus(sourceStatus);
  return (
    status === "delisted" ||
    status === "unavailable" ||
    status === "sold"
  );
}

export function supplierSourceStatusLabel(
  status: SupplierSourceStatus | null
): string {
  switch (status) {
    case "active":
      return "Active";
    case "sold":
      return "Sold (supplier)";
    case "delisted":
      return "Delisted";
    case "unavailable":
      return "Unavailable";
    case "error":
      return "Error";
    case "unknown":
      return "Unknown";
    default:
      return "Not synced";
  }
}
