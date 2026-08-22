import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/errors";
import { getVndToMyrRate } from "@/lib/exchange-rate";
import { buildSupplierDescription } from "@/lib/supplier/description";
import { buildSupplierProductPreview } from "@/lib/supplier/preview";
import { getDefaultMarkupPercent } from "@/lib/supplier/pricing";
import {
  computeSupplierSyncDiff,
  summarizeSyncDiffs,
  SYNCABLE_PRODUCT_SELECT,
  type SupplierSyncDiff,
  type SyncableProductRow,
} from "@/lib/supplier/sync-diff";
import { supplierProductToDbFields } from "@/lib/supplier/sync";
import { zinkgameAdapter } from "@/lib/supplier/zinkgame";

const SOURCE = "zinkgame";

export type SyncPreviewInput = {
  productId?: string;
  externalProductId?: string;
  url?: string;
};

export type SyncApplyInput = {
  productId: string;
  confirm: true;
};

export type SyncApplySuccess = {
  synced: true;
  productId: string;
  syncStatus: SupplierSyncDiff["syncStatus"];
  updatedFields: string[];
};

export type SyncApplyFailure = {
  synced: false;
  reason: "not_found" | "invalid_source" | "fetch_failed" | "pricing_error" | "not_confirmed" | "sync_failed";
  message?: string;
};

export type ListingSyncPreviewResult = {
  source: string;
  page: number;
  pagination: Awaited<ReturnType<typeof zinkgameAdapter.getListingPage>>["pagination"];
  warnings: string[];
  summary: Record<string, number>;
  items: Array<
    SupplierSyncDiff & {
      sourcePrice: number;
      translatedTitle: string;
    }
  >;
};

