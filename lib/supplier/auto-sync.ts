import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/errors";
import { getVndToMyrRate } from "@/lib/exchange-rate";
import {
  calculateSupplierSellingPrice,
  getDefaultMarkupPercent,
  getMaxAutoPriceChangePercent,
  isAutoPriceChangeAllowed,
  calculateSellingPriceChangePercent,
} from "@/lib/supplier/pricing";
import {
  normalizeSupplierSourceStatus,
  type SupplierSourceStatus,
} from "@/lib/supplier/status";
import {
  SYNCABLE_PRODUCT_SELECT,
  type SyncableProductRow,
} from "@/lib/supplier/sync-diff";
import { supplierProductToDbFields } from "@/lib/supplier/sync";
import type { SupplierProduct } from "@/lib/supplier/types";
import { zinkgameAdapter } from "@/lib/supplier/zinkgame";
import { fetchAllowedCategoryListings } from "@/lib/supplier/zinkgame";

const SOURCE = "zinkgame";
export const DETAIL_CONCURRENCY = 3;

export type AutoSyncAction =
  | "price_updated"
  | "status_updated"
  | "unchanged"
  | "requires_review"
  | "error"
  | "skipped"
  | "new";

export type AutoSyncDetail = {
  productId: string;
  externalProductId: string;
  title: string;
  action: AutoSyncAction;
  oldPrice: number | null;
  newPrice: number | null;
  priceChangePercent: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  reason: string | null;
};

export type AutoSyncResult = {
  dryRun: boolean;
  sourceUnavailable?: boolean;
  checked: number;
  priceUpdated: number;
  statusUpdated: number;
  unchanged: number;
  requiresReview: number;
  errors: number;
  skipped: number;
  newProducts: number;
  wouldUpdatePrice?: number;
  wouldUpdateStatus?: number;
  details: AutoSyncDetail[];
};

export type AutoSyncPlan = {
  wouldUpdatePrice: boolean;
  wouldUpdateStatus: boolean;
  requiresReview: boolean;
  priceChangePercent: number | null;
  newSellingPrice: number | null;
  newCostMyr: number | null;
  newStorefrontStatus: string | null;
  updateSourceStatus: boolean;
  newSourceStatus: SupplierSourceStatus | null;
  reason: string | null;
};

export type AutoSyncPricing = {
  sourcePrice: number;
  costMyr: number;
  sellingPriceMyr: number;
  exchangeRate: number;
};

function sourcePricesDiffer(
  left: number | null | undefined,
  right: number,
  epsilon = 0.005
): boolean {
  const a = left ?? null;
  if (a == null) return true;
  return Math.abs(a - right) > epsilon;
}

function computePricingFromLive(
  product: SupplierProduct,
  exchangeRate: number,
  markupPercent: number
): AutoSyncPricing | null {
  if (product.price <= 0 || product.currency.trim().toUpperCase() !== "VND") {
    return null;
  }

  try {
    const pricing = calculateSupplierSellingPrice({
      supplierPrice: product.price,
      supplierCurrency: "VND",
      markupPercent,
      exchangeRate,
    });

    return {
      sourcePrice: product.price,
      costMyr: pricing.costMyr,
      sellingPriceMyr: pricing.sellingPriceMyr,
      exchangeRate,
    };
  } catch {
    return null;
  }
}

/** Storefront status rules for safe automatic sync. */
export function resolveAutoStorefrontStatus(
  storefrontStatus: string | null | undefined,
  supplierStatus: SupplierSourceStatus
): {
  updateStorefront: boolean;
  newStorefrontStatus: string | null;
  updateSourceStatus: boolean;
} {
  const current = storefrontStatus?.trim() || "available";

  switch (supplierStatus) {
    case "active":
      return {
        updateStorefront: false,
        newStorefrontStatus: null,
        updateSourceStatus: true,
      };
    case "sold":
      return {
        updateStorefront: current === "available",
        newStorefrontStatus: current === "available" ? "sold" : null,
        updateSourceStatus: true,
      };
    case "delisted":
    case "unavailable":
      return {
        updateStorefront: current === "available",
        newStorefrontStatus: current === "available" ? "hidden" : null,
        updateSourceStatus: true,
      };
    case "error":
    case "unknown":
    default:
      return {
        updateStorefront: false,
        newStorefrontStatus: null,
        updateSourceStatus: false,
      };
  }
}

