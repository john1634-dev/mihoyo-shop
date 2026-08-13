import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import {
  aggregateProductStock,
  emptyProductStockSummary,
  type ProductStockSummary,
} from "@/lib/inventory-stock";
import { isValidUuid } from "@/lib/inventory";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/inventory/stock
 * Aggregated inventory counts — never credentials.
 *
 * Query:
 *   product_id  — single product UUID
 *   product_ids — comma-separated UUIDs
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  const url = new URL(request.url);
  const singleId = url.searchParams.get("product_id")?.trim() || "";
  const multiIds = url.searchParams.get("product_ids")?.trim() || "";

  const productIds: string[] = [];
  if (singleId) productIds.push(singleId);
  if (multiIds) {
    for (const part of multiIds.split(",")) {
      const id = part.trim();
      if (id) productIds.push(id);
    }
  }

  for (const id of productIds) {
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: "Invalid product id." }, { status: 400 });
    }
  }

  let query = admin.client
    .from("inventory_items")
    .select("product_id,status,order_id");

  if (productIds.length > 0) {
    query = query.in("product_id", productIds);
  }

  const { data, error } = await query;

  if (error) {
    logServerError("admin inventory stock GET", error);
    return NextResponse.json(
      { error: toUserError(error.message) },
      { status: 500 }
    );
  }

  const map = aggregateProductStock(
    (data || []) as { product_id: string; status: string; order_id: string | null }[]
  );

  if (singleId && productIds.length === 1) {
    const summary: ProductStockSummary =
      map.get(singleId) ?? emptyProductStockSummary(singleId);
    return NextResponse.json({ ok: true, summary });
  }

  const summaries: Record<string, ProductStockSummary> = {};
  if (productIds.length > 0) {
    for (const id of productIds) {
      summaries[id] = map.get(id) ?? emptyProductStockSummary(id);
    }
  } else {
    for (const [id, summary] of map.entries()) {
      summaries[id] = summary;
    }
  }

  return NextResponse.json({ ok: true, summaries });
}
