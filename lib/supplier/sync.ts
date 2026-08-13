import type { SupplierProduct, ProductSupplierFields } from "@/lib/supplier/types";
import {
  isSupplierCatalogActive,
  isSupplierDelisted,
  isSupplierSourceStatus,
  normalizeSupplierSourceStatus,
  type SupplierSourceStatus,
} from "@/lib/supplier/status";

export type SupplierSyncSnapshot = {
  source: string;
  sourceProductId: string;
  sourceStatus: SupplierSourceStatus | null;
  checkedAt: string;
  syncedAt?: string | null;
  syncError?: string | null;
};

/** Map normalized supplier product → DB supplier columns (no storefront status changes). */
export function supplierProductToDbFields(
  product: SupplierProduct,
  options: {
    checkedAt?: string;
    syncedAt?: string | null;
    syncError?: string | null;
  } = {}
): ProductSupplierFields {
  const checkedAt = options.checkedAt ?? new Date().toISOString();

  return {
    source: product.source.trim(),
    source_product_id: product.externalProductId.trim(),
    source_product_url: product.externalProductUrl?.trim() || null,
    source_status: normalizeSupplierSourceStatus(product.status),
    source_price: Number.isFinite(product.price) ? product.price : null,
    source_currency: product.currency?.trim().toUpperCase() || null,
    last_source_check_at: checkedAt,
    last_synced_at: options.syncedAt ?? checkedAt,
    sync_error: options.syncError ?? null,
  };
}

/** Whether a supplier row should be considered for future import/update jobs. */
export function isSupplierProductImportable(product: SupplierProduct): boolean {
  return (
    Boolean(product.source?.trim()) &&
    Boolean(product.externalProductId?.trim()) &&
    Boolean(product.title?.trim()) &&
    isSupplierCatalogActive(product.status)
  );
}

/** Whether supplier status suggests our listing may need to be hidden (future sync phase). */
export function shouldMarkStorefrontHiddenFromSupplier(
  sourceStatus: string | null | undefined
): boolean {
  return isSupplierDelisted(sourceStatus);
}

export function readSupplierSyncSnapshot(row: {
  source?: string | null;
  source_product_id?: string | null;
  source_status?: string | null;
  last_synced_at?: string | null;
  last_source_check_at?: string | null;
  sync_error?: string | null;
}): SupplierSyncSnapshot | null {
  if (!row.source?.trim() || !row.source_product_id?.trim()) {
    return null;
  }

  const rawStatus = row.source_status;
  const sourceStatus = isSupplierSourceStatus(rawStatus)
    ? rawStatus
    : normalizeSupplierSourceStatus(rawStatus);

  return {
    source: row.source.trim(),
    sourceProductId: row.source_product_id.trim(),
    sourceStatus,
    checkedAt: row.last_source_check_at ?? row.last_synced_at ?? "",
    syncedAt: row.last_synced_at ?? null,
    syncError: row.sync_error ?? null,
  };
}