/** Evaluate safe automatic price/status updates for one imported product. */
export function evaluateAutoSyncPlan(
  existing: SyncableProductRow,
  liveProduct: SupplierProduct,
  pricing: AutoSyncPricing,
  options: { maxPriceChangePercent?: number } = {}
): AutoSyncPlan {
  const maxPriceChangePercent =
    options.maxPriceChangePercent ?? getMaxAutoPriceChangePercent(SOURCE);
  const supplierStatus =
    normalizeSupplierSourceStatus(liveProduct.status) ?? "unknown";
  const storefrontRules = resolveAutoStorefrontStatus(
    existing.status,
    supplierStatus
  );

  const oldSourceStatus =
    normalizeSupplierSourceStatus(existing.source_status) ?? "unknown";
  const statusWouldChange =
    storefrontRules.updateSourceStatus &&
    oldSourceStatus !== supplierStatus;
  const storefrontWouldChange =
    storefrontRules.updateStorefront &&
    storefrontRules.newStorefrontStatus != null &&
    existing.status !== storefrontRules.newStorefrontStatus;

  let wouldUpdatePrice = false;
  let requiresReview = false;
  let priceChangePercent: number | null = null;
  let priceReason: string | null = null;

  if (supplierStatus === "error" || supplierStatus === "unknown") {
    return {
      wouldUpdatePrice: false,
      wouldUpdateStatus: false,
      requiresReview: false,
      priceChangePercent: null,
      newSellingPrice: null,
      newCostMyr: null,
      newStorefrontStatus: null,
      updateSourceStatus: false,
      newSourceStatus: null,
      reason:
        supplierStatus === "error"
          ? "supplier_status_error"
          : "supplier_status_unknown",
    };
  }

  if (sourcePricesDiffer(existing.source_price, pricing.sourcePrice)) {
    const oldSelling = Number(existing.price);
    priceChangePercent = calculateSellingPriceChangePercent(
      oldSelling,
      pricing.sellingPriceMyr
    );

    if (
      isAutoPriceChangeAllowed(
        oldSelling,
        pricing.sellingPriceMyr,
        maxPriceChangePercent
      )
    ) {
      wouldUpdatePrice = true;
    } else {
      requiresReview = true;
      priceReason = "price_change_requires_review";
    }
  }

  const wouldUpdateStatus = statusWouldChange || storefrontWouldChange;

  return {
    wouldUpdatePrice,
    wouldUpdateStatus,
    requiresReview,
    priceChangePercent,
    newSellingPrice: pricing.sellingPriceMyr,
    newCostMyr: pricing.costMyr,
    newStorefrontStatus: storefrontRules.newStorefrontStatus,
    updateSourceStatus: storefrontRules.updateSourceStatus,
    newSourceStatus: storefrontRules.updateSourceStatus ? supplierStatus : null,
    reason: priceReason,
  };
}