async function loadSyncableProductById(
  client: SupabaseClient,
  productId: string
): Promise<SyncableProductRow | null> {
  const { data, error } = await client
    .from("products")
    .select(SYNCABLE_PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  return (data as SyncableProductRow | null) ?? null;
}

async function loadSyncableProductByExternalId(
  client: SupabaseClient,
  source: string,
  externalProductId: string
): Promise<SyncableProductRow | null> {
  const { data, error } = await client
    .from("products")
    .select(SYNCABLE_PRODUCT_SELECT)
    .eq("source", source)
    .eq("source_product_id", externalProductId)
    .maybeSingle();

  if (error) throw error;
  return (data as SyncableProductRow | null) ?? null;
}

async function loadAllSyncableProducts(
  client: SupabaseClient,
  source: string
): Promise<Map<string, SyncableProductRow>> {
  const { data, error } = await client
    .from("products")
    .select(SYNCABLE_PRODUCT_SELECT)
    .eq("source", source);

  if (error) throw error;

  const map = new Map<string, SyncableProductRow>();
  for (const row of (data ?? []) as SyncableProductRow[]) {
    if (row.source_product_id) {
      map.set(row.source_product_id.toLowerCase(), row);
    }
  }
  return map;
}

async function loadImageCounts(
  client: SupabaseClient,
  productIds: string[]
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();

  const { data, error } = await client
    .from("product_images")
    .select("product_id")
    .in("product_id", productIds);

  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const id = row.product_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

async function fetchLivePreview(externalProductId: string, url?: string) {
  const supplierProduct = await zinkgameAdapter.getProduct(
    url?.trim() ? { url: url.trim() } : { productId: externalProductId }
  );
  const preview = await buildSupplierProductPreview(supplierProduct, {
    markupPercent: getDefaultMarkupPercent(SOURCE),
  });
  return preview;
}

export async function buildSupplierSyncPreview(
  client: SupabaseClient,
  input: SyncPreviewInput
): Promise<SupplierSyncDiff & { livePreview?: Awaited<ReturnType<typeof buildSupplierProductPreview>> }> {
  let existing: SyncableProductRow | null = null;
  let externalProductId = input.externalProductId?.trim().toLowerCase() ?? "";

  if (input.productId?.trim()) {
    existing = await loadSyncableProductById(client, input.productId.trim());
    if (existing?.source_product_id) {
      externalProductId = existing.source_product_id.toLowerCase();
    }
  }

  if (!externalProductId && input.url?.trim()) {
    const live = await fetchLivePreview("", input.url.trim());
    externalProductId = live.product.externalProductId;
    if (!existing) {
      existing = await loadSyncableProductByExternalId(
        client,
        SOURCE,
        externalProductId
      );
    }
  }

  if (!externalProductId) {
    throw new Error("Unable to resolve supplier product id.");
  }

  const livePreview = await fetchLivePreview(
    externalProductId,
    input.url?.trim() || undefined
  );

  if (!existing) {
    existing = await loadSyncableProductByExternalId(
      client,
      SOURCE,
      externalProductId
    );
  }

  const imageCounts = existing
    ? await loadImageCounts(client, [existing.id])
    : new Map<string, number>();

  const diff = computeSupplierSyncDiff(existing, livePreview, {
    existingImageCount: existing ? imageCounts.get(existing.id) ?? 0 : 0,
  });

  return { ...diff, livePreview };
}

export async function buildListingSyncPreview(
  client: SupabaseClient,
  page = 1
): Promise<ListingSyncPreviewResult> {
  const listing = await zinkgameAdapter.getListingPage(page);
  const existingMap = await loadAllSyncableProducts(client, SOURCE);
  const imageCounts = await loadImageCounts(
    client,
    Array.from(existingMap.values()).map((row) => row.id)
  );

  const items: ListingSyncPreviewResult["items"] = [];

  for (const item of listing.items) {
    const externalProductId = item.externalProductId.toLowerCase();
    const existing = existingMap.get(externalProductId) ?? null;

    if (!existing) {
      items.push({
        productId: null,
        source: SOURCE,
        externalProductId,
        syncStatus: "new",
        originalTitle: item.title ?? externalProductId,
        currentTitle: null,
        newTranslatedTitle: item.title ?? externalProductId,
        markupPercent: getDefaultMarkupPercent(SOURCE),
        profitMyr: { old: null, new: null },
        storefrontStatus: null,
        storefrontRecommendation: null,
        storefrontReviewMessage: null,
        imageImportStatus: "pending",
        canSync: false,
        syncMessage: "New supplier listing — use Import instead of Sync.",
        changes: {},
        sourcePrice: item.price ?? 0,
        translatedTitle: item.title ?? externalProductId,
      });
      continue;
    }

    try {
      const livePreview = await fetchLivePreview(externalProductId);
      const diff = computeSupplierSyncDiff(existing, livePreview, {
        existingImageCount: imageCounts.get(existing.id) ?? 0,
      });
      items.push({
        ...diff,
        sourcePrice: livePreview.sourcePrice,
        translatedTitle: livePreview.translatedTitle,
      });
    } catch (error) {
      logServerError("listing sync preview item", error);
      items.push({
        productId: existing.id,
        source: SOURCE,
        externalProductId,
        syncStatus: "error",
        originalTitle: item.title ?? externalProductId,
        currentTitle: existing.title,
        newTranslatedTitle: existing.title,
        markupPercent: getDefaultMarkupPercent(SOURCE),
        profitMyr: { old: null, new: null },
        storefrontStatus: existing.status,
        storefrontRecommendation: null,
        storefrontReviewMessage: null,
        imageImportStatus: "pending",
        canSync: false,
        syncMessage:
          error instanceof Error ? error.message : "Supplier fetch failed.",
        changes: {},
        sourcePrice: item.price ?? 0,
        translatedTitle: existing.title,
      });
    }
  }

  return {
    source: SOURCE,
    page: listing.page,
    pagination: listing.pagination,
    warnings: listing.warnings,
    summary: summarizeSyncDiffs(items),
    items,
  };
}

export async function applySupplierSync(
  client: SupabaseClient,
  input: SyncApplyInput
): Promise<SyncApplySuccess | SyncApplyFailure> {
  if (input.confirm !== true) {
    return {
      synced: false,
      reason: "not_confirmed",
      message: "Sync requires confirm: true.",
    };
  }

  const existing = await loadSyncableProductById(client, input.productId.trim());
  if (!existing) {
    return { synced: false, reason: "not_found", message: "Product not found." };
  }

  if (existing.source?.trim().toLowerCase() !== SOURCE || !existing.source_product_id) {
    return {
      synced: false,
      reason: "invalid_source",
      message: "Only imported ZinkGame products can be synced.",
    };
  }

  let livePreview;
  try {
    livePreview = await fetchLivePreview(existing.source_product_id);
  } catch (error) {
    logServerError("supplier sync fetch", error);
    const nowIso = new Date().toISOString();
    await client
      .from("products")
      .update({
        last_source_check_at: nowIso,
        sync_error:
          error instanceof Error ? error.message : "Supplier fetch failed.",
      })
      .eq("id", existing.id);

    return {
      synced: false,
      reason: "fetch_failed",
      message: "Failed to fetch live supplier data.",
    };
  }

  const imageCounts = await loadImageCounts(client, [existing.id]);
  const diff = computeSupplierSyncDiff(existing, livePreview, {
    existingImageCount: imageCounts.get(existing.id) ?? 0,
  });

  if (!diff.canSync) {
    return {
      synced: false,
      reason: "sync_failed",
      message: diff.syncMessage ?? "Product cannot be synced.",
    };
  }

  if (livePreview.costMyr == null || livePreview.sellingPriceMyr == null) {
    return {
      synced: false,
      reason: "pricing_error",
      message: livePreview.pricingError ?? "Pricing unavailable.",
    };
  }

  let rateResult;
  try {
    rateResult = await getVndToMyrRate();
  } catch (error) {
    logServerError("supplier sync exchange rate", error);
    return {
      synced: false,
      reason: "pricing_error",
      message: "Unable to fetch exchange rate.",
    };
  }

  const nowIso = new Date().toISOString();

  if (diff.syncStatus === "unchanged") {
    const minimalPayload = {
      last_synced_at: nowIso,
      last_source_check_at: nowIso,
      sync_error: null,
      updated_at: nowIso,
    };

    const { error } = await client
      .from("products")
      .update(minimalPayload)
      .eq("id", existing.id)
      .eq("source", SOURCE)
      .eq("source_product_id", existing.source_product_id);

    if (error) {
      logServerError("supplier sync update", error);
      return {
        synced: false,
        reason: "sync_failed",
        message: "Sync update failed.",
      };
    }

    return {
      synced: true,
      productId: existing.id,
      syncStatus: diff.syncStatus,
      updatedFields: Object.keys(minimalPayload),
    };
  }

  const supplierFields = supplierProductToDbFields(livePreview.product, {
    checkedAt: nowIso,
    syncedAt: nowIso,
    syncError: null,
  });

  const updatePayload: Record<string, unknown> = {
    title: livePreview.translatedTitle,
    source_account_code: livePreview.accountCode,
    description: buildSupplierDescription(
      livePreview.originalTitle,
      livePreview.product.description
    ),
    price: livePreview.sellingPriceMyr,
    currency: "MYR",
    supplier_name: "ZinkGame",
    cost_vnd: livePreview.sourcePrice,
    cost_myr: livePreview.costMyr,
    vnd_myr_rate: rateResult.rate,
    cost_currency: "VND",
    cost_rate_updated_at: nowIso,
    source_status: supplierFields.source_status,
    source_price: supplierFields.source_price,
    source_currency: supplierFields.source_currency,
    source_product_url: supplierFields.source_product_url,
    last_synced_at: nowIso,
    last_source_check_at: nowIso,
    sync_error: null,
    updated_at: nowIso,
  };

  const { error } = await client
    .from("products")
    .update(updatePayload)
    .eq("id", existing.id)
    .eq("source", SOURCE)
    .eq("source_product_id", existing.source_product_id);

  if (error) {
    logServerError("supplier sync update", error);
    return {
      synced: false,
      reason: "sync_failed",
      message: "Sync update failed.",
    };
  }

  return {
    synced: true,
    productId: existing.id,
    syncStatus: diff.syncStatus,
    updatedFields: Object.keys(updatePayload),
  };
}
