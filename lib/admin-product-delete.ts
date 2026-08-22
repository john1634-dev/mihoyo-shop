import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/errors";
import {
  extractProductImageStoragePath,
  removeProductImageStoragePaths,
} from "@/lib/supplier/image-storage";

export type AdminProductDeleteResult =
  | { deleted: true; productId: string; title: string }
  | {
      deleted: false;
      reason:
        | "not_found"
        | "has_order_history"
        | "delete_failed"
        | "not_confirmed";
      message: string;
      productId?: string;
      hidden?: boolean;
    };

type ProductRow = {
  id: string;
  title: string;
  status: string;
};

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

async function productHasOrderHistory(
  client: SupabaseClient,
  productId: string
): Promise<boolean> {
  const { count, error } = await client
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  if (error) throw error;
  return (count ?? 0) > 0;
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
): Promise<void> {
  const { data: images, error: imagesError } = await client
    .from("product_images")
    .select("image_url,image_path,original_image_url,processed_image_url")
    .eq("product_id", productId);

  if (imagesError) throw imagesError;

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
    }
  }

  const { error: imagesDeleteError } = await client
    .from("product_images")
    .delete()
    .eq("product_id", productId);

  if (imagesDeleteError) throw imagesDeleteError;

  const { error: inventoryDeleteError } = await client
    .from("inventory_items")
    .delete()
    .eq("product_id", productId);

  if (inventoryDeleteError) throw inventoryDeleteError;
}

/**
 * Safely delete an admin product listing.
 * Products with order history are hidden — never hard-deleted.
 */
export async function deleteAdminProduct(
  client: SupabaseClient,
  input: { productId: string; confirm: boolean }
): Promise<AdminProductDeleteResult> {
  if (input.confirm !== true) {
    return {
      deleted: false,
      reason: "not_confirmed",
      message: "Deletion requires confirm: true.",
    };
  }

  const productId = input.productId.trim();
  const product = await loadProduct(client, productId);
  if (!product) {
    return {
      deleted: false,
      reason: "not_found",
      message: "Product not found.",
    };
  }

  const hasOrders = await productHasOrderHistory(client, productId);
  if (hasOrders) {
    return hideProduct(client, product);
  }

  try {
    await deleteProductDependents(client, productId);
  } catch (error) {
    logServerError("admin product delete dependents", error);
    return {
      deleted: false,
      reason: "delete_failed",
      message: "Could not remove product images or inventory.",
      productId,
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

export const ADMIN_BULK_DELETE_MAX = 50;

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

/**
 * Safely delete multiple admin products in one bounded batch.
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

  for (const productId of uniqueIds) {
    const outcome = await deleteAdminProduct(client, {
      productId,
      confirm: true,
    });

    const item: AdminProductBulkDeleteItemResult = {
      ...outcome,
      productId: outcome.productId ?? productId,
    };
    summary.results.push(item);

    if (outcome.deleted) {
      summary.deleted += 1;
      continue;
    }

    if (outcome.reason === "has_order_history" && outcome.hidden) {
      summary.hidden += 1;
      continue;
    }

    if (outcome.reason === "not_found") {
      summary.notFound += 1;
      continue;
    }

    summary.failed += 1;
  }

  return summary;
}