function resolveDetailAction(plan: AutoSyncPlan, hadError: boolean): AutoSyncAction {
  if (hadError) return "error";
  if (plan.requiresReview) return "requires_review";
  if (plan.wouldUpdatePrice && plan.wouldUpdateStatus) return "price_updated";
  if (plan.wouldUpdateStatus) return "status_updated";
  if (plan.wouldUpdatePrice) return "price_updated";
  return "unchanged";
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

async function reloadSyncableProduct(
  client: SupabaseClient,
  productId: string,
  externalProductId: string
): Promise<SyncableProductRow | null> {
  const { data, error } = await client
    .from("products")
    .select(SYNCABLE_PRODUCT_SELECT)
    .eq("id", productId)
    .eq("source", SOURCE)
    .eq("source_product_id", externalProductId)
    .maybeSingle();

  if (error) throw error;
  return (data as SyncableProductRow | null) ?? null;
}

async function applyAutoSyncUpdate(
  client: SupabaseClient,
  existing: SyncableProductRow,
  liveProduct: SupplierProduct,
  plan: AutoSyncPlan,
  pricing: AutoSyncPricing,
  nowIso: string
): Promise<boolean> {
  const fresh = await reloadSyncableProduct(
    client,
    existing.id,
    liveProduct.externalProductId.toLowerCase()
  );

  if (
    !fresh ||
    fresh.source?.trim().toLowerCase() !== SOURCE ||
    fresh.source_product_id?.toLowerCase() !==
      liveProduct.externalProductId.toLowerCase()
  ) {
    return false;
  }

  const supplierFields = supplierProductToDbFields(liveProduct, {
    checkedAt: nowIso,
    syncedAt: nowIso,
    syncError: null,
  });

  const updatePayload: Record<string, unknown> = {
    last_source_check_at: nowIso,
    last_synced_at: nowIso,
    sync_error: null,
    updated_at: nowIso,
  };

  if (plan.updateSourceStatus && plan.newSourceStatus) {
    updatePayload.source_status = plan.newSourceStatus;
    updatePayload.source_product_url = supplierFields.source_product_url;
  }

  if (plan.wouldUpdatePrice) {
    updatePayload.cost_vnd = pricing.sourcePrice;
    updatePayload.cost_myr = pricing.costMyr;
    updatePayload.vnd_myr_rate = pricing.exchangeRate;
    updatePayload.cost_currency = "VND";
    updatePayload.cost_rate_updated_at = nowIso;
    updatePayload.price = pricing.sellingPriceMyr;
    updatePayload.currency = "MYR";
    updatePayload.source_price = pricing.sourcePrice;
    updatePayload.source_currency = "VND";
    if (plan.newSourceStatus) {
      updatePayload.source_status = plan.newSourceStatus;
    }
  }

  if (plan.wouldUpdateStatus && plan.newStorefrontStatus) {
    updatePayload.status = plan.newStorefrontStatus;
  }

  const { error } = await client
    .from("products")
    .update(updatePayload)
    .eq("id", fresh.id)
    .eq("source", SOURCE)
    .eq("source_product_id", fresh.source_product_id);

  if (error) {
    logServerError("auto sync update", error);
    return false;
  }

  return true;
}

async function applyErrorOnlyUpdate(
  client: SupabaseClient,
  productId: string,
  externalProductId: string,
  message: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  await client
    .from("products")
    .update({
      last_source_check_at: nowIso,
      sync_error: message,
      updated_at: nowIso,
    })
    .eq("id", productId)
    .eq("source", SOURCE)
    .eq("source_product_id", externalProductId);
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;

  let index = 0;
  async function runWorker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }

  const poolSize = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
}

type WorkItem = {
  existing: SyncableProductRow;
  externalProductId: string;
};

