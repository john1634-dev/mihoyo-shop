import "server-only";

import {
  emptyProductStockSummary,
  type ProductStockSummary,
} from "@/lib/inventory-stock";
import { fetchProductStockSummaries } from "@/lib/inventory-stock-server";

export async function fetchProductStockCountMap(
  productIds: string[]
): Promise<Record<string, number>> {
  if (productIds.length === 0) return {};

  const summaries = await fetchProductStockSummaries({ productIds });
  const map: Record<string, number> = {};
  for (const id of productIds) {
    map[id] = summaries.get(id)?.available_count ?? 0;
  }
  return map;
}

export async function fetchProductStockSummaryMap(
  productIds: string[]
): Promise<Record<string, ProductStockSummary>> {
  if (productIds.length === 0) return {};

  const summaries = await fetchProductStockSummaries({ productIds });
  const map: Record<string, ProductStockSummary> = {};
  for (const id of productIds) {
    map[id] = summaries.get(id) ?? emptyProductStockSummary(id);
  }
  return map;
}
