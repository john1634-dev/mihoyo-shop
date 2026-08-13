import type { SupplierProduct } from "@/lib/supplier/types";

/** Discovery item from a supplier listing page (title may be truncated). */
export type SupplierListingItem = {
  externalProductId: string;
  externalProductUrl: string;
  title?: string | null;
  coverImageUrl?: string | null;
  price?: number | null;
  currency?: string | null;
  category?: string | null;
};

export type SupplierListingPagination =
  | { kind: "none" }
  | { kind: "not_detected" }
  | { kind: "query"; param: string; page: number };

export type SupplierListingResult = {
  source: string;
  page: number;
  listingUrl: string;
  items: SupplierListingItem[];
  pagination: SupplierListingPagination;
  warnings: string[];
};

export interface SupplierAdapter {
  readonly source: string;
  getListingPage(page: number): Promise<SupplierListingResult>;
  getProduct(input: { productId?: string; url?: string }): Promise<SupplierProduct>;
}
