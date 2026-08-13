import { buildSupplierDescription } from "@/lib/supplier/description";
import type { SupplierPreviewResult } from "@/lib/supplier/preview";
import {
  isSupplierDelisted,
  normalizeSupplierSourceStatus,
  type SupplierSourceStatus,
} from "@/lib/supplier/status";

export type SupplierSyncStatus =
  | "new"
  | "unchanged"
  | "price_changed"
  | "title_changed"
  | "status_changed"
  | "multiple_changes"
  | "delisted"
  | "error";

export type FieldChange<T> = {
  old: T;
  new: T;
};

export type SupplierSyncDiff = {
  productId: string | null;
  source: string;
  externalProductId: string;
  syncStatus: SupplierSyncStatus;
  originalTitle: string;
  currentTitle: string | null;
  newTranslatedTitle: string;
  markupPercent: number;
  profitMyr: { old: number | null; new: number | null };
  storefrontStatus: string | null;
  storefrontRecommendation: string | null;
  storefrontReviewMessage: string | null;
  imageImportStatus: "pending";
  canSync: boolean;
  syncMessage: string | null;
  changes: {
    title?: FieldChange<string>;
    price?: FieldChange<number>;
    sourcePrice?: FieldChange<number>;
    costMyr?: FieldChange<number>;
    sourceStatus?: FieldChange<string>;
    description?: FieldChange<string>;
    images?: {
      changed: boolean;
      oldCount: number;
      newCount: number;
    };
  };
};

export type SyncableProductRow = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  status: string;
  supplier_name: string | null;
  cost_vnd: number | null;
  cost_myr: number | null;
  vnd_myr_rate: number | null;
  cost_currency: string | null;
  source: string | null;
  source_product_id: string | null;
  source_product_url: string | null;
  source_status: string | null;
  source_price: number | null;
  source_currency: string | null;
  last_synced_at: string | null;
  last_source_check_at: string | null;
  sync_error: string | null;
};

export const SYNCABLE_PRODUCT_SELECT =
  "id,title,description,price,currency,status,supplier_name,cost_vnd,cost_myr,vnd_myr_rate,cost_currency,source,source_product_id,source_product_url,source_status,source_price,source_currency,last_synced_at,last_source_check_at,sync_error";

function numbersDiffer(
  left: number | null | undefined,
  right: number | null | undefined,
  epsilon = 0.005
): boolean {
  const a = left ?? null;
  const b = right ?? null;
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  return Math.abs(a - b) > epsilon;
}

function stringsDiffer(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  return (left ?? "").trim() !== (right ?? "").trim();
}

export function getStorefrontSyncRecommendation(
  storefrontStatus: string | null | undefined,
  newSupplierStatus: SupplierSourceStatus
): { recommendation: string | null; message: string | null } {
  const current = storefrontStatus?.trim() || "available";

  if (isSupplierDelisted(newSupplierStatus) && current === "available") {
    return {
      recommendation: "sold",
      message: "Supplier sold/delisted — storefront status requires review.",
    };
  }

  return { recommendation: null, message: null };
}

export function determineSyncStatus(
  changes: SupplierSyncDiff["changes"],
  oldSupplierStatus: string | null | undefined,
  newSupplierStatus: SupplierSourceStatus
): SupplierSyncStatus {
  const normalizedOld = normalizeSupplierSourceStatus(oldSupplierStatus);
  const becameDelisted =
    (newSupplierStatus === "delisted" || newSupplierStatus === "unavailable") &&
    normalizedOld !== newSupplierStatus;

  if (becameDelisted) return "delisted";

  const flags: string[] = [];
  if (changes.title) flags.push("title");
  if (changes.price || changes.sourcePrice || changes.costMyr) flags.push("price");
  if (changes.sourceStatus) flags.push("status");
  if (changes.description) flags.push("description");
  if (changes.images?.changed) flags.push("images");

  if (flags.length === 0) return "unchanged";
  if (flags.length > 1) return "multiple_changes";
  if (changes.price || changes.sourcePrice || changes.costMyr) return "price_changed";
  if (changes.title) return "title_changed";
  if (changes.sourceStatus) return "status_changed";
  return "multiple_changes";
}