export async function runSafeAutoSync(
  client: SupabaseClient,
  input: {
    confirm: boolean;
    page?: number;
    listingItems?: Array<{
      externalProductId: string;
      title?: string | null;
    }>;
  }
): Promise<AutoSyncResult> {
  const dryRun = input.confirm !== true;
  const markupPercent = getDefaultMarkupPercent(SOURCE);
  const maxPriceChangePercent = getMaxAutoPriceChangePercent(SOURCE);

  const result: AutoSyncResult = {
    dryRun,
    checked: 0,
    priceUpdated: 0,
    statusUpdated: 0,
    unchanged: 0,
    requiresReview: 0,
    errors: 0,
    skipped: 0,
    newProducts: 0,
    wouldUpdatePrice: 0,
    wouldUpdateStatus: 0,
    details: [],
  };

  let listing: { items: Array<{ externalProductId: string; title?: string | null }> };
  try {
    if (input.listingItems) {
      listing = { items: input.listingItems };
    } else {
      const fetched = await fetchAllowedCategoryListings();
      if (fetched.items.length === 0 && fetched.errors.length > 0) {
        throw new Error(
          fetched.errors[0]?.message ?? "Allowed category listing fetch failed."
        );
      }
      listing = { items: fetched.items };
    }
  } catch (error) {
    logServerError("auto sync listing fetch", error);
    return {
      ...result,
      sourceUnavailable: true,
      errors: 1,
      details: [
        {
          productId: "",
          externalProductId: "",
          title: "",
          action: "error",
          oldPrice: null,
          newPrice: null,
          priceChangePercent: null,
          oldStatus: null,
          newStatus: null,
          reason:
            error instanceof Error
              ? error.message
              : "ZinkGame listing fetch failed.",
        },
      ],
    };
  }

  let exchangeRate: number;
  try {
    const rateResult = await getVndToMyrRate();
    exchangeRate = rateResult.rate;
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      throw new Error("Exchange rate is invalid.");
    }
  } catch (error) {
    logServerError("auto sync exchange rate", error);
    return {
      ...result,
      sourceUnavailable: true,
      errors: 1,
      details: [
        {
          productId: "",
          externalProductId: "",
          title: "",
          action: "error",
          oldPrice: null,
          newPrice: null,
          priceChangePercent: null,
          oldStatus: null,
          newStatus: null,
          reason: "Exchange rate unavailable.",
        },
      ],
    };
  }

  const existingMap = await loadAllSyncableProducts(client, SOURCE);
  const workItems: WorkItem[] = [];

  for (const item of listing.items) {
    const externalProductId = item.externalProductId.toLowerCase();
    const existing = existingMap.get(externalProductId);
    if (!existing) {
      result.newProducts += 1;
      result.details.push({
        productId: "",
        externalProductId,
        title: item.title ?? externalProductId,
        action: "new",
        oldPrice: null,
        newPrice: null,
        priceChangePercent: null,
        oldStatus: null,
        newStatus: null,
        reason: "new_product_not_imported",
      });
      continue;
    }
    workItems.push({ existing, externalProductId });
  }

  await processWithConcurrency(workItems, DETAIL_CONCURRENCY, async (work) => {
    result.checked += 1;
    const { existing, externalProductId } = work;

    if (
      existing.source?.trim().toLowerCase() !== SOURCE ||
      !existing.source_product_id ||
      existing.source_product_id.toLowerCase() !== externalProductId
    ) {
      result.skipped += 1;
      result.details.push({
        productId: existing.id,
        externalProductId,
        title: existing.title,
        action: "skipped",
        oldPrice: existing.price,
        newPrice: null,
        priceChangePercent: null,
        oldStatus: existing.status,
        newStatus: null,
        reason: "wrong_source_or_external_id",
      });
      return;
    }

    let liveProduct: SupplierProduct;
    try {
      liveProduct = await zinkgameAdapter.getProduct({ productId: externalProductId });
    } catch (error) {
      result.errors += 1;
      const message =
        error instanceof Error ? error.message : "Supplier detail fetch failed.";
      if (!dryRun) {
        await applyErrorOnlyUpdate(client, existing.id, externalProductId, message);
      }
      result.details.push({
        productId: existing.id,
        externalProductId,
        title: existing.title,
        action: "error",
        oldPrice: existing.price,
        newPrice: null,
        priceChangePercent: null,
        oldStatus: existing.status,
        newStatus: null,
        reason: message,
      });
      return;
    }

    if (
      liveProduct.externalProductId.toLowerCase() !== externalProductId ||
      liveProduct.source.trim().toLowerCase() !== SOURCE
    ) {
      result.skipped += 1;
      result.details.push({
        productId: existing.id,
        externalProductId,
        title: existing.title,
        action: "skipped",
        oldPrice: existing.price,
        newPrice: null,
        priceChangePercent: null,
        oldStatus: existing.status,
        newStatus: null,
        reason: "supplier_identity_mismatch",
      });
      return;
    }

    const pricing = computePricingFromLive(liveProduct, exchangeRate, markupPercent);
    if (!pricing) {
      result.errors += 1;
      const message = "Pricing unavailable for supplier product.";
      if (!dryRun) {
        await applyErrorOnlyUpdate(client, existing.id, externalProductId, message);
      }
      result.details.push({
        productId: existing.id,
        externalProductId,
        title: existing.title,
        action: "error",
        oldPrice: existing.price,
        newPrice: null,
        priceChangePercent: null,
        oldStatus: existing.status,
        newStatus: null,
        reason: message,
      });
      return;
    }

    const plan = evaluateAutoSyncPlan(existing, liveProduct, pricing, {
      maxPriceChangePercent,
    });

    if (
      plan.reason === "supplier_status_error" ||
      plan.reason === "supplier_status_unknown"
    ) {
      result.unchanged += 1;
      if (!dryRun) {
        await applyErrorOnlyUpdate(
          client,
          existing.id,
          externalProductId,
          plan.reason
        );
      }
      result.details.push({
        productId: existing.id,
        externalProductId,
        title: existing.title,
        action: "unchanged",
        oldPrice: existing.price,
        newPrice: null,
        priceChangePercent: null,
        oldStatus: existing.status,
        newStatus: existing.status,
        reason: plan.reason,
      });
      return;
    }

    const effectivePriceUpdate = plan.wouldUpdatePrice && !plan.requiresReview;
    const effectiveStatusUpdate = plan.wouldUpdateStatus;

    if (plan.requiresReview) {
      result.requiresReview += 1;
    }

    if (effectivePriceUpdate) {
      result.wouldUpdatePrice = (result.wouldUpdatePrice ?? 0) + 1;
    }

    if (effectiveStatusUpdate) {
      result.wouldUpdateStatus = (result.wouldUpdateStatus ?? 0) + 1;
    }

    const action = resolveDetailAction(plan, false);

    if (action === "unchanged" && !effectivePriceUpdate && !effectiveStatusUpdate) {
      result.unchanged += 1;
      if (!dryRun) {
        const nowIso = new Date().toISOString();
        await client
          .from("products")
          .update({
            last_synced_at: nowIso,
            last_source_check_at: nowIso,
            sync_error: null,
            updated_at: nowIso,
          })
          .eq("id", existing.id)
          .eq("source", SOURCE)
          .eq("source_product_id", existing.source_product_id);
      }
    } else if (!dryRun && (effectivePriceUpdate || effectiveStatusUpdate)) {
      const applyPlan: AutoSyncPlan = {
        ...plan,
        wouldUpdatePrice: effectivePriceUpdate,
      };
      const applied = await applyAutoSyncUpdate(
        client,
        existing,
        liveProduct,
        applyPlan,
        pricing,
        new Date().toISOString()
      );

      if (!applied) {
        result.errors += 1;
        result.details.push({
          productId: existing.id,
          externalProductId,
          title: existing.title,
          action: "error",
          oldPrice: existing.price,
          newPrice: plan.newSellingPrice,
          priceChangePercent: plan.priceChangePercent,
          oldStatus: existing.status,
          newStatus: plan.newStorefrontStatus,
          reason: "update_failed_or_stale_product",
        });
        return;
      }

      if (effectivePriceUpdate) result.priceUpdated += 1;
      if (effectiveStatusUpdate) result.statusUpdated += 1;
    }

    result.details.push({
      productId: existing.id,
      externalProductId,
      title: existing.title,
      action,
      oldPrice: existing.price,
      newPrice: plan.newSellingPrice,
      priceChangePercent: plan.priceChangePercent,
      oldStatus: existing.status,
      newStatus: plan.newStorefrontStatus ?? existing.status,
      reason: plan.reason,
    });
  });

  return result;
}
