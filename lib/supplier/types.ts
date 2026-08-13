import type { SupplierSourceStatus } from "@/lib/supplier/status";

/** Known supplier identifiers — open text in DB; listed here for reference only. */
export const SUPPLIER_SOURCE_EXAMPLES = [
  "zinkgame",
  "supplier_a",
  "supplier_b",
  "manual",
] as const;

export type SupplierProductImage = {
  /** Public or supplier URL before import/processing. */
  url: string;
  sortOrder?: number;
  imageSource?: "manual" | "supplier" | "generated" | null;
  originalUrl?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Normalized supplier catalog item — adapter-agnostic.
 * ZinkGame and other suppliers map into this shape in a later phase.
 */
export type SupplierProduct = {
  source: string;
  externalProductId: string;
  externalProductUrl?: string | null;
  title: string;
  description?: string | null;
  price: number;
  currency: string;
  status: SupplierSourceStatus;
  images?: SupplierProductImage[];
  metadata?: Record<string, unknown>;
};

/** Fields persisted on `products` for supplier sync (admin/service only). */
export type ProductSupplierFields = {
  source?: string | null;
  source_product_id?: string | null;
  source_product_url?: string | null;
  source_status?: SupplierSourceStatus | string | null;
  source_price?: number | null;
  source_currency?: string | null;
  last_synced_at?: string | null;
  last_source_check_at?: string | null;
  sync_error?: string | null;
};

/** Fields persisted on `product_images` for image pipeline (admin/service only). */
export type ProductImagePipelineFields = {
  image_source?: "manual" | "supplier" | "generated" | null;
  processing_status?:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "skipped"
    | null;
  original_image_url?: string | null;
  processed_image_url?: string | null;
  processing_error?: string | null;
};