export function computeSupplierSyncDiff(
  existing: SyncableProductRow | null,
  live: SupplierPreviewResult,
  options: { existingImageCount?: number } = {}
): SupplierSyncDiff {
  const externalProductId = live.product.externalProductId;
  const newSupplierStatus =
    normalizeSupplierSourceStatus(live.product.status) ?? "unknown";
  const newDescription = buildSupplierDescription(
    live.originalTitle,
    live.product.description
  );
  const newImageCount = live.images?.length ?? 0;
  const existingImageCount = options.existingImageCount ?? 0;

  if (!existing) {
    return {
      productId: null,
      source: live.source,
      externalProductId,
      syncStatus: "new",
      originalTitle: live.originalTitle,
      currentTitle: null,
      newTranslatedTitle: live.translatedTitle,
      markupPercent: live.markupPercent,
      profitMyr: { old: null, new: live.profitMyr },
      storefrontStatus: null,
      storefrontRecommendation: null,
      storefrontReviewMessage: null,
      imageImportStatus: "pending",
      canSync: false,
      syncMessage: "New supplier listing — use Import instead of Sync.",
      changes: {},
    };
  }

  if (live.pricingError || live.sellingPriceMyr == null || live.costMyr == null) {
    return {
      productId: existing.id,
      source: live.source,
      externalProductId,
      syncStatus: "error",
      originalTitle: live.originalTitle,
      currentTitle: existing.title,
      newTranslatedTitle: live.translatedTitle,
      markupPercent: live.markupPercent,
      profitMyr: { old: null, new: live.profitMyr },
      storefrontStatus: existing.status,
      storefrontRecommendation: null,
      storefrontReviewMessage: null,
      imageImportStatus: "pending",
      canSync: false,
      syncMessage: live.pricingError ?? "Pricing unavailable.",
      changes: {},
    };
  }

  const changes: SupplierSyncDiff["changes"] = {};

  if (stringsDiffer(existing.title, live.translatedTitle)) {
    changes.title = { old: existing.title, new: live.translatedTitle };
  }

  if (numbersDiffer(existing.source_price, live.sourcePrice)) {
    changes.sourcePrice = {
      old: Number(existing.source_price ?? 0),
      new: live.sourcePrice,
    };
  }

  if (numbersDiffer(existing.cost_myr, live.costMyr)) {
    changes.costMyr = {
      old: Number(existing.cost_myr ?? 0),
      new: live.costMyr,
    };
  }

  if (numbersDiffer(existing.price, live.sellingPriceMyr)) {
    changes.price = {
      old: Number(existing.price),
      new: live.sellingPriceMyr,
    };
  }

  const oldSupplierStatus =
    normalizeSupplierSourceStatus(existing.source_status) ?? "unknown";
  if (oldSupplierStatus !== newSupplierStatus) {
    changes.sourceStatus = {
      old: oldSupplierStatus,
      new: newSupplierStatus,
    };
  }

  if (stringsDiffer(existing.description, newDescription)) {
    changes.description = {
      old: existing.description ?? "",
      new: newDescription,
    };
  }

  const imagesChanged = existingImageCount !== newImageCount;
  if (imagesChanged) {
    changes.images = {
      changed: true,
      oldCount: existingImageCount,
      newCount: newImageCount,
    };
  }

  const syncStatus = determineSyncStatus(
    changes,
    existing.source_status,
    newSupplierStatus
  );

  const storefront = getStorefrontSyncRecommendation(
    existing.status,
    newSupplierStatus
  );

  const oldProfit =
    existing.price != null && existing.cost_myr != null
      ? Math.round((Number(existing.price) - Number(existing.cost_myr)) * 100) /
        100
      : null;

  return {
    productId: existing.id,
    source: live.source,
    externalProductId,
    syncStatus,
    originalTitle: live.originalTitle,
    currentTitle: existing.title,
    newTranslatedTitle: live.translatedTitle,
    markupPercent: live.markupPercent,
    profitMyr: { old: oldProfit, new: live.profitMyr },
    storefrontStatus: existing.status,
    storefrontRecommendation: storefront.recommendation,
    storefrontReviewMessage: storefront.message,
    imageImportStatus: "pending",
    canSync: true,
    syncMessage:
      syncStatus === "unchanged"
        ? "No supplier-owned changes detected."
        : null,
    changes,
  };
}

export function summarizeSyncDiffs(diffs: SupplierSyncDiff[]): Record<string, number> {
  const summary: Record<string, number> = {
    new: 0,
    unchanged: 0,
    price_changed: 0,
    status_changed: 0,
    title_changed: 0,
    multiple_changes: 0,
    delisted: 0,
    error: 0,
  };

  for (const diff of diffs) {
    summary[diff.syncStatus] = (summary[diff.syncStatus] ?? 0) + 1;
  }

  return summary;
}
