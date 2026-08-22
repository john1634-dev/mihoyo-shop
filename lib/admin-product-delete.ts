import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_BULK_DELETE_CONCURRENCY, ADMIN_BULK_DELETE_MAX } from "@/lib/admin-bulk-delete-config";
import { logServerError } from "@/lib/errors";
import {
  extractProductImageStoragePath,
  removeProductImageStoragePaths,
} from "@/lib/supplier/image-storage";

export { ADMIN_BULK_DELETE_MAX } from "@/lib/admin-bulk-delete-config";

export type AdminProductDeleteResult =
  | { deleted: true; productId: string; title: string }
  | {
      deleted: false;
      reason:
        | "not_found"
        | "has_order_history"
        | "delete_failed"
        | "not_confirmed"
        | "storage_cleanup_failed";
      message: string;
      productId?: string;
      hidden?: boolean;
      storageCleanupFailed?: boolean;
    };

type ProductRow = {
  id: string;
  title: string;
  status: string;
};

type DeleteDependentsResult =
  | { ok: true }
  | { ok: false; message: string; storageCleanupFailed: boolean };

async function loadProduct(
  client: SupabaseClient,
  productId: string
): Promise<ProductRow | null> {
  const { data, error } = await client
    .from("products")
    .select("id,title,status")
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  return (data as ProductRow | null) ?? null;
}

async function loadProductsByIds(
  client: SupabaseClient,
  productIds: string[]
): Promise<Map<string, ProductRow>> {
  if (productIds.length === 0) return new Map();

  const { data, error } = await client
    .from("products")
    .select("id,title,status")
    .in("id", productIds);

  if (error) throw error;

  const map = new Map<string, ProductRow>();
  for (const row of (data ?? []) as ProductRow[]) {
    map.set(row.id, row);
  }
  return map;
}

async function loadProductIdsWithOrderHistory(
  client: SupabaseClient,
  productIds: string[]
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();

  const { data, error } = await client
    .from("order_items")
    .select("product_id")
    .in("product_id", productIds);

  if (error) throw error;

  return new Set(
    ((data ?? []) as Array<{ product_id: string }>).map((row) => row.product_id)
  );
}

async function productHasOrderHistory(
  client: SupabaseClient,
  productId: string
): Promise<boolean> {
  const ids = await loadProductIdsWithOrderHistory(client, [productId]);
  return ids.has(productId);
}

async function hideProduct(
  client: SupabaseClient,
  product: ProductRow
): Promise<AdminProductDeleteResult> {
  const { error } = await client
    .from("products")
    .update({
      status: "hidden",
      updated_at: new Date().toISOString(),
    })
    .eq("id", product.id);

  if (error) {
    logServerError("admin product hide", error);
    return {
      deleted: false,
      reason: "delete_failed",
      message: "Could not hide this listing.",
      productId: product.id,
    };
  }

  return {
    deleted: false,
    reason: "has_order_history",
    message:
      "This listing has order history and was hidden instead of deleted.",
    productId: product.id,
    hidden: true,
  };
}

async function deleteProductDependents(
  client: SupabaseClient,
  productId: string
): Promise<DeleteDependentsResult> {
  const { data: images, error: imagesError } = await client
    .from("product_images")
    .select("image_url,image_path,original_image_url,processed_image_url")
    .eq("product_id", productId);

  if (imagesError) {
    return {
      ok: false,
      message: "Could not load product images.",
      storageCleanupFailed: false,
    };
  }

  const storagePaths = new Set<string>();
  for (const row of images ?? []) {
    for (const url of [
      row.image_url,
      row.original_image_url,
      row.processed_image_url,
    ]) {
      const path = extractProductImageStoragePath(url as string | null);
      if (path) storagePaths.add(path);
    }
    if (row.image_path) storagePaths.add(row.image_path as string);
  }

  if (storagePaths.size > 0) {
    try {
      await removeProductImageStoragePaths([...storagePaths]);
    } catch (error) {
      logServerError("admin product delete storage", error);
      return {
        ok: false,
        message:
          "Storage cleanup failed. Product was not deleted to avoid inconsistent state.",
        storageCleanupFailed: true,
      };
    }
  }

  const { error: imagesDeleteError } = await client
    .from("product_images")
    .delete()
    .eq("product_id", productId);

  if (imagesDeleteError) {
    return {
      ok: false,
      message: "Could not remove product image rows.",
      storageCleanupFailed: false,
    };
  }

  const { error: inventoryDeleteError } = await client
    .from("inventory_items")
    .delete()
    .eq("product_id", productId);

  if (inventoryDeleteError) {
    return {
      ok: false,
      message: "Could not remove product inventory.",
      storageCleanupFailed: false,
    };
  }

  return { ok: true };
}

