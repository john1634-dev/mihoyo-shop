import type { ProductType } from "@/lib/product-type";

export type Game = {
  id: string;
  name: string;
  slug: string;
  description: string | null;

  image_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  mobile_banner_url: string | null;

  is_active?: boolean;
  sort_order?: number;
};

export type Product = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  status: string;
  server: string | null;
  /** Listing region code (GLOBAL, ASIA, …). Null on legacy rows. */
  region_code?: string | null;
  ar_level: number | null;
  cover_image_url: string | null;
  game_id: string | null;
  created_at?: string;
  updated_at?: string;
  shopee_url?: string | null;
  /** ENDGAME_ACCOUNT | REROLL_ACCOUNT | TOP_UP. Defaults to ENDGAME_ACCOUNT. */
  product_type?: ProductType | null;
  supplier_cost?: number | null;
  supplier_name?: string | null;
  cost_vnd?: number | null;
  cost_myr?: number | null;
  vnd_myr_rate?: number | null;
  cost_currency?: string | null;
  cost_rate_updated_at?: string | null;
  /** Supplier identifier (e.g. zinkgame). NULL for legacy/manual listings. */
  source?: string | null;
  /** External product id from supplier catalog. */
  source_product_id?: string | null;
  /** Supplier product URL — admin/sync only. */
  source_product_url?: string | null;
  /** Supplier-side status — distinct from storefront `status`. */
  source_status?: string | null;
  /** Last known supplier list price — admin/sync only. */
  source_price?: number | null;
  source_currency?: string | null;
  last_synced_at?: string | null;
  last_source_check_at?: string | null;
  sync_error?: string | null;
};

export type AdminProduct = Product & {
  supplier_cost: number | null;
  supplier_name: string | null;
};

export type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  image_path: string;
  sort_order: number;
  /** manual | supplier | generated — NULL for legacy uploads. */
  image_source?: string | null;
  /** pending | processing | completed | failed | skipped */
  processing_status?: string | null;
  /** Supplier/original URL — admin/sync only. */
  original_image_url?: string | null;
  /** Processed asset URL — admin/sync only. */
  processed_image_url?: string | null;
  processing_error?: string | null;
};
