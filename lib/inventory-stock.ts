import type { InventoryStatus } from "@/lib/inventory";

/** Aggregated inventory counts for one product — safe metadata only. */
export type ProductStockSummary = {
  product_id: string;
  available_count: number;
  reserved_count: number;
  assigned_count: number;
  delivered_count: number;
  consumed_count: number;
  void_count: number;
  total_count: number;
};

export type StockLevel = "in_stock" | "low_stock" | "out_of_stock";

export type AdminStockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

export const LOW_STOCK_THRESHOLD = 5;

export type InventoryStockRow = {
  product_id: string;
  status: string;
  order_id: string | null;
};

export function emptyProductStockSummary(productId: string): ProductStockSummary {
  return {
    product_id: productId,
    available_count: 0,
    reserved_count: 0,
    assigned_count: 0,
    delivered_count: 0,
    consumed_count: 0,
    void_count: 0,
    total_count: 0,
  };
}

/** Sellable units: status available and not linked to an order. */
export function isSellableInventoryRow(row: {
  status: string;
  order_id?: string | null;
}): boolean {
  return row.status === "available" && !row.order_id;
}

export function countSellableFromSummary(summary: ProductStockSummary): number {
  return summary.available_count;
}

/**
 * Aggregate inventory rows into per-product summaries.
 * One inventory_items row = one account unit.
 */
export function aggregateProductStock(
  rows: InventoryStockRow[]
): Map<string, ProductStockSummary> {
  const map = new Map<string, ProductStockSummary>();

  for (const row of rows) {
    const productId = row.product_id;
    if (!productId) continue;

    let summary = map.get(productId);
    if (!summary) {
      summary = emptyProductStockSummary(productId);
      map.set(productId, summary);
    }

    summary.total_count += 1;

    const status = row.status as InventoryStatus;
    switch (status) {
      case "available":
        if (!row.order_id) {
          summary.available_count += 1;
        } else {
          summary.assigned_count += 1;
        }
        break;
      case "reserved":
        summary.reserved_count += 1;
        break;
      case "assigned":
        summary.assigned_count += 1;
        break;
      case "delivered":
        summary.delivered_count += 1;
        break;
      case "consumed":
        summary.consumed_count += 1;
        break;
      case "void":
        summary.void_count += 1;
        break;
      default:
        break;
    }
  }

  return map;
}

export function stockLevelFromAvailable(availableCount: number): StockLevel {
  if (availableCount <= 0) return "out_of_stock";
  if (availableCount <= LOW_STOCK_THRESHOLD) return "low_stock";
  return "in_stock";
}

export function stockLevelLabel(level: StockLevel): string {
  switch (level) {
    case "in_stock":
      return "In Stock";
    case "low_stock":
      return "Low Stock";
    case "out_of_stock":
      return "Out of Stock";
  }
}

export function matchesAdminStockFilter(
  filter: AdminStockFilter,
  availableCount: number
): boolean {
  if (filter === "all") return true;
  return stockLevelFromAvailable(availableCount) === filter;
}

/**
 * Customer-facing purchasability: listing published AND sellable inventory > 0.
 * Product status alone is not sufficient when inventory exists.
 */
export function isCustomerPurchasable(input: {
  productStatus: string | null | undefined;
  availableCount: number;
}): boolean {
  if (input.productStatus !== "available") return false;
  return input.availableCount > 0;
}

/**
 * Customer-facing stock display label.
 * Published product with zero sellable inventory shows Out of Stock.
 */
export function customerStockLabel(input: {
  productStatus: string | null | undefined;
  availableCount: number;
}): string {
  if (input.productStatus !== "available") {
    return "Sold Out";
  }
  if (input.availableCount <= 0) {
    return "Out of Stock";
  }
  if (input.availableCount === 1) {
    return "1 Account Available";
  }
  return `${input.availableCount} Accounts Available`;
}

export function formatAdminStockLine(availableCount: number): string {
  if (availableCount <= 0) return "0 available";
  if (availableCount === 1) return "1 available";
  return `${availableCount} available`;
}

export function inventoryManageHref(productId: string): string {
  const params = new URLSearchParams({
    product_id: productId,
    status: "available",
  });
  return `/admin/inventory?${params.toString()}`;
}