/**
 * Safely delete an admin product listing.
 * Products with order history are hidden — never hard-deleted.
 */
export async function deleteAdminProduct(
  client: SupabaseClient,
  input: {
    productId: string;
    confirm: boolean;
    product?: ProductRow | null;
    hasOrderHistory?: boolean;
  }
): Promise<AdminProductDeleteResult> {
  if (input.confirm !== true) {
    return {
      deleted: false,
      reason: "not_confirmed",
      message: "Deletion requires confirm: true.",
    };
  }

  const productId = input.productId.trim();
  const product =
    input.product === undefined ? await loadProduct(client, productId) : input.product;

  if (!product) {
    return {
      deleted: false,
      reason: "not_found",
      message: "Product not found.",
      productId,
    };
  }

  const hasOrders =
    input.hasOrderHistory !== undefined
      ? input.hasOrderHistory
      : await productHasOrderHistory(client, productId);

  if (hasOrders) {
    return hideProduct(client, product);
  }

  const dependents = await deleteProductDependents(client, productId);
  if (!dependents.ok) {
    logServerError(
      "admin product delete dependents",
      new Error(dependents.message)
    );
    return {
      deleted: false,
      reason: dependents.storageCleanupFailed
        ? "storage_cleanup_failed"
        : "delete_failed",
      message: dependents.message,
      productId,
      storageCleanupFailed: dependents.storageCleanupFailed,
    };
  }

  const { error } = await client.from("products").delete().eq("id", productId);

  if (error) {
    logServerError("admin product delete", error);
    return {
      deleted: false,
      reason: "delete_failed",
      message: "Product deletion failed.",
      productId,
    };
  }

  return {
    deleted: true,
    productId,
    title: product.title,
  };
}

export type AdminProductBulkDeleteItemResult = AdminProductDeleteResult & {
  productId: string;
};

export type AdminProductBulkDeleteSummary = {
  requested: number;
  deleted: number;
  hidden: number;
  failed: number;
  notFound: number;
  results: AdminProductBulkDeleteItemResult[];
};

function summarizeBulkItem(outcome: AdminProductDeleteResult): {
  deleted: number;
  hidden: number;
  failed: number;
  notFound: number;
} {
  if (outcome.deleted) {
    return { deleted: 1, hidden: 0, failed: 0, notFound: 0 };
  }

  if (outcome.reason === "has_order_history" && outcome.hidden) {
    return { deleted: 0, hidden: 1, failed: 0, notFound: 0 };
  }

  if (outcome.reason === "not_found") {
    return { deleted: 0, hidden: 0, failed: 0, notFound: 1 };
  }

  return { deleted: 0, hidden: 0, failed: 1, notFound: 0 };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Safely delete multiple admin products with bounded concurrency.
 */
export async function bulkDeleteAdminProducts(
  client: SupabaseClient,
  input: { productIds: string[]; confirm: boolean }
): Promise<AdminProductBulkDeleteSummary> {
  const summary: AdminProductBulkDeleteSummary = {
    requested: 0,
    deleted: 0,
    hidden: 0,
    failed: 0,
    notFound: 0,
    results: [],
  };

  if (input.confirm !== true) {
    return summary;
  }

  const uniqueIds = [
    ...new Set(input.productIds.map((id) => id.trim()).filter(Boolean)),
  ].slice(0, ADMIN_BULK_DELETE_MAX);

  summary.requested = uniqueIds.length;
  if (uniqueIds.length === 0) {
    return summary;
  }

  const [productsById, orderHistoryIds] = await Promise.all([
    loadProductsByIds(client, uniqueIds),
    loadProductIdsWithOrderHistory(client, uniqueIds),
  ]);

  const outcomes = await mapWithConcurrency(
    uniqueIds,
    ADMIN_BULK_DELETE_CONCURRENCY,
    async (productId) =>
      deleteAdminProduct(client, {
        productId,
        confirm: true,
        product: productsById.get(productId) ?? null,
        hasOrderHistory: orderHistoryIds.has(productId),
      })
  );

  for (let index = 0; index < uniqueIds.length; index += 1) {
    const productId = uniqueIds[index];
    const outcome = outcomes[index];
    const item: AdminProductBulkDeleteItemResult = {
      ...outcome,
      productId: outcome.productId ?? productId,
    };
    summary.results.push(item);

    const counts = summarizeBulkItem(outcome);
    summary.deleted += counts.deleted;
    summary.hidden += counts.hidden;
    summary.failed += counts.failed;
    summary.notFound += counts.notFound;
  }

  return summary;
}
