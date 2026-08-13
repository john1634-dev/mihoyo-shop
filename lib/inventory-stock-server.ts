import "server-only";

import {
  aggregateProductStock,
  emptyProductStockSummary,
  type InventoryStockRow,
  type ProductStockSummary,
} from "@/lib/inventory-stock";
import { getSupabaseService } from "@/lib/supabase-service";

const STOCK_SELECT = "product_id,status,order_id";

/**
 * Fetch aggregated stock for one or more products in a single query.
 * Never returns credentials.
 */
export async function fetchProductStockSummaries(input?: {
  productIds?: string[];
}): Promise<Map<string, ProductStockSummary>> {
  const service = getSupabaseService();

  let query = service.from("inventory_items").select(STOCK_SELECT);

  const productIds = input?.productIds?.filter(Boolean);
  if (productIds && productIds.length > 0) {
    query = query.in("product_id", productIds);
  }

  const { data, error } = await query;

  if (error) {
    if (/relation|schema cache|does not exist|PGRST/i.test(error.message)) {
      const empty = new Map<string, ProductStockSummary>();
      for (const id of productIds || []) {
        empty.set(id, emptyProductStockSummary(id));
      }
      return empty;
    }
    throw error;
  }

  const map = aggregateProductStock((data || []) as InventoryStockRow[]);

  if (productIds) {
    for (const id of productIds) {
      if (!map.has(id)) {
        map.set(id, emptyProductStockSummary(id));
      }
    }
  }

  return map;
}

export async function fetchProductStockSummary(
  productId: string
): Promise<ProductStockSummary> {
  const map = await fetchProductStockSummaries({ productIds: [productId] });
  return map.get(productId) ?? emptyProductStockSummary(productId);
}

export async function fetchSellableStockCount(productId: string): Promise<number> {
  const summary = await fetchProductStockSummary(productId);
  return summary.available_count;
}
